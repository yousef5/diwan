import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from 'react'
import { ACCOUNT_COLORS, colorForIndex } from '../../shared/palette'
import { AccountName } from '../../shared/validators'
import { attempt } from '../api'
import { initials } from '../format'
import { Icon } from '../icons'
import { useUi } from '../state'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

export const NAME_MAX = 40

// Spoken names for the palette swatches (src/shared/palette.ts).
export const COLOR_NAMES: Record<string, string> = {
  '#2563eb': 'Blue',
  '#0d9488': 'Teal',
  '#d97706': 'Amber',
  '#7c3aed': 'Violet',
  '#e11d48': 'Rose',
  '#16a34a': 'Green',
  '#0891b2': 'Cyan',
  '#71717a': 'Grey',
}

// Null when main would accept the name (same zod rule as the IPC contract), else what to fix.
export function nameError(name: string): string | null {
  if (AccountName.safeParse(name).success) return null
  return name.trim().length > NAME_MAX
    ? `Use ${NAME_MAX} characters or fewer.`
    : 'Enter a name for this account.'
}

// A row of colour swatches with radio-group semantics: one tab stop (the chosen colour), arrow
// keys move the choice, Home/End jump to the ends.
function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: string[]
  value: string
  onChange(c: string): void
}) {
  const labelId = useId()
  const row = useRef<HTMLDivElement>(null)
  const pick = (i: number) => {
    const c = colors[((i % colors.length) + colors.length) % colors.length]
    onChange(c)
    row.current?.querySelector<HTMLElement>(`[data-color="${c}"]`)?.focus()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = colors.indexOf(value)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') pick(at + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') pick(at - 1)
    else if (e.key === 'Home') pick(0)
    else if (e.key === 'End') pick(colors.length - 1)
    else return
    e.preventDefault()
  }
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-[12px] font-medium text-fg-dim">
        Colour
      </span>
      <div
        ref={row}
        role="radiogroup"
        aria-labelledby={labelId}
        onKeyDown={onKeyDown}
        className="flex flex-wrap gap-2.5"
      >
        {colors.map((c) => {
          const on = c === value
          return (
            // biome-ignore lint/a11y/useSemanticElements: a filled swatch with a check, not a styled native radio
            <button
              type="button"
              role="radio"
              key={c}
              data-color={c}
              aria-checked={on}
              aria-label={COLOR_NAMES[c.toLowerCase()] ?? 'Current colour'}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(c)}
              style={{ background: c }}
              className={`focus-ring-wide flex h-7 w-7 items-center justify-center rounded-lg text-white ${
                on ? 'shadow-[0_0_0_2px_var(--color-bg-2),0_0_0_4px_var(--color-fg-strong)]' : ''
              }`}
            >
              {on && <Icon name="check" size={15} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Add an account (name + colour; WhatsApp then shows its QR code) or edit one. The name follows
// main's rules; a failure from main stays in the dialog instead of closing it.
export function AccountDialog({
  editId,
  returnFocus,
}: {
  editId?: string
  returnFocus?: () => HTMLElement | null
}) {
  const existing = useUi((s) => (editId ? s.snap?.accounts.find((a) => a.id === editId) : undefined))
  const avatar = useUi((s) => (editId ? (s.snap?.runtime[editId]?.avatar ?? null) : null))
  const count = useUi((s) => s.snap?.accounts.length ?? 0)
  const [name, setName] = useState(existing?.name ?? '')
  // Palette colours are lower case; a stored colour may not be.
  const startColor = existing?.color.toLowerCase()
  const [color, setColor] = useState(startColor ?? colorForIndex(count))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const formId = useId()
  const errorId = useId()
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const close = () => useUi.getState().openDialog(null)

  const palette: string[] = [...ACCOUNT_COLORS]
  if (startColor && !palette.includes(startColor)) palette.unshift(startColor)

  const error = nameError(name)
  // "Too long" shows as soon as it happens; "empty" only after a try, not while starting to type.
  const shownError = error && (tried || name.trim().length > NAME_MAX) ? error : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setTried(true)
    if (error) {
      input.current?.focus()
      return
    }
    const clean = name.trim()
    setBusy(true)
    setFailure(null)
    let r: { ok: boolean; error?: string }
    if (existing) {
      const patch = {
        ...(clean !== existing.name ? { name: clean } : {}),
        ...(color !== startColor ? { color } : {}),
      }
      r = Object.keys(patch).length
        ? await attempt('account:update', { id: existing.id, patch })
        : { ok: true }
    } else {
      r = await attempt('account:add', { name: clean, color })
    }
    setBusy(false)
    if (r.ok) close()
    else setFailure(r.error ?? null)
  }

  return (
    <Dialog
      title={existing ? 'Edit account' : 'Add account'}
      returnFocus={returnFocus}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={busy}>
            {existing ? 'Save' : 'Add account'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            style={{ background: color }}
            className="mt-[22px] flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[14px] font-semibold text-white"
          >
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span dir="auto" className="bidi-plain">
                {initials(name)}
              </span>
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={inputId} className="text-[12px] font-medium text-fg-dim">
              Name
            </label>
            <input
              ref={input}
              id={inputId}
              data-autofocus
              dir="auto"
              value={name}
              placeholder="Personal, Pharmacy, Family…"
              spellCheck={false}
              aria-invalid={shownError ? 'true' : undefined}
              aria-describedby={shownError ? errorId : undefined}
              onChange={(e) => {
                setName(e.target.value)
                setFailure(null)
              }}
              className={`bidi-plain h-9 rounded-lg border bg-bg-1 px-3 text-[14px] text-fg-strong outline-none placeholder:text-fg-mute focus:border-accent ${
                shownError ? 'border-danger' : 'border-line-strong'
              }`}
            />
            {shownError && (
              <span id={errorId} className="text-[12px] text-danger-soft">
                {shownError}
              </span>
            )}
          </div>
        </div>
        <ColorPicker colors={palette} value={color} onChange={setColor} />
        {!existing && (
          <p className="m-0 text-[12px] text-fg-dim">
            Next, WhatsApp shows a QR code. Scan it from your phone: WhatsApp → Linked devices.
          </p>
        )}
        {failure && (
          <p role="alert" className="m-0 flex items-start gap-2 text-[13px] text-danger-soft">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
            {failure}
          </p>
        )}
      </form>
    </Dialog>
  )
}
