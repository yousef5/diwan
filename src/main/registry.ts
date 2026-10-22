import type { WebContents } from 'electron'

// Which account a guest webContents belongs to. Every guest IPC message is resolved through
// this; messages from unknown senders are dropped.
export class Registry {
  private byWc = new Map<number, string>()
  private byAccount = new Map<string, WebContents>()

  attach(wc: WebContents, accountId: string): void {
    this.byWc.set(wc.id, accountId)
    this.byAccount.set(accountId, wc)
  }

  detach(wcId: number): void {
    const accountId = this.byWc.get(wcId)
    if (accountId === undefined) return
    this.byWc.delete(wcId)
    if (this.byAccount.get(accountId)?.id === wcId) this.byAccount.delete(accountId)
  }

  accountOf(wcId: number): string | undefined {
    return this.byWc.get(wcId)
  }

  guestOf(accountId: string): WebContents | undefined {
    const wc = this.byAccount.get(accountId)
    return wc && !wc.isDestroyed() ? wc : undefined
  }
}
