import type { ComponentPropsWithRef } from 'react'

export type ButtonVariant = 'primary' | 'ghost' | 'subtle' | 'danger'
// Height and padding live here, not in `className`: a caller's h-8 next to the base h-9 would lose
// (Tailwind orders utilities by its own rules, not by class order). `icon` is a square 32 px button.
export type ButtonSize = 'md' | 'sm' | 'icon'

// Filled variants use the *-strong tokens so white text stays above 4.5:1, and hover darkens
// rather than lightens for the same reason. Hover sits behind `enabled:` so a disabled button
// doesn't react. Focus uses the global ring (--color-focus), never the accent.
const SIZES: Record<ButtonSize, string> = {
  md: 'h-9 px-3.5',
  sm: 'h-8 px-3.5',
  icon: 'h-8 w-8 px-0',
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-strong text-white enabled:hover:brightness-90',
  ghost: 'bg-transparent text-fg border border-line-strong enabled:hover:bg-bg-3',
  subtle: 'bg-bg-3 text-fg border border-line-strong enabled:hover:bg-bg-4',
  danger: 'bg-danger-strong text-white enabled:hover:brightness-90',
}

export function Button({
  variant = 'subtle',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ComponentPropsWithRef<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-[background-color,filter] disabled:cursor-default disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}
