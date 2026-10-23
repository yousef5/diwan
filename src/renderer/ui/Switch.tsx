// An on/off toggle. A native <button> with role="switch", so Space and Enter work and screen
// readers announce "on"/"off". The label is required because the visible text sits elsewhere in
// the row; `describedBy` points at the row's hint, read after the name.
export function Switch({
  checked,
  onChange,
  label,
  id,
  describedBy,
  disabled = false,
}: {
  checked: boolean
  onChange(v: boolean): void
  label: string
  id?: string
  describedBy?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:cursor-default disabled:opacity-40 ${checked ? 'bg-accent' : 'bg-edge'}`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-[left] motion-reduce:transition-none ${checked ? 'left-[19px]' : 'left-[3px]'}`}
      />
    </button>
  )
}
