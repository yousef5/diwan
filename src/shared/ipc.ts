import { z } from 'zod'
import type { Account, ImportPlan, ImportResult, Snapshot } from './types'

const Name = z.string().trim().min(1).max(40)
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const Id = z.string().regex(/^[0-9a-f-]{36}$/)
const None = z.undefined()

export const shellChannels = {
  'state:get': None,
  'account:add': z.object({ name: Name, color: Color }),
  'account:update': z.object({
    id: Id,
    patch: z.object({ name: Name.optional(), color: Color.optional(), muted: z.boolean().optional() }),
  }),
  'account:remove': z.object({ id: Id }),
  'account:reorder': z.object({ ids: z.array(Id).max(100) }),
  'account:activate': z.object({ id: Id }),
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
        .optional(),
    })
    .strict(),
  'importer:plan': None,
  'importer:apply': None,
  'app:openDataFolder': None,
  'app:startFresh': None,
  'tray:setBadges': z.record(z.string().max(4), z.string().startsWith('data:image/png;base64,').max(200_000)),
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
      .regex(/^data:image\/(png|jpeg|webp);base64,/)
      .max(2_000_000),
  }),
  'guest:notify': z.object({
    nid: z.string().min(1).max(64),
    title: z.string().max(500),
    body: z.string().max(4000),
    tag: z.string().max(500),
    icon: z.union([
      z.literal(''),
      z
        .string()
        .regex(/^data:image\/(png|jpeg|webp);base64,/)
        .max(3_000_000),
    ]),
    silent: z.boolean(),
  }),
  'guest:notify-close': z.object({ nid: z.string().min(1).max(64) }),
} as const

export type GuestChannel = keyof typeof guestChannels
export type GuestPayload<C extends GuestChannel> = z.output<(typeof guestChannels)[C]>

// main → shell
export const STATE_CHANGED = 'state:changed'
export const SHELL_COMMAND = 'shell:command'
// main → guest
export const NOTIFY_CLICK = 'guest:notify-click'
