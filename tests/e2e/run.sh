#!/bin/sh
# Runs the E2E suite headless: a private D-Bus session (tray, notifications) and a virtual X display,
# so Electron never shows on the real desktop. `bun run e2e` builds the app first, then calls this.
# Extra arguments go to `playwright test` (e.g. a spec file, or --repeat-each 2).
set -eu
cd "$(dirname "$0")/../.."
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS XDG_SESSION_TYPE ELECTRON_RENDERER_URL
export DIWAN_E2E_HEADLESS=1
exec dbus-run-session --config-file=tests/e2e/fixtures/dbus-session.xml -- xvfb-run -a -s "-screen 0 1440x900x24" node_modules/.bin/playwright test "$@"
