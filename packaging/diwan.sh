#!/bin/sh
# Diwan launcher (/usr/bin/diwan). On a Wayland session (Hyprland) open a native Wayland window, never
# XWayland. Electron 44 only picks Wayland by itself when XDG_SESSION_TYPE=wayland, and it no longer
# knows --ozone-platform-hint or ELECTRON_OZONE_PLATFORM_HINT (--ozone-platform=auto is fatal), so the
# platform is named outright, but only when the Wayland socket really exists (a stale WAYLAND_DISPLAY,
# say over ssh -X or in a TTY, falls back to X11). A later --ozone-platform=… argument still wins.
case $WAYLAND_DISPLAY in /*) sock=$WAYLAND_DISPLAY ;; *) sock=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/$WAYLAND_DISPLAY ;; esac
if [ -n "$WAYLAND_DISPLAY" ] && [ -S "$sock" ]; then set -- --ozone-platform=wayland "$@"; fi
exec /opt/diwan/diwan "$@"
