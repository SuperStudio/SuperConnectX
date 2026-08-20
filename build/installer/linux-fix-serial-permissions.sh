#!/bin/sh
# Runtime serial-permission fix for non-deb packages (AppImage etc.), executed
# as root via pkexec. Keep the udev rules in sync with linux-after-install.sh.
set -eu

UDEV_RULE="/etc/udev/rules.d/70-superconnectx-serial.rules"

# Grant the active local desktop session access to every serial-device family
# that the Linux port picker exposes. uaccess adds an ACL only for the active
# local session; it does not make the device globally writable.
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
