import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'
import type { DiwanApi } from '../shared/api'
import type { SHELL_COMMAND, ShellChannel, ShellPayload, ShellResult, STATE_CHANGED } from '../shared/ipc'
import type { ShellCommand, Snapshot } from '../shared/types'

// Channel names are literals, type-checked against src/shared/ipc.ts: a value import would bundle
// zod into this sandboxed preload, which can only require('electron').
const STATE: typeof STATE_CHANGED = 'state:changed'
const COMMAND: typeof SHELL_COMMAND = 'shell:command'

// Listeners never get the IpcRendererEvent: its `sender` is ipcRenderer itself.
const api = {
  invoke<C extends ShellChannel>(channel: C, payload?: ShellPayload<C>): Promise<ShellResult<C>> {
    return ipcRenderer.invoke(channel, payload)
  },
  onState(cb: (s: Snapshot) => void): () => void {
    const listener = (_e: IpcRendererEvent, s: Snapshot) => cb(s)
    ipcRenderer.on(STATE, listener)
    return () => {
      ipcRenderer.off(STATE, listener)
    }
  },
  onCommand(cb: (c: ShellCommand) => void): () => void {
    const listener = (_e: IpcRendererEvent, c: ShellCommand) => cb(c)
    ipcRenderer.on(COMMAND, listener)
    return () => {
      ipcRenderer.off(COMMAND, listener)
    }
  },
} satisfies DiwanApi

contextBridge.exposeInMainWorld('diwan', api)
