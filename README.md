<div align="center">

<img src="resources/icon.png" width="128" alt="Diwan">

# Diwan · ديوان

### All your WhatsApp accounts in one calm desktop window

Personal, work, the shop, the family group… every number stays logged in on its own,<br>
with its own notifications and unread count, one shortcut away.

<p>
  <a href="https://github.com/yousef5/diwan/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/yousef5/diwan/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI" alt="CI"></a>
  <a href="https://github.com/yousef5/diwan/releases"><img src="https://img.shields.io/badge/version-1.0.0-3b82f6?style=for-the-badge" alt="Version 1.0.0"></a>
  <img src="https://img.shields.io/badge/Linux-ready-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux">
  <img src="https://img.shields.io/badge/Windows-planned-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows planned">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" alt="MIT"></a>
</p>

<p>
  <img src="https://img.shields.io/badge/Electron-44-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Bun-runtime-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun">
  <img src="https://img.shields.io/badge/tests-770%2B-22c55e?style=flat-square&logo=vitest&logoColor=white" alt="Tests">
</p>

**[✨ Features](#-features)** · **[📦 Install](#-install)** · **[🚀 Getting started](#-getting-started)** · **[⌨️ Shortcuts](#️-keyboard-shortcuts)** · **[❓ FAQ](#-faq)** · **[🛠️ Development](#️-development)**

<br>

<img src="docs/screenshots/settings.png" width="88%" alt="Diwan settings: notifications per account">

</div>

<br>

## 💡 Why Diwan?

WhatsApp Web lets one browser profile log in to **one** account. Run three numbers and you end up juggling browser profiles, private windows and your phone, and messages slip through.

**Diwan puts every account in one window, side by side, and keeps them all live.**

|  | Browser tabs | **Diwan** |
|---|:---:|:---:|
| Several accounts logged in at once | ⚠️ one per profile | ✅ unlimited |
| Switch accounts without reloading | ❌ | ✅ instant |
| Notifications say which account | ❌ | ✅ "Work · Ahmed" |
| Unread badge per account and on the tray | ❌ | ✅ |
| Mute one account, keep the others | ❌ | ✅ |
| Keyboard shortcuts for every account | ❌ | ✅ <kbd>Ctrl</kbd> + <kbd>1</kbd>…<kbd>9</kbd> |
| Closes to the tray, starts with your desktop | ❌ | ✅ |

<br>

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 👥 Accounts
- Unlimited WhatsApp accounts, each in its **own isolated session**
- Name, colour and picture per account; uses the WhatsApp profile photo automatically
- A slim **account rail** with unread badges and an offline indicator
- Drag to reorder, or <kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd>

</td>
<td width="50%" valign="top">

### 🔔 Notifications
- Native desktop notifications **named after the account**
- Clicking one opens **that account and that chat**
- Mute per account, or pause everything from the tray
- **Private mode** shows "New message" instead of the text, for screen sharing

</td>
</tr>
<tr>
<td valign="top">

### ⚡ Fast and calm
- Every account stays loaded: switching takes **milliseconds**
- An **Inbox** button jumps to the next account with unread messages
- Unread total on the **tray icon** and in the window title
- A quiet dark design that doesn't shout for attention

</td>
<td valign="top">

### 🌍 Arabic first-class
- Arabic account names, right-to-left text done right
- The unread counter understands Arabic digits
- Spellcheck in **Arabic and English**
- Arabic name in your app menu: **ديوان**

</td>
</tr>
<tr>
<td valign="top">

### 🛡️ Safe by design
- Settings **can't be corrupted**: atomic saves, a backup copy, and a recovery mode
- WhatsApp pages are **sandboxed** and every message is validated
- Links leave WhatsApp only through your own browser
- **No telemetry, no servers.** Diwan talks only to WhatsApp

</td>
<td valign="top">

### 🧩 Desktop integration
- Tray icon with badge, close to tray, start hidden
- `whatsapp:` links open in Diwan
- Downloads go straight to `~/Downloads`
- Native **Wayland**, with automatic X11 fallback

</td>
</tr>
</table>

> [!TIP]
> **Coming from Nexus / MultiWhatsApp?** On first launch Diwan offers to import your accounts, still logged in, without touching Nexus's own data.

<br>

## 📦 Install

<details open>
<summary><b>🐧 Arch Linux · CachyOS · Manjaro · EndeavourOS</b></summary>

<br>

```sh
git clone https://github.com/yousef5/diwan && cd diwan
bun install && bunx install-electron --no
bun run package:arch
sudo pacman -U release/diwan-1.0.0-1-x86_64.pkg.tar.zst
```

Diwan then appears in your app menu as **Diwan / ديوان**.

</details>

<details>
<summary><b>🐧 Any other Linux (AppImage)</b></summary>

<br>

```sh
git clone https://github.com/yousef5/diwan && cd diwan
bun install && bunx install-electron --no
bun run package:appimage
./release/Diwan-*.AppImage
```

> [!NOTE]
> The AppImage target exists but isn't tested outside Arch yet. Ready-made `.deb`, `.rpm`, Flatpak and AppImage downloads on the Releases page are on the [roadmap](#️-roadmap).

</details>

<details>
<summary><b>🪟 Windows</b></summary>

<br>

Windows support is **planned**: an `.exe` installer with tray badge and native notifications. See the [roadmap](#️-roadmap).

</details>

**Optional:** let `whatsapp:` links open in Diwan (Linux):

```sh
xdg-mime default diwan.desktop x-scheme-handler/whatsapp
```

<br>

## 🚀 Getting started

1. **Open Diwan** and click **Add account**.
2. **Name it** and pick a colour.
3. **Scan the QR code** with WhatsApp on your phone: *Settings → Linked devices → Link a device*.
4. Repeat for each number, then switch with the rail or <kbd>Ctrl</kbd> + <kbd>1</kbd>…<kbd>9</kbd>.

<br>

## ⌨️ Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Go to account 1–9 | <kbd>Ctrl</kbd> + <kbd>1</kbd> … <kbd>9</kbd> |
| Next account | <kbd>Ctrl</kbd> + <kbd>Tab</kbd> · <kbd>Ctrl</kbd> + <kbd>PgDn</kbd> |
| Previous account | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Tab</kbd> · <kbd>Ctrl</kbd> + <kbd>PgUp</kbd> |
| Reload the account | <kbd>Ctrl</kbd> + <kbd>R</kbd> · <kbd>F5</kbd> |
| Restart the account's page | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd> · <kbd>Shift</kbd> + <kbd>F5</kbd> |
| Zoom in · out · reset | <kbd>Ctrl</kbd> + <kbd>+</kbd> · <kbd>Ctrl</kbd> + <kbd>−</kbd> · <kbd>Ctrl</kbd> + <kbd>0</kbd> |
| Settings | <kbd>Ctrl</kbd> + <kbd>,</kbd> |
| Hide to tray · Quit | <kbd>Ctrl</kbd> + <kbd>W</kbd> · <kbd>Ctrl</kbd> + <kbd>Q</kbd> |
| Move the focused account | <kbd>Alt</kbd> + <kbd>↑</kbd> · <kbd>Alt</kbd> + <kbd>↓</kbd> |
| Account menu | <kbd>Shift</kbd> + <kbd>F10</kbd> · <kbd>Menu</kbd> |
| Close a dialog, menu or Settings | <kbd>Esc</kbd> |

Shortcuts work even while you're typing inside WhatsApp.

<br>

## 🔒 Privacy & your data

Diwan has **no backend, no analytics and no account system**. Everything lives on your computer, in `~/.config/Diwan`:

| Path | What it holds |
|---|---|
| 📄 `diwan.json` | your accounts and settings, plus a `.bak` safety copy |
| 🗂️ `Partitions/acc-<id>/` | each account's WhatsApp session, kept apart from the others |
| 🖼️ `avatars/` · 📝 `logs/` | account pictures · app logs |

WhatsApp links each session to one device, so on a new computer you add your accounts again by QR.

<br>

## ❓ FAQ

<details>
<summary><b>Is this an official WhatsApp app?</b></summary>
<br>
No. Diwan hosts the official <b>WhatsApp Web</b> inside a desktop window, one isolated session per account. It's not affiliated with WhatsApp or Meta.
</details>

<details>
<summary><b>Will my accounts get logged out?</b></summary>
<br>
No more than in a browser. Each account is a normal "linked device" on your phone, and Diwan keeps every session loaded so switching never reloads it.
</details>

<details>
<summary><b>How much memory does it use?</b></summary>
<br>
Each live account is a full WhatsApp Web page, roughly 300–500 MB. Hidden accounts are throttled by Chromium, so they don't use CPU while you're elsewhere.
</details>

<details>
<summary><b>Can Diwan read my messages?</b></summary>
<br>
Diwan runs no servers and sends nothing anywhere. The only thing it reads from the page is what a desktop notification needs (sender, text, chat), and you can turn the text off.
</details>

<br>

## 🏗️ How it works

```
┌──────────────── Diwan window (React UI) ────────────────┐
│ rail │ context bar: name · status · Inbox · zoom · mute │
│      ├──────────────────────────────────────────────────┤
│  ●   │ <webview> web.whatsapp.com   ← account A (shown) │
│  ●   │ <webview> …                  ← B, C… (hidden,    │
│  ＋  │                                still live)       │
└──────┴──────────────────────────────────────────────────┘
          ▲ state snapshots          │ validated IPC (zod)
          │                          ▼
   Main process ── state + atomic store · notifications · tray
                   downloads · link policy · Nexus import
```

- The **main process** owns all state and pushes snapshots to the UI.
- Each account is a `<webview>` in its own `persist:` session.
- A tiny **sandboxed preload** inside each page reports notifications, online state and the profile photo. Everything it sends is rate-limited and schema-validated.

<br>

## 🛠️ Development

```sh
bun install && bunx install-electron --no
DIWAN_USER_DATA=$(mktemp -d) bun run dev   # live app on a throwaway profile
bun run typecheck && bun run lint          # TypeScript + Biome
bun run test                               # 770+ unit & component tests (Vitest)
bun run e2e                                # 15 end-to-end tests (Playwright)
```

> [!IMPORTANT]
> Always run the end-to-end suite through `bun run e2e`. It is fully sealed: headless under Xvfb, a private D-Bus, the network blocked, a stand-in page instead of WhatsApp, and throwaway folders only. It refuses to start against your real desktop or data.

📚 **Design docs:** [spec](docs/superpowers/specs/2026-10-22-diwan-1.0-design.md) · [implementation plan](docs/superpowers/plans/2026-10-22-diwan-1.0.md) · [UI design](docs/design/) · [why Electron, not Tauri](docs/spikes/webkitgtk-whatsapp.py)

<br>

## 🗺️ Roadmap

- [x] Multi-account core, rail + context bar UI, settings
- [x] Native notifications, tray badge, Arabic support
- [x] Import from Nexus / MultiWhatsApp
- [x] Arch Linux package
- [ ] Ready-made downloads on GitHub Releases (AppImage, `.deb`, `.rpm`)
- [ ] Flatpak
- [ ] **Windows** installer
- [ ] Sleep idle accounts to save memory

<br>

## 📄 License

[MIT](LICENSE) © 2026 Mohammed Yousef

<sub>Diwan is an independent project, not affiliated with, endorsed by or connected to WhatsApp or Meta.</sub>
