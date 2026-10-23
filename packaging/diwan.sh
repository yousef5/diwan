#!/bin/sh
# Diwan launcher (/usr/bin/diwan). On a Wayland session (Hyprland) open a native Wayland window, never
# XWayland. Electron 44 only picks Wayland by itself when XDG_SESSION_TYPE=wayland, and it no longer
# knows --ozone-platform-hint or ELECTRON_OZONE_PLATFORM_HINT (--ozone-platform=auto is fatal), so the
# platform is named outright. A later --ozone-platform=… argument still wins (the last one counts).
if [ -n "$WAYLAND_DISPLAY" ]; then
  set -- --ozone-platform=wayland "$@"
fi
exec /opt/diwan/diwan "$@"
