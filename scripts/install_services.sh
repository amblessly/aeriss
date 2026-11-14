#!/usr/bin/env bash
set -euo pipefail

# Install AERIS as a systemd service (run on Raspberry Pi with sudo).
# Usage: sudo bash scripts/install_services.sh /path/to/aeris-project [python_bin] [service_user]

WORKDIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
PYTHON_BIN="${2:-$(command -v python3)}"
SERVICE_USER="${3:-${SUDO_USER:-pi}}"
SERVICE_NAME="aeris.service"
TARGET="/etc/systemd/system/${SERVICE_NAME}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root: sudo bash scripts/install_services.sh [workdir] [python_bin] [user]"
  exit 1
fi

if [[ ! -d "$WORKDIR/app" ]]; then
  echo "Invalid workdir: $WORKDIR (missing app/)"
  exit 1
fi

mkdir -p "$WORKDIR/logs"

TMP=$(mktemp)
sed \
  -e "s|%i_user%|${SERVICE_USER}|g" \
  -e "s|%i_workdir%|${WORKDIR}|g" \
  -e "s|%i_python%|${PYTHON_BIN}|g" \
  "$WORKDIR/scripts/aeris.service" > "$TMP"
install -m 644 "$TMP" "$TARGET"
rm -f "$TMP"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME" || true

echo "Installed and started $SERVICE_NAME"
echo "Dashboard target: http://192.168.4.1:5000 (when hotspot/network configured)"
