#!/usr/bin/env bash
set -euo pipefail

# Configure Raspberry Pi 4B Wi-Fi hotspot for AERIS ground station using NetworkManager (nmcli).
# RUN THIS ON THE RASPBERRY PI ONLY. Do not apply to the development laptop.
#
# Target (deployment):
#   SSID: aeris-groundstation
#   Security: WPA2-PSK
#   Gateway/IP: 192.168.4.1/24
#   Dashboard: http://192.168.4.1:5000
#
# Usage:
#   sudo AERIS_HOTSPOT_PASSWORD='pi12345678' bash scripts/setup_hotspot_nmcli.sh [SSID] [CON_NAME] [IFNAME]
# or:
#   sudo bash scripts/setup_hotspot_nmcli.sh [SSID] [PASSWORD] [CON_NAME] [IFNAME]
#
# Recommended: store credentials in a protected env file (root-only), e.g. /etc/aeris/aeris.env:
#   AERIS_HOTSPOT_SSID=aeris-groundstation
#   AERIS_HOTSPOT_PASSWORD=pi12345678
#   sudo bash -c 'set -a; source /etc/aeris/aeris.env; set +a; bash scripts/setup_hotspot_nmcli.sh'

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '1,40p' "$0"
  exit 0
fi

SSID="${AERIS_HOTSPOT_SSID:-${1:-aeris-groundstation}}"

# Password resolution: env > arg2 (if 4 args form) > arg2 legacy > empty
PASSWORD="${AERIS_HOTSPOT_PASSWORD:-}"
CON_NAME="${AERIS_HOTSPOT_CON_NAME:-aeris-hotspot}"
IFNAME="${AERIS_HOTSPOT_IFNAME:-wlan0}"
HOTSPOT_IP="${AERIS_HOTSPOT_IP:-192.168.4.1}"

# Support legacy call: setup_hotspot_nmcli.sh [SSID] [PASSWORD] [CON_NAME] [IFNAME]
if [[ -z "$PASSWORD" && $# -ge 2 ]]; then
  # If 2nd arg looks like a connection name or interface, treat as no password provided
  if [[ $# -eq 2 && "$2" != "aeris-"* && "$2" != "wl"* && "$2" != "en"* ]]; then
    PASSWORD="$2"
  elif [[ $# -ge 3 ]]; then
    PASSWORD="$2"
    CON_NAME="${3:-$CON_NAME}"
    IFNAME="${4:-$IFNAME}"
  else
    PASSWORD="$2"
  fi
fi
if [[ $# -ge 1 && "$1" != "$SSID" && -n "${1:-}" && "${AERIS_HOTSPOT_SSID:-}" == "" ]]; then
  # allow explicit SSID arg already handled
  :
fi
if [[ $# -eq 1 ]]; then
  # only SSID passed
  PASSWORD="${AERIS_HOTSPOT_PASSWORD:-$PASSWORD}"
fi

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root on Raspberry Pi: sudo AERIS_HOTSPOT_PASSWORD='***' bash scripts/setup_hotspot_nmcli.sh"
  exit 1
fi

if ! command -v nmcli >/dev/null 2>&1; then
  echo "nmcli (NetworkManager) not found. Install/enable NetworkManager or configure hostapd+dnsmasq manually."
  exit 1
fi

if [[ -z "$PASSWORD" || ${#PASSWORD} -lt 8 ]]; then
  echo "ERROR: AERIS hotspot password is required (WPA2-PSK, >= 8 chars)."
  echo "Provide via protected env/config: AERIS_HOTSPOT_PASSWORD=... or as script argument on the Raspberry Pi."
  exit 1
fi

# Remove existing connection with same name if present
if nmcli -t -f NAME con show | grep -Fxq "$CON_NAME"; then
  nmcli con delete "$CON_NAME" || true
fi

# Create hotspot/AP connection
nmcli con add type wifi ifname "$IFNAME" con-name "$CON_NAME" autoconnect yes ssid "$SSID"
nmcli con modify "$CON_NAME" 802-11-wireless.mode ap 802-11-wireless.band bg
nmcli con modify "$CON_NAME" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$PASSWORD"
# Configure local gateway IP for direct laptop connection (no internet required)
nmcli con modify "$CON_NAME" ipv4.method shared ipv4.addresses "${HOTSPOT_IP}/24"
nmcli con modify "$CON_NAME" ipv6.method ignore

echo "Bringing up hotspot '$CON_NAME' on $IFNAME..."
nmcli con up "$CON_NAME" || true

echo "---"
nmcli -f NAME,TYPE,DEVICE connection show --active || true
ip -4 addr show dev "$IFNAME" 2>/dev/null || true
echo "Configured SSID: $SSID"
echo "Configured gateway IP target: ${HOTSPOT_IP}"
echo "Dashboard URL (target): http://${HOTSPOT_IP}:5000"
echo "Security: WPA2-PSK (password not displayed)"
echo "Verify on Raspberry Pi and from a client laptop: connect to SSID and open dashboard URL."
