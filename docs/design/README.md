# Diwan UI design (direction B: rail + context bar)

Joe picked direction **B** on 2026-10-22, from the design canvas
https://claude.ai/artifact/JSSDe4Aez2iijKAVbbjWXs.

- `B-rail-contextbar.dc.html`: the main window.
  - A 68 px account rail: logo, divider, account tiles, a dashed "add" button, and settings at the bottom.
  - A 48 px context bar for the active account: colour dot, name, connection state, Inbox button with unread count, zoom %, mute, reload and more.
  - The WhatsApp webview fills the rest.
- `settings.dc.html`: the settings page.
  - A 236 px section nav: General, Notifications, Accounts, Data, Shortcuts, About, with the version at the bottom.
  - Card sections of toggle rows, and a "Close · Esc" button.

These are design-canvas sources (`<x-dc>` markup plus a `DCLogic` script). Read them for layout, sizes and colours; they are not runnable app code.

Tokens used (Graphite, dark):
- Backgrounds: page `#0f0f11`, rail/bar `#131316`, raised `#1f1f23`, card `#16161a`.
- Hairlines: `rgba(255,255,255,0.07)`.
- Text: `#fafafa` / `#e4e4e7` / `#a1a1aa` / `#71717a`.
- Accent: `#3b82f6`.
- Status: connected `#22c55e`, offline `#f59e0b`.
- A muted account's unread pill: `#52525b`.
- Fonts: Inter (UI) and JetBrains Mono (numbers, keys).
