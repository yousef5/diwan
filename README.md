# Diwan (ديوان)

All your WhatsApp accounts in one calm window. A Linux desktop app (Electron).

- Every account gets its own isolated session. Ctrl+1…9 or Ctrl+Tab switch between them instantly, with no reload.
- A rail of accounts plus a context bar (design B in `docs/design/`). Arabic account names are fully supported.
- Native notifications named after the account they come from; clicking one opens that chat. Muting works per account or globally.
- The unread count shows on the tray icon and in the window title, and works with WhatsApp in Arabic.
- Links open in your browser. The right-click menu has Arabic + English spellcheck.
- Downloads save straight to `~/Downloads`.
- Settings can't be lost: atomic saves, a backup copy, and a read-only recovery mode with "Start fresh".
- One-click import from Nexus (MultiWhatsApp) keeps the logins and never touches Nexus's own data.

## Develop

    bun install && bunx install-electron --no
    bun run dev                         # live app, on your own profile
    DIWAN_USER_DATA=$(mktemp -d) bun run dev   # throwaway profile
    bun run typecheck && bun run lint
    bun run test                        # unit tests (Vitest + jsdom)
    bun run e2e                         # end-to-end (Playwright _electron)

`bun run e2e` is fully sealed:
- It runs headless under `xvfb-run` with a private D-Bus that has no services.
- The network is blocked, and a stand-in page replaces web.whatsapp.com.
- Every folder is a throwaway one under `/tmp/diwan-e2e-*`.

Always run it through `bun run e2e`. The fixture refuses to start against a real display, a real bus or real folders.

## Package (Arch)

    bun run package:arch
    pkexec /usr/bin/pacman -U --noconfirm release/diwan-1.0.0-1-x86_64.pkg.tar.zst

The package contains:
- `/opt/diwan`;
- `/usr/bin/diwan`, a launcher that uses native Wayland when the socket exists and otherwise falls back to X11;
- `diwan.desktop`, with `StartupWMClass=diwan` and no MimeType;
- the hicolor icons.

To make `whatsapp:` links open in Diwan:

    xdg-mime default diwan.desktop x-scheme-handler/whatsapp

## Data

`~/.config/Diwan` holds:
- `diwan.json`: accounts and settings, with `.bak` and `.broken-*` copies.
- `Partitions/acc-<uuid>`: one session per account.
- `avatars/` and `logs/`.

WhatsApp sessions belong to one device, so on a new PC you add the accounts again by QR.

## Design

- Spec: `docs/superpowers/specs/2026-10-22-diwan-1.0-design.md`
- Plan: `docs/superpowers/plans/2026-10-22-diwan-1.0.md`
- UI direction B and the settings page: `docs/design/`
- Why Electron and not Tauri: spec §2 and `docs/spikes/webkitgtk-whatsapp.py`
