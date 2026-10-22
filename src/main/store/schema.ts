import { z } from 'zod'
import type { DiwanFile, Settings } from '../../shared/types'

export const SCHEMA_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  closeToTray: true,
  startHidden: false,
  showWindowControls: false,
  notifications: { enabled: true, sound: true, showPreview: true, markUrgent: false },
  window: { bounds: null, maximized: false },
}

const clone = <T>(v: T): T => structuredClone(v)

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
export const AccountName = z.string().trim().min(1).max(40)

const AccountSchema = z.object({
  id: z.string().regex(/^[0-9a-f-]{36}$/),
  name: AccountName,
  color: HexColor,
  order: z.number().int().min(0),
  zoom: z.number().int().min(-5).max(5).default(0),
  muted: z.boolean().default(false),
  customAvatar: z.boolean().default(false),
  createdAt: z.string().default(() => new Date().toISOString()),
})

const NotificationsSchema = z.object({
  enabled: z.boolean().default(true),
  sound: z.boolean().default(true),
  showPreview: z.boolean().default(true),
  markUrgent: z.boolean().default(false),
})

const RectSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(200),
  height: z.number().int().min(200),
})

const WindowSchema = z.object({
  bounds: RectSchema.nullable().default(null),
  maximized: z.boolean().default(false),
})

const SettingsSchema = z.object({
  closeToTray: z.boolean().default(true),
  startHidden: z.boolean().default(false),
  showWindowControls: z.boolean().default(false),
  notifications: NotificationsSchema.default(() => clone(DEFAULT_SETTINGS.notifications)),
  window: WindowSchema.default(() => clone(DEFAULT_SETTINGS.window)),
})

const DiwanFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  importedFromNexus: z.boolean().default(false),
  accounts: z.array(AccountSchema).default(() => []),
  settings: SettingsSchema.default(() => clone(DEFAULT_SETTINGS)),
})

// Validates, fills defaults, drops unknown keys and duplicate ids, sorts by order, re-indexes.
export function parseDiwanFile(raw: unknown): DiwanFile {
  const f = DiwanFileSchema.parse(raw)
  const seen = new Set<string>()
  const accounts = f.accounts
    .filter((a) => !seen.has(a.id) && seen.add(a.id))
    .sort((a, b) => a.order - b.order)
    .map((a, i) => ({ ...a, order: i }))
  return { ...f, accounts }
}

export function defaultFile(): DiwanFile {
  return parseDiwanFile({ schemaVersion: SCHEMA_VERSION })
}
