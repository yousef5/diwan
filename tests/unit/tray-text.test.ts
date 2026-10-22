import { describe, expect, it } from 'vitest'
import { trayAccountLabel } from '../../src/main/tray-text'

describe('trayAccountLabel', () => {
  it('escapes ampersands', () => {
    expect(trayAccountLabel('Work & Co', 0, false)).toContain('Work && Co')
  })
  it('removes newlines', () => {
    expect(trayAccountLabel('a\nb', 0, false)).not.toContain('\n')
  })
  it('strips RLO', () => {
    expect(trayAccountLabel('a‮b', 0, false)).not.toContain('‮')
  })
  it('adds unread and muted suffixes', () => {
    const l = trayAccountLabel('A', 3, true)
    expect(l).toContain('(3)')
    expect(l).toContain('muted')
  })
  it('omits suffixes when none', () => {
    const l = trayAccountLabel('A', 0, false)
    expect(l).not.toContain('(')
    expect(l).not.toContain('muted')
  })
})
