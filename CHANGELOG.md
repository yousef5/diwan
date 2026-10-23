# Changelog

All notable changes to Diwan are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Diwan follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-23

Diwan now runs on Windows and on any mainstream Linux distribution, not only Arch.

### Added

- **Windows 10/11 (x64)**: a per-user NSIS installer, `Diwan-Setup-<version>.exe` (not code-signed yet).
  - Native caption buttons (minimise, maximise, close) and platform-aware UI.
  - The unread count as an overlay badge on the taskbar button, next to the tray badge.
  - A double-click on the tray icon shows the window, and the window comes to the front past Windows' foreground lock.
  - An opt-in "Open whatsapp: links in Diwan" switch in Settings → General. Diwan registers itself only on request, removes only its own handler, and points to Windows Settings → Default apps when another app keeps the links.
  - The uninstaller keeps your data in `%APPDATA%\Diwan` and removes the `whatsapp:` handler only if it belongs to that install.
- **Linux packages**: an AppImage, a `.deb` (Debian 12+, Ubuntu 22.04+, including the `t64` library names) and an `.rpm` (Fedora), next to the Arch package.
  - The `.deb` installs an AppArmor profile on Ubuntu 24.04+ so Chromium's sandbox keeps working, and sets `chrome-sandbox` SUID only where user namespaces don't work. The `.rpm` does the same SUID check.
  - The AppImage no longer hard-codes `--no-sandbox`: it falls back to it only when the sandbox can't start.
- On Linux, the launcher count through `app.setBadgeCount`, and the `xdg-mime` command for `whatsapp:` links shown in Settings → General.
- A one-time "Diwan is still running" notice the first time you close the window to the tray.
- **CI**: type check and unit tests on Ubuntu and Windows; lint and the end-to-end suite on Ubuntu; every package built and smoke-run headless on each push.
- **Releases**: pushing a `vX.Y.Z` tag that matches `package.json` builds every package and attaches them, with `SHA256SUMS`, to a draft GitHub Release for review.
- This changelog.

### Fixed

- Settings saves on Windows: the atomic store skips the directory fsync there and tolerates the errors Windows returns for it, so the `.bak` copy rotates and the final flush on quit works.
- File locking on Windows: avatar saves, log rotation and the Nexus import rename retry on `EPERM`/`EACCES`/`EBUSY` (for example while Defender scans a new folder). A removed account's folder is deleted at the next start, once Chromium has let go of it.
- Download file names are sanitised for Windows: `<>:"|?*` are stripped, reserved device names (`con.txt`, `COM1`, `CONIN$`, …) are renamed, and a shortened name never ends in a dot or a space.
- Logging off or shutting down: Diwan saves its settings and window position and quits instead of hiding to the tray, so it never blocks a session end. A cancelled Windows logoff keeps close-to-tray working.
- The WhatsApp user agent matches the platform Diwan runs on.
- Windows notifications and taskbar grouping use the app ID `com.yousef5.diwan`.
- Unit tests run the same on Linux and Windows, and the repository uses LF line endings everywhere.

### Changed

- The Nexus / MultiWhatsApp import is offered on Linux only.

## [1.0.0] - 2026-10-23

The first release, for Arch Linux (built from source; it has no Git tag).

### Added

- Unlimited WhatsApp accounts, each in its own isolated, always-live session.
- The account rail and context bar: name, colour and picture per account, unread badges, offline indicator, drag or <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> to reorder, and an Inbox button for the next unread account.
- Native notifications named after the account that open the right account and chat, with per-account mute, pause-all and a private mode.
- Tray icon with an unread badge, close to tray, start hidden, and autostart.
- Arabic support: right-to-left names, Arabic digits in unread counts, Arabic and English spellcheck.
- Keyboard shortcuts for every account and action.
- A crash-proof settings file (atomic saves, a backup copy and a recovery mode), sandboxed WhatsApp pages and validated IPC.
- Import from Nexus / MultiWhatsApp with the accounts still logged in.
- An Arch Linux package (`bun run package:arch`) with native Wayland.

[1.1.0]: https://github.com/yousef5/diwan/releases/tag/v1.1.0
[1.0.0]: https://github.com/yousef5/diwan/tree/3934d29
