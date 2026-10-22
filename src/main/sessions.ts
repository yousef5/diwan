import { lstatSync } from 'node:fs'
import { basename } from 'node:path'
import { Notification, type Session, session, shell } from 'electron'
import type { Account } from '../shared/types'
import { uniquePath } from './downloads'
import { allowGuestPermission, chromeUserAgent, partitionOf, pickSpellLanguages } from './guest-config'
import type { Logger } from './log'

const configured = new WeakSet<Session>()
const pendingDownloads = new Set<string>()

function lstatExists(p: string): boolean {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

// Must run before the account's <webview> attaches (startup, add, import).
export function setupGuestSession(accountId: string, d: { downloads: string; log: Logger }): Session {
  const ses = session.fromPartition(partitionOf(accountId))
  if (configured.has(ses)) return ses
  configured.add(ses)

  ses.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(allowGuestPermission(permission, details.requestingUrl)),
  )
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    allowGuestPermission(permission, requestingOrigin),
  )
  ses.setUserAgent(chromeUserAgent())
  try {
    ses.setSpellCheckerLanguages(pickSpellLanguages(ses.availableSpellCheckerLanguages))
  } catch (e) {
    d.log.warn('could not set spellchecker languages', e)
  }

  ses.on('will-download', (_event, item) => {
    // Chromium writes *.crdownload and renames at the end, so two same-named downloads in a row
    // would both see the name as free. Reserve it until done. lstat so a dangling symlink isn't "free".
    const taken = (p: string) => pendingDownloads.has(p) || lstatExists(p)
    const target = uniquePath(d.downloads, item.getFilename(), taken)
    pendingDownloads.add(target)
    item.setSavePath(target)
    item.once('done', (_e, state) => {
      pendingDownloads.delete(target)
      if (state !== 'completed') {
        d.log.warn('download did not complete', { state })
        return
      }
      const n = new Notification({ title: 'Saved to Downloads', body: basename(target) })
      n.on('click', () => shell.showItemInFolder(target))
      n.show()
    })
  })
  return ses
}

export function accountForSession(ses: Session, accounts: Account[]): string | undefined {
  return accounts.find((a) => session.fromPartition(partitionOf(a.id)) === ses)?.id
}
