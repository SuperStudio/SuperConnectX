#!/bin/sh
set -eu

APP_DIR="/opt/superconnectx"
SANDBOX="$APP_DIR/chrome-sandbox"
UDEV_RULE="/etc/udev/rules.d/70-superconnectx-serial.rules"

# dpkg strips the setuid bit from package payloads. Electron requires it when
# the application is installed outside a sandboxed package format.
if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX"
  chmod 4755 "$SANDBOX"
fi

# Grant the active local desktop session access to every serial-device family
# that the Linux port picker exposes. uaccess adds an ACL only for the active
# local session; it does not make the device globally writable.
# Keep the udev rules in sync with linux-fix-serial-permissions.sh.
cat > "$UDEV_RULE" <<'EOF'
SUBSYSTEM=="tty", KERNEL=="ttyUSB[0-9]*", TAG+="uaccess"
SUBSYSTEM=="tty", KERNEL=="ttyACM[0-9]*", TAG+="uaccess"
SUBSYSTEM=="tty", KERNEL=="ttyAMA[0-9]*", TAG+="uaccess"
SUBSYSTEM=="tty", KERNEL=="rfcomm[0-9]*", TAG+="uaccess"
SUBSYSTEM=="tty", KERNEL=="ttyS[0-9]*", TAG+="uaccess"
EOF

if command -v udevadm >/dev/null 2>&1; then
  udevadm control --reload-rules || true
  udevadm trigger --subsystem-match=tty --action=add || true
  udevadm settle || true
fi
