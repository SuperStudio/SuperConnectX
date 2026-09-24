#!/bin/sh
set -eu

# This file is owned by SuperConnectX and is the only system file created by
# linux-after-install.sh. Remove it when the Debian package is removed.
UDEV_RULE="/etc/udev/rules.d/70-superconnectx-serial.rules"

rm -f "$UDEV_RULE"

if command -v udevadm >/dev/null 2>&1; then
  udevadm control --reload-rules || true
fi
