// Linux notification daemons render a body subset of HTML, so escape markup there.
export function escapeNotifyText(s: string): string {
  if (process.platform !== 'linux') return s
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
