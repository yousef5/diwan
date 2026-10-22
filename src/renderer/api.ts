import type { ShellChannel, ShellPayload, ShellResult } from '../shared/ipc'
import { cleanError } from './format'
import { useUi } from './state'

// Every call to main goes through here: a failure becomes a toast instead of an unhandled
// rejection, and the caller gets undefined.
export async function call<C extends ShellChannel>(
  channel: C,
  payload?: ShellPayload<C>,
): Promise<ShellResult<C> | undefined> {
  try {
    return await window.diwan.invoke(channel, payload)
  } catch (e) {
    useUi.getState().toast(cleanError(e))
    return undefined
  }
}
