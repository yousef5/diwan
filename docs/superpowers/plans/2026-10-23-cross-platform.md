# Diwan 1.1: Windows + other Linux distros

**Goal:** ship Diwan for Windows (NSIS `.exe`) and for any Linux distro (AppImage, `.deb`, `.rpm`). The Arch package stays as it is. GitHub Actions builds every artifact and attaches it to a GitHub Release. macOS is out of scope.

**Decisions (Joe, 2026-10-23):**
- Unsigned Windows build: SmartScreen warns on first run.
- Windows gets native caption buttons through `titleBarOverlay`.
- The Nexus import is Linux-only.
- No Flatpak in 1.1.
- Never take over `whatsapp:` automatically. Registering it is opt-in.

**Source:** cross-platform audit of 2026-10-23 (item numbers below refer to it). Severity: BLOCKER, WIN-UX, DISTRO, TEST, BUILD.

**Rules:**
- Same conventions as the 1.0 plan: TDD, all gates green, a reviewer per task, hidden Electron only, never `git add -A`.
- Code that branches on platform takes `platform` as a parameter where practical, so the Linux test runner can test the win32 paths.

---

### Task W1: Main-process portability fixes

1. **`store.ts` `fsyncDir`** (1.1, BLOCKER): skip on win32. On any platform, ignore `EPERM`/`EISDIR`/`EINVAL`/`EBADF`. Otherwise every save on Windows re-arms forever and `.bak` never rotates.
2. **Windows file locks** (1.2, 1.3): add a `retryFs` helper for `EPERM`/`EACCES`/`EBUSY` on win32 (a few retries with backoff). Use it in `avatars.save`, `log.ts` rotation and the import rename. Give account-folder `rm` `maxRetries: 5, retryDelay: 200` on win32.
3. **`app.setAppUserModelId('com.yousef5.diwan')`** on win32, before ready (1.6).
4. **Shutdown** (1.5): Windows `query-session-end`/`session-end` and Linux `powerMonitor` `shutdown` set `quitting = true` and flush the store, so close-to-tray never blocks a logoff.
5. **Platform-aware user agent** (1.11): `chromeUserAgent(version, platform)` returns the Windows NT 10 / X11 Linux / macOS string. Update its test.
6. **`sanitizeFilename`** (1.14): also strip `<>:"|?*`. Rename reserved device names (CON, PRN, AUX, NUL, COM1–9, LPT1–9, case-insensitive, with or without an extension) by appending `_`. Keep the 255-byte cap. Apply this on every platform.
7. **Snapshot** gains `platform: 'linux' | 'win32' | 'darwin'` and `dataDir: string` (`paths.userData`, shown as-is).

### Task W2: Windows window and platform-aware UI

1. **Windows window** (1.4): `titleBarStyle: 'hidden'` with `titleBarOverlay: { color: '#131316', symbolColor: '#e4e4e7', height: 48 }`.
   - The ContextBar reserves the overlay width with `env(titlebar-area-width)` / `navigator.windowControlsOverlay`, so its buttons never sit under the caption buttons.
   - The rail and Settings keep their drag regions.
   - On win32, `WindowControls` and the "Show window controls" setting are hidden.
2. **UI text** (1.16):
   - The Data section shows `snap.dataDir`.
   - About becomes "Multi-account WhatsApp Web for your desktop."
   - Drop the Hyprland wording on win32.
3. **Nexus import gated to Linux** (1.15):
   - On non-Linux, main reports `importAvailable: false` and refuses `importer:*` IPC.
   - The Settings row and the startup offer are hidden.
   - The dialog's uninstall hint becomes generic: "uninstall Nexus with your package manager".

### Task W3: Taskbar badge, tray and protocol

