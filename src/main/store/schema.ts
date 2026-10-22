import { z } from 'zod'
import type { DiwanFile, Settings } from '../../shared/types'
import { AccountId, AccountName, HexColor } from '../../shared/validators'

export { AccountName, HexColor }

export const SCHEMA_VERSION = 1

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  closeToTray: true,
  startHidden: false,
  showWindowControls: false,
  notifications: Object.freeze({ enabled: true, sound: true, showPreview: true, markUrgent: false }),
  window: Object.freeze({ bounds: null, maximized: false }),
})

const clone = <T>(v: T): T => structuredClone(v)

// Stored-file schema: cosmetic fields are repaired instead of rejecting the whole file.
// Only the id (partition identity), the accounts array and schemaVersion stay strict.
const FALLBACK_COLOR = '#71717a'
const FALLBACK_NAME = 'Account'
const bool = (fallback: boolean) => z.boolean().catch(fallback)

const StoredName = AccountName.catch((ctx) =>
  typeof ctx.input === 'string'
    ? ctx.input
        .trim()
        .slice(0, 40)
        .trim()
        .replace(/^[\p{Cf}\s]+$/u, '') || FALLBACK_NAME
    : FALLBACK_NAME,
)
const StoredZoom = z
  .number()
  .int()
  .min(-5)
  .max(5)
  .catch((ctx) =>
    typeof ctx.input === 'number' && Number.isFinite(ctx.input)
      ? Math.max(-5, Math.min(5, Math.round(ctx.input)))
      : 0,
  )

const AccountSchema = z.object({
  id: AccountId,
  name: StoredName,
  color: HexColor.catch(FALLBACK_COLOR),
  order: z.number().finite().catch(0),
  zoom: StoredZoom,
  muted: bool(false),
  customAvatar: bool(false),
  createdAt: z.string().catch(() => new Date().toISOString()),
  importedFrom: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional()
    .catch(undefined),
})

const NotificationsSchema = z.object({
  enabled: bool(true),
  sound: bool(true),
  showPreview: bool(true),
  markUrgent: bool(false),
})

const RectSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(200),
  height: z.number().int().min(200),
})

const WindowSchema = z.object({
  bounds: RectSchema.nullable().catch(null),
  maximized: bool(false),
})

const SettingsSchema = z.object({
  closeToTray: bool(true),
  startHidden: bool(false),
  showWindowControls: bool(false),
  notifications: NotificationsSchema.catch(() => clone(DEFAULT_SETTINGS.notifications)),
  window: WindowSchema.catch(() => clone(DEFAULT_SETTINGS.window)),
})

const DiwanFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  importedFromNexus: z.boolean().default(false).catch(true),
  accounts: z.array(AccountSchema),
  settings: SettingsSchema.catch(() => clone(DEFAULT_SETTINGS)),
  // Added within schema 1 (absent in older files, so it defaults like importedFromNexus). Damage drops
  // the whole list: a lost tombstone only leaves a leftover folder, never deletes one.
  pendingFolderRemovals: z.array(AccountId).catch([]),
})

// Validates, fills defaults, drops unknown keys and duplicate ids, sorts by order, re-indexes.
export function parseDiwanFile(raw: unknown): DiwanFile {
  const f = DiwanFileSchema.parse(raw)
  const seen = new Set<string>()
  const accounts = f.accounts
    .filter((a) => !seen.has(a.id) && seen.add(a.id))
    .sort((a, b) => a.order - b.order)
    .map((a, i) => ({ ...a, order: i }))
  return { ...f, accounts, pendingFolderRemovals: [...new Set(f.pendingFolderRemovals)] }
}

export function defaultFile(): DiwanFile {
  return parseDiwanFile({ schemaVersion: SCHEMA_VERSION, accounts: [] })
}
