#!/usr/bin/env bash
set -euo pipefail

# Generate a local self-signed certificate for AERIS HTTPS (development / LAN use).
# Browser geolocation requires a secure context; for laptop access over LAN use HTTPS
# with a certificate trusted by the client browser/device.
#
# Usage:
#   bash scripts/generate_local_https_cert.sh [output_dir] [cn_or_ip] [days]
# Example:
#   bash scripts/generate_local_https_cert.sh config/certs 192.168.4.1 825
#
# After generating:
#   - Set AERIS_SSL_CERTFILE and AERIS_SSL_KEYFILE (or place in config/certs and configure env)
#   - Start AERIS (uvicorn will serve HTTPS when both are set)
#   - Import/trust the certificate on the client laptop/browser as required by the OS/browser
#   - Access: https://<raspberry-pi-ip>:5000 (or your configured host)
#
# NOTE: Self-signed certs must be explicitly trusted by clients. For production-like LAN
# deployments consider a locally trusted CA (e.g. mkcert/local PKI) appropriate to your environment.

OUT_DIR="${1:-config/certs}"
CN="${2:-192.168.4.1}"
DAYS="${3:-825}"

mkdir -p "$OUT_DIR"
KEY="$OUT_DIR/aeris-local.key.pem"
CRT="$OUT_DIR/aeris-local.cert.pem"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required" >&2
  exit 1
fi

cat > "$OUT_DIR/openssl.cnf" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
x509_extensions = v3_req
distinguished_name = dn

[dn]
CN = ${CN}

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = aeris.local
IP.1 = 127.0.0.1
IP.2 = ${CN}
EOF

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$KEY" -out "$CRT" -days "$DAYS" \
  -config "$OUT_DIR/openssl.cnf"

chmod 600 "$KEY" || true
echo "Generated:"
echo "  Cert: $CRT"
echo "  Key : $KEY"
echo "Set: AERIS_SSL_CERTFILE=$CRT AERIS_SSL_KEYFILE=$KEY"
