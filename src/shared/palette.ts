// Account colours: calm, mid-lightness, readable under white initials. Graphite accent is #3b82f6.
export const ACCOUNT_COLORS = [
  '#3b82f6',
  '#14b8a6',
  '#f59e0b',
  '#8b5cf6',
  '#f43f5e',
  '#22c55e',
  '#06b6d4',
  '#a1a1aa',
] as const

export function colorForIndex(i: number): string {
  return ACCOUNT_COLORS[((i % ACCOUNT_COLORS.length) + ACCOUNT_COLORS.length) % ACCOUNT_COLORS.length]
}
