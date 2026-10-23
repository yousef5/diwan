// electron-builder config (JS, not YAML, so `electronDist` can be a function; see below).
//   bun run package          → release/linux-unpacked (the `dir` target; packaging/PKGBUILD wraps it
//                              into an Arch package with `bun run package:arch`)
//   bun run package:linux    → release/Diwan-<version>-x86_64.AppImage, -amd64.deb, -x86_64.rpm
//                              (the rpm needs `rpmbuild`; on a machine without it, e.g. Arch, use
//                              `bun run package:linux:norpm` for just the AppImage + deb)
//   bun run package:win      → release/Diwan-Setup-<version>.exe (NSIS; build it on Windows, i.e. CI)
// Only the built app goes into app.asar: never tests/, src/ or the E2E fixtures.
//
// Not carried over from the Arch package: packaging/diwan.sh, the /usr/bin wrapper that passes
// --ozone-platform=wayland whenever a live Wayland socket exists. deb/rpm/AppImage start Electron
// directly, and Electron 44 then picks native Wayland by itself only when XDG_SESSION_TYPE=wayland,
// X11 otherwise (e.g. a Wayland compositor started without that variable runs Diwan under XWayland).
//
// AppImage note (for the README): an AppImage can't ship chrome-sandbox SUID, and Ubuntu 24.04+ blocks
// unprivileged user namespaces through AppArmor, so the sandbox can't start there. electron-builder's
// AppRun probes `unshare -Ur true` and adds --no-sandbox by itself only when that fails; we stop it from
// also hard-coding --no-sandbox into the AppImage's desktop entry (appImage.executableArgs below).
// The deb after-install script sets chrome-sandbox SUID only where user namespaces don't work, and
// installs an AppArmor profile on Ubuntu 24+; the rpm one does the same SUID dance.
const fs = require('node:fs')
const path = require('node:path')

const localDist = path.join(__dirname, 'node_modules', 'electron', 'dist')
const electronBinary = { linux: 'electron', win32: 'electron.exe' }
const pinnedElectron = require('./package.json').devDependencies.electron

// electronDist: reuse the Electron that `bunx install-electron --no` already put in node_modules (no
// download), but only when it can be right: same OS and arch as the target and the pinned version.
// Otherwise (a --win build on Linux, a fresh CI checkout, an arm64 target) return null and
// electron-builder downloads the pinned Electron for that target. DIWAN_DOWNLOAD_ELECTRON=1 forces the
// download (CI can set it to never depend on node_modules).
function electronDist(options) {
  if (process.env.DIWAN_DOWNLOAD_ELECTRON === '1') return null
  if (options.platformName !== process.platform || options.arch !== process.arch) return null
  const binary = electronBinary[options.platformName]
  if (!binary || !fs.existsSync(path.join(localDist, binary))) return null
  try {
    if (fs.readFileSync(path.join(localDist, 'version'), 'utf8').trim() !== pinnedElectron) return null
  } catch {
    return null
  }
  return localDist
}

// The node_modules dist still carries Electron's fallback app; a downloaded one is cleaned by
// electron-builder itself. Diwan never needs it.
function afterPack(context) {
  fs.rmSync(path.join(context.appOutDir, 'resources', 'default_app.asar'), { force: true })
}

const desktopEntry = {
  Name: 'Diwan',
  'Name[ar]': 'ديوان',
  GenericName: 'WhatsApp accounts',
  'GenericName[ar]': 'حسابات واتساب',
  'Comment[ar]': 'كل حسابات واتساب في نافذة واحدة',
  Keywords: 'whatsapp;chat;messages;diwan;',
  'Keywords[ar]': 'واتساب;دردشة;رسائل;ديوان;',
  StartupWMClass: 'diwan',
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.yousef5.diwan',
  productName: 'Diwan',
  executableName: 'diwan',
  copyright: 'Copyright © 2026 yousef5',
  directories: { output: 'release', buildResources: 'resources' },
  electronDist,
  afterPack,
  files: ['out/**/*', 'package.json'],
  asar: true,
  npmRebuild: false,
  // No auto-update feed (no app-update.yml / latest*.yml): releases are attached by CI, not published
  // by electron-builder.
  publish: null,
  // No `protocols:` on purpose: Diwan must never take whatsapp: links (or any default) away from
  // another app. Opt in by hand: xdg-mime default diwan.desktop x-scheme-handler/whatsapp

  linux: {
    // `bun run package` / `package:arch` pass `--linux dir` explicitly.
    target: ['AppImage', 'deb', 'rpm'],
    artifactName: 'Diwan-${version}-${arch}.${ext}',
    category: 'Network;InstantMessaging;Chat',
    // Debian archive section (deb "Section:"), instead of fpm's "default".
    packageCategory: 'net',
    icon: 'resources/icon.png',
    // desktop file = diwan.desktop (package.json desktopName), matching Electron's app_id/WM_CLASS
    syncDesktopName: true,
    maintainer: 'yousef5 <yousef5@users.noreply.github.com>',
    vendor: 'yousef5',
    synopsis: 'Multi-account WhatsApp Web desktop client',
    // Also becomes the desktop entry's Comment (electron-builder always writes it from here).
    description: 'All your WhatsApp accounts in one window',
    desktop: { entry: desktopEntry },
  },
  deb: {
    // What the Electron 44 binary links against (readelf -d NEEDED) plus what it dlopen()s and Diwan
    // uses: libnotify (notifications), libsecret (safeStorage). electron-builder's libxss1/libxtst6
    // defaults are neither, so they're dropped. The `|` forms cover the Ubuntu 24.04 / Debian 13 t64
    // renames.
    depends: [
      'libgtk-3-0 | libgtk-3-0t64',
      'libnotify4',
      'libnss3',
      'xdg-utils',
      'libatspi2.0-0 | libatspi2.0-0t64',
      'libuuid1',
      'libsecret-1-0',
      'libasound2 | libasound2t64',
      'libcups2 | libcups2t64',
      'libgbm1',
      'libxkbcommon0',
    ],
    // Drops electron-builder's default Recommends (libappindicator3-1): the tray uses
    // StatusNotifierItem over D-Bus itself, and current Debian/Ubuntu replaced that package with Ayatana.
    recommends: [],
  },
  rpm: {
    // Same rule as deb. Fedora names first, openSUSE second. No libXScrnSaver (RHEL 10 dropped it) or
    // libXtst: the binary doesn't use them.
    depends: [
      'gtk3',
      'libnotify',
      'nss',
      'xdg-utils',
      'at-spi2-core',
      '(libuuid or libuuid1)',
      '(alsa-lib or libasound2)',
      '(cups-libs or libcups2)',
      '(mesa-libgbm or libgbm1)',
      '(libxkbcommon or libxkbcommon0)',
    ],
  },
  appImage: {
    artifactName: 'Diwan-${version}-${arch}.${ext}',
    // electron-builder's default here is ['--no-sandbox'] (always, on every distro).
    executableArgs: [],
  },

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.ico',
  },
  nsis: {
    artifactName: 'Diwan-Setup-${version}.${ext}',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createStartMenuShortcut: true,
    shortcutName: 'Diwan',
    // customUnInstall: removes the whatsapp: handler, but only when it runs this install's Diwan.exe.
    include: 'resources/installer.nsh',
  },
}
