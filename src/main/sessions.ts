import { randomUUID } from 'node:crypto'
import { copyFileSync, linkSync, unlinkSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Notification, type Session, session, shell } from 'electron'
import { finalizeDownload, lstatExists, uniquePath } from './downloads'
import { allowGuestPermission, chromeUserAgent, partitionOf, pickSpellLanguages } from './guest-config'
import type { Logger } from './log'
import { escapeNotifyText } from './notify-text'
import { createRateLimiter } from './rate-limit'

const configured = new WeakSet<Session>()
const pendingDownloads = new Set<string>()
const accountBySession = new Map<Session, string>()
const liveNotifications = new Set<Notification>()
const allowDownload = createRateLimiter(10, 10_000)

// Must run before the account's <webview> attaches (startup, add, import).
export function setupGuestSession(accountId: string, d: { downloads: string; log: Logger }): Session {
  const ses = session.fromPartition(partitionOf(accountId))
  if (configured.has(ses)) return ses
  configured.add(ses)
  accountBySession.set(ses, accountId)

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

  ses.on('will-download', (_event, item, wc) => {
    let target: string | undefined
    let stage: string | undefined
    try {
      if (!allowDownload(wc?.id ?? -1)) {
        item.cancel()
        d.log.warn('download dropped: too many in 10 s')
        return
      }
      // Chromium writes *.crdownload and renames at the end, so two same-named downloads in a row
      // would both see the name as free. Reserve the final name until done, and download into a
      // hidden staging file that is hard-linked to a free name at the end (never overwrites).
      const taken = (p: string) => pendingDownloads.has(p) || lstatExists(p)
      const reserved = uniquePath(d.downloads, item.getFilename(), taken)
      target = reserved
      stage = join(d.downloads, `.diwan-${randomUUID()}.part`)
      const stageFile = stage
      pendingDownloads.add(reserved)
      item.setSavePath(stageFile)
      item.once('done', (_e, state) => {
        pendingDownloads.delete(reserved)
        try {
          if (state !== 'completed') {
            d.log.warn('download did not complete', { state })
            for (const f of [stageFile, `${stageFile}.crdownload`]) {
              try {
                unlinkSync(f)
              } catch {
                // nothing was written
              }
            }
            return
          }
          const final = finalizeDownload(
            stageFile,
            d.downloads,
            basename(reserved),
            { linkSync, unlinkSync, copyFileSync, exists: lstatExists },
            (m, e) => d.log.warn(m, e),
          )
          if (!final) {
            d.log.warn('download could not be saved: no free name')
            return
          }
          const n = new Notification({ title: 'Saved to Downloads', body: escapeNotifyText(basename(final)) })
          liveNotifications.add(n)
          const release = () => liveNotifications.delete(n)
          n.on('click', () => {
            shell.showItemInFolder(final)
            release()
          })
          n.on('close', release)
          n.show()
        } catch (e) {
          d.log.warn('finishing download failed', e)
        }
      })
    } catch (e) {
      if (target) pendingDownloads.delete(target)
      item.cancel()
      d.log.warn('download setup failed', e)
    }
  })
  return ses
}

export function accountForSession(ses: Session, accounts: readonly { id: string }[]): string | undefined {
  const known = accountBySession.get(ses)
  if (known) return known
  return accounts.find((a) => session.fromPartition(partitionOf(a.id)) === ses)?.id
}
