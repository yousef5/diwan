import type { ComponentPropsWithRef } from 'react'

export type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger'

// Filled variants use the *-strong tokens so white text stays above 4.5:1, and hover darkens
// rather than lightens for the same reason. Hover sits behind `enabled:` so a disabled button
// doesn't react. Focus uses the global ring (--color-focus), never the accent.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-strong text-white enabled:hover:brightness-90',
  ghost: 'bg-transparent text-fg border border-line-strong enabled:hover:bg-bg-3',
  subtle: 'bg-bg-3 text-fg border border-line-strong enabled:hover:bg-bg-4',
  danger: 'bg-danger-strong text-white enabled:hover:brightness-90',
}

export function Button({
  variant = 'subtle',
  className = '',
  type = 'button',
  ...rest
}: ComponentPropsWithRef<'button'> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-[background-color,filter] disabled:cursor-default disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}
