import { type ReactNode, useId } from 'react'
import { Switch } from '../ui/Switch'

// The building blocks of a settings section (docs/design/settings.dc.html): a card of rows, each
// row a title and a hint on the left and a control on the right.

export function Group({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section
      aria-label={label}
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-bg-2 [&>*+*]:border-t [&>*+*]:border-line-soft"
    >
      {children}
    </section>
  )
}

// A small uppercase heading above a group ("Per account").
export function GroupTitle({ children }: { children: ReactNode }) {
  return <h3 className="m-0 text-[13px] font-semibold tracking-[0.5px] text-fg-dim uppercase">{children}</h3>
}

function Text({ title, hint, hintId }: { title: string; hint?: ReactNode; hintId: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
      <span className="text-[14px] font-medium text-fg-strong">{title}</span>
      {hint && (
        <span id={hintId} className="text-[12px] leading-[1.45] text-fg-dim">
          {hint}
        </span>
      )}
    </span>
  )
}

// A row whose control is not a switch (a button, a value). The control names itself; the hint
// describes it when the control asks for `hintId`.
export function Row({
  title,
  hint,
  control,
}: {
  title: string
  hint?: ReactNode
  control: (hintId: string | undefined) => ReactNode
}) {
  const hintId = useId()
  return (
    <div className="flex items-center gap-4 px-[18px] py-4">
      <Text title={title} hint={hint} hintId={hintId} />
      {control(hint ? hintId : undefined)}
    </div>
  )
}

// An on/off row. The whole row is the switch's <label>, so a click anywhere on it toggles (a
// <button> is labelable; a click on the switch itself isn't counted twice). Screen readers get one
// control: a switch named by the title and described by the hint.
export function ToggleRow({
  title,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  title: string
  hint?: ReactNode
  checked: boolean
  onChange(v: boolean): void
  disabled?: boolean
}) {
  const hintId = useId()
  const switchId = useId()
  return (
    <label
      htmlFor={switchId}
      className={`flex items-center gap-4 px-[18px] py-4 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <Text title={title} hint={hint} hintId={hintId} />
      <Switch
        id={switchId}
        label={title}
        describedBy={hint ? hintId : undefined}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  )
}
