import type { ShellChannel, ShellPayload, ShellResult } from '../shared/ipc'
import { cleanError } from './format'
import { useUi } from './state'

// Every call to main goes through here: a failure becomes an error toast (it stays until
// dismissed) instead of an unhandled rejection, and the caller gets undefined.
export async function call<C extends ShellChannel>(
  channel: C,
  payload?: ShellPayload<C>,
): Promise<ShellResult<C> | undefined> {
  try {
    return await window.diwan.invoke(channel, payload)
  } catch (e) {
    useUi.getState().toast(cleanError(e), { error: true })
    return undefined
  }
}

export type Attempt<T> = { ok: true; value: T } | { ok: false; error: string }

// Like `call`, but the caller shows the failure itself (say, inline in a dialog), so no toast.
export async function attempt<C extends ShellChannel>(
  channel: C,
  payload?: ShellPayload<C>,
): Promise<Attempt<ShellResult<C>>> {
  try {
    return { ok: true, value: await window.diwan.invoke(channel, payload) }
  } catch (e) {
    return { ok: false, error: cleanError(e) }
  }
}