1. **Windows taskbar badge** (1.8): `win.setOverlayIcon(badge16, 'N unread')`, and `setOverlayIcon(null, '')` at 0. The renderer draws a 16 px badge-only image with the `trayBadges` painter (a new key set), and main validates it like the tray badges.
2. **Linux launcher badge** (1.8): `app.setBadgeCount(total)` (KDE / Dash-to-Dock / Unity).
3. **Tray** (1.9): double-click shows the window on win32. A tray click and `second-instance` bring the window to the front reliably (`app.focus({ steal: true })` on win32 if needed).
4. **Tray on GNOME** (1.10): the first time Diwan hides to the tray, show a one-time notification: "Diwan is still running — open it from the tray or your app menu". This is persisted, so it shows once.
5. **`whatsapp:` opt-in** (1.13): a Settings toggle "Open whatsapp: links in Diwan".
   - win32: `app.setAsDefaultProtocolClient('whatsapp', exe, ['--'])`. Only parse argv after `--`, so no argument injection.
   - Linux: the toggle shows the `xdg-mime` command instead.
   - Off removes the handler only if it points at Diwan.

### Task W4: Portable tests and line endings

- Add `.gitattributes` with `* text=auto eol=lf`.
- Skip POSIX-semantics tests on win32 with `skipIf(process.platform === 'win32')`: file modes, chmod-unreadable, mkfifo, `/dev`, `/proc`.
- A `canSymlink()` probe gates the symlink tests. Use `'junction'` for directory links where possible.
- Path expectations use `join`.
- The importer tests run only on Linux.
- `bun run test` must pass on `windows-latest`. The E2E suite stays Linux-only.

### Task W5: Packaging config

`electron-builder.yml`:
- **Windows:** `win: nsis x64`, with `icon: resources/icon.ico`. The icon is a real multi-size ICO (16/24/32/48/64/256) generated from `icon.svg` and committed. `nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false, createStartMenuShortcut: true, shortcutName: Diwan }`.
- **Linux:** targets `AppImage`, `deb` and `rpm`. A `linux.desktop` block reproduces `packaging/diwan.desktop` (Arabic names, categories, `StartupWMClass=diwan`, no MimeType). Add maintainer, vendor, synopsis, `homepage` in package.json, and deb/rpm depends.
- **Artifact names:** `Diwan-${version}-${arch}.${ext}` / `Diwan-Setup-${version}.exe`.
- **`electronDist`:** keep it for local Arch builds, and override it in CI so electron-builder fetches the pinned Electron for each host.
- **Scripts:** `package:win`, `package:linux`. `package:arch` stays.
- **Verify:** build AppImage, deb and rpm locally, and inspect their file lists, desktop files and asar contents. Smoke-test the AppImage headless, extracted with `--appimage-extract`.

### Task W6: CI and releases

- **`ci.yml`:**
  - A `test` matrix on `[ubuntu-latest, windows-latest]` runs typecheck, unit tests and build.
  - `lint` runs on ubuntu.
  - `e2e` runs on ubuntu, installing xvfb and dbus.
- **`release.yml`**, on a `v*` tag:
  - Builds the Linux artifacts on ubuntu (with the `rpm` package installed) and NSIS on windows.
  - Runs a headless packaged smoke test per OS where possible.
  - Attaches everything plus `SHA256SUMS` to a **draft** GitHub Release.
- **Verify:** push the branch and watch the runs go green on both OSes. Don't tag. Tagging and publishing are Joe's call.

### Task W7: Docs

- README:
  - Real install sections: Windows (download the `.exe`, plus the SmartScreen "More info → Run anyway" note), Debian/Ubuntu `.deb`, Fedora `.rpm`, AppImage (with the Ubuntu 24.04 AppArmor note), and Arch.
  - The badges and roadmap reflect Windows support.
- Add a CHANGELOG with 1.1.0. Bump the version to 1.1.0 (package.json and PKGBUILD).

### Release (Joe's decision)

When everything is green: ask Joe, then tag `v1.1.0`. The release workflow builds a draft. Joe, or Claude on his yes, publishes it. Someone must run the `.exe` on a real Windows machine before it's announced.
