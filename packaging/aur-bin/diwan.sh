#!/bin/sh
# Native Wayland when a live Wayland socket exists, otherwise Electron picks X11.
case $WAYLAND_DISPLAY in
  /*) sock=$WAYLAND_DISPLAY ;;
  *) sock=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/$WAYLAND_DISPLAY ;;
esac
if [ -n "$WAYLAND_DISPLAY" ] && [ -S "$sock" ]; then
  set -- --ozone-platform=wayland "$@"
fi
exec /opt/diwan/diwan "$@"
