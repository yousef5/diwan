// A key or shortcut chip, e.g. "Esc" or "Ctrl 1". Always left to right, even next to Arabic.
export function Kbd({ children }: { children: string }) {
  return (
    <kbd
      dir="ltr"
      className="inline-block rounded-[4px] border border-kbd-line bg-bg-3 px-[5px] font-mono text-[10px] leading-4 font-medium text-fg-dim"
    >
      {children}
    </kbd>
  )
}
