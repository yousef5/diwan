import type { ShellChannel, ShellPayload, ShellResult } from './ipc'
import type { ShellCommand, Snapshot } from './types'

// What the shell preload exposes as window.diwan. The renderer imports this type, never the
// preload itself (that would pull electron and @types/node into renderer type-checking).
export interface DiwanApi {
  invoke<C extends ShellChannel>(channel: C, payload?: ShellPayload<C>): Promise<ShellResult<C>>
  onState(cb: (s: Snapshot) => void): () => void
  onCommand(cb: (c: ShellCommand) => void): () => void
}
