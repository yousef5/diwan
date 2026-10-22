// Account colours: Tailwind 600 shades, so white initials stay readable (≥ ~4.5:1). Graphite accent is #3b82f6.
export const ACCOUNT_COLORS = [
  '#2563eb',
  '#0d9488',
  '#d97706',
  '#7c3aed',
  '#e11d48',
  '#16a34a',
  '#0891b2',
  '#71717a',
] as const

export function colorForIndex(i: number): string {
  const n = Number.isFinite(i) ? Math.trunc(i) : 0
  return ACCOUNT_COLORS[((n % ACCOUNT_COLORS.length) + ACCOUNT_COLORS.length) % ACCOUNT_COLORS.length]
}
