// Test-only Electron entry for the E2E suite. Playwright launches Electron with THIS file instead of
// the app's own entry: it serves a stand-in https://web.whatsapp.com, cuts off the network, records
// what main does with notifications and the tray, then loads the real built app (out/main/index.js).
// Production code has no test hook: none of this exists unless Electron is started on this file, and
// electron-builder only packages out/**.
const { app, ipcMain, Notification, nativeImage, Tray } = require('electron')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

// Every directory the app could write to must be a throwaway one made by tests/e2e/helpers.ts.
const scratch = join(tmpdir(), 'diwan-e2e-')
for (const key of ['HOME', 'DIWAN_USER_DATA', 'DIWAN_NEXUS_HOME', 'XDG_DOWNLOAD_DIR', 'XDG_CONFIG_HOME']) {
  const value = process.env[key]
  if (!value || !resolve(value).startsWith(scratch)) {
    console.error(`[e2e] refusing to start: ${key} is not a throwaway directory (${value})`)
    process.exit(2)
  }
}

// No real network at all: nothing resolves, so a request that slipped past the stand-in fails.
app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE localhost')

// The stand-in WhatsApp page: enough for the guest preload, the title-based unread count and the
// notification shim. A test sets document.title or calls new Notification() inside it.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>WhatsApp</title></head>
<body style="margin:0;background:#0b141a;color:#e9edef;font:16px sans-serif">
<h2 style="font-weight:400;text-align:center;margin-top:40vh">Stand-in WhatsApp</h2></body></html>`

const serve = (request) => {
  const { hostname } = new URL(request.url)
  if (hostname === 'web.whatsapp.com' && request.method === 'GET')
    return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  return new Response('', { status: 404 })
}
app.on('session-created', (session) => {
  session.protocol.handle('https', serve)
  session.protocol.handle('http', serve)
})

// What the tests read back through electronApp.evaluate().
const e2e = {
  guests: [], // every <webview> guest: { id, partition, loads, destroyed }
  notifications: [], // every native notification main showed (recorded, never sent to a server)
  badges: new Map(), // tray badge key ('none', '1'…'9', '9+') -> data URL, as the shell drew them
  tray: [], // every tray image main set, as a badge key (or 'other')
}
globalThis.__e2e = e2e

Notification.prototype.show = function show() {
  e2e.notifications.push(this)
}

// Which badge an image is: the shell hands main data URLs per key (tray:setBadges), main turns
// each into a NativeImage, and the tray shows one of those.
const urlOf = new WeakMap()
const fromDataURL = nativeImage.createFromDataURL
nativeImage.createFromDataURL = (url) => {
  const image = fromDataURL(url)
  urlOf.set(image, url)
  return image
}
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, fn) =>
  handle(
    channel,
    channel === 'tray:setBadges'
      ? (event, images, ...rest) => {
          if (images && typeof images === 'object')
            for (const [key, url] of Object.entries(images)) e2e.badges.set(key, url)
          return fn(event, images, ...rest)
        }
      : fn,
  )
const setImage = Tray.prototype.setImage
Tray.prototype.setImage = function (image) {
  const url = urlOf.get(image)
  const key = [...e2e.badges].find(([, u]) => u === url)?.[0]
  e2e.tray.push(key ?? 'other')
  return setImage.call(this, image)
}

app.on('web-contents-created', (_event, wc) => {
  if (wc.getType() !== 'webview') return
  const guest = { id: wc.id, partition: '', loads: 0, destroyed: false }
  e2e.guests.push(guest)
  wc.on('did-start-loading', () => {
    guest.loads++
  })
  wc.on('destroyed', () => {
    guest.destroyed = true
  })
})
app.on('web-contents-created', (_event, wc) => {
  // the partition is only known once the guest is attached to its <webview>
  wc.on('did-attach-webview', (_e, guest) => {
    const g = e2e.guests.find((x) => x.id === guest.id)
    if (g) g.partition = guest.session.storagePath ?? ''
  })
})

require(join(__dirname, '../../../out/main/index.js'))
