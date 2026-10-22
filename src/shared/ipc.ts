import { z } from 'zod'
import { dataUrlFits } from './image-dims'
import type { Account, ImportPlan, ImportResult, Snapshot } from './types'
import { BADGE_KEYS } from './unread'
import { HexColor as Color, AccountId as Id, AccountName as Name } from './validators'

const None = z.undefined()
const NidSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
const IMG_URL = /^data:image\/(png|jpeg);base64,/
const sized = (maxW: number, maxH: number) => (u: string) => dataUrlFits(u, maxW, maxH)
const PngDataUrl = z
  .string()
  .max(200_000, { abort: true })
  .startsWith('data:image/png;base64,')
  .refine(sized(64, 64), 'bad or oversized image')
const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
const anyDefined = (o: Record<string, unknown>) => Object.values(o).some((v) => v !== undefined)

export const shellChannels = {
  'state:get': None,
  'account:add': z.object({ name: Name, color: Color }),
  'account:update': z.object({
    id: Id,
    patch: z
      .object({ name: Name.optional(), color: Color.optional(), muted: z.boolean().optional() })
      .strict()
      .refine(anyDefined, 'empty patch')
      .transform(defined),
  }),
  'account:remove': z.object({ id: Id }),
  'account:reorder': z.object({
    ids: z
      .array(Id)
      .max(100)
      .refine((a) => new Set(a).size === a.length, 'duplicate ids'),
  }),
  'account:activate': z.object({ id: Id }),
  'account:zoom': z.object({ id: Id, delta: z.union([z.literal(1), z.literal(-1), z.literal(0)]) }),
  'account:reload': z.object({ id: Id }),
  'account:logout': z.object({ id: Id }),
  'account:pickAvatar': z.object({ id: Id }),
  'account:clearAvatar': z.object({ id: Id }),
  'settings:update': z
    .object({
      closeToTray: z.boolean().optional(),
      startHidden: z.boolean().optional(),
      showWindowControls: z.boolean().optional(),
      notifications: z
        .object({
          enabled: z.boolean().optional(),
          sound: z.boolean().optional(),
          showPreview: z.boolean().optional(),
          markUrgent: z.boolean().optional(),
        })
        .strict()
        .transform(defined)
        .optional(),
    })
    .strict()
    .refine(
      (p) =>
        anyDefined({ ...p, notifications: p.notifications && anyDefined(p.notifications) ? 1 : undefined }),
      'empty patch',
    )
    .transform(defined),
  'importer:plan': None,
  'importer:apply': None,
  'app:openDataFolder': None,
  'app:startFresh': None,
  'tray:setBadges': z.partialRecord(z.enum(BADGE_KEYS), PngDataUrl),
  'window:minimize': None,
  'window:toggleMaximize': None,
  'window:close': None,
} as const

export type ShellChannel = keyof typeof shellChannels
export type ShellPayload<C extends ShellChannel> = z.input<(typeof shellChannels)[C]>

export interface ShellResults {
  'state:get': Snapshot
  'account:add': Account
  'importer:plan': ImportPlan
  'importer:apply': ImportResult
}
export type ShellResult<C extends ShellChannel> = C extends keyof ShellResults ? ShellResults[C] : undefined

export const guestChannels = {
  'guest:online': z.object({ online: z.boolean() }),
  'guest:avatar': z.object({
    dataUrl: z
      .string()
      .max(2_000_000, { abort: true })
      .regex(IMG_URL)
      .refine(sized(1024, 1024), 'bad or oversized image'),
  }),
  'guest:notify': z.object({
    nid: NidSchema,
    title: z.string().max(500, { abort: true }),
    body: z.string().max(4000, { abort: true }),
    tag: z.string().max(500, { abort: true }),
    icon: z.union([
      z.literal(''),
      z
        .string()
        .max(512_000, { abort: true })
        .regex(IMG_URL)
        .refine(sized(512, 512), 'bad or oversized image'),
    ]),
    silent: z.boolean(),
  }),
  'guest:notify-close': z.object({ nid: NidSchema }),
} as const

export type GuestChannel = keyof typeof guestChannels
export type GuestPayload<C extends GuestChannel> = z.output<(typeof guestChannels)[C]>

// main → shell
export const STATE_CHANGED = 'state:changed'
export const SHELL_COMMAND = 'shell:command'
// main → guest
export const NOTIFY_CLICK = 'guest:notify-click'
