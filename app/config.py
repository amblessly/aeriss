"""Runtime configuration for AERIS Raspberry Pi 4B deployment.

Values are environment-overridable where practical. Hardware-specific values
(pinouts, I2C bus/address, LoRa radio params) must be verified on the target
device before field use.
"""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
APP_DIR = BASE_DIR / "app"
WEBSITE_DIR = BASE_DIR / "website"
LOGS_DIR = BASE_DIR / "logs"
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Server / dashboard
HOST = os.getenv("AERIS_HOST", "0.0.0.0")
PORT = int(os.getenv("AERIS_PORT", "5000"))
DASHBOARD_URL = os.getenv("AERIS_DASHBOARD_URL", "http://192.168.4.1:5000")

# Wi-Fi hotspot (target; actual provisioning is done via scripts/system config on Raspberry Pi)
# Defaults are prepared for Raspberry Pi 4B AERIS ground-station deployment.
HOTSPOT_SSID = os.getenv("AERIS_HOTSPOT_SSID", "aeris-groundstation")
HOTSPOT_IP = os.getenv("AERIS_HOTSPOT_IP", "192.168.4.1")
# Password must be provided via protected environment/config on deployment; never hardcode in frontend or expose via public APIs.
HOTSPOT_PASSWORD = os.getenv("AERIS_HOTSPOT_PASSWORD")
HOTSPOT_PASSWORD_CONFIGURED = bool(HOTSPOT_PASSWORD)

# MLX90640 thermal sensor
MLX90640_ENABLED = os.getenv("AERIS_MLX90640_ENABLED", "1") == "1"
MLX90640_I2C_BUS = int(os.getenv("AERIS_MLX90640_I2C_BUS", "1"))
MLX90640_I2C_ADDRESS = int(os.getenv("AERIS_MLX90640_I2C_ADDRESS", "0x33"), 16)
MLX90640_REFRESH_HZ = int(os.getenv("AERIS_MLX90640_REFRESH_HZ", "4"))  # 1,2,4,8,16,32,64
THERMAL_FRAME_WIDTH = 32
THERMAL_FRAME_HEIGHT = 24

# Thermal presence detection (simple threshold/blob heuristic; not human classification)
THERMAL_PRESENCE_DELTA_C = float(os.getenv("AERIS_THERMAL_PRESENCE_DELTA_C", "4.0"))
THERMAL_PRESENCE_MIN_PIXELS = int(os.getenv("AERIS_THERMAL_PRESENCE_MIN_PIXELS", "6"))
THERMAL_MIN_VALID_C = float(os.getenv("AERIS_THERMAL_MIN_VALID_C", "-40.0"))
THERMAL_MAX_VALID_C = float(os.getenv("AERIS_THERMAL_MAX_VALID_C", "300.0"))

# LoRa 02 (SX127x-compatible SPI radios are common; verify actual chipset/pins/frequency)
LORA_ENABLED = os.getenv("AERIS_LORA_ENABLED", "1") == "1"
LORA_SPI_BUS = int(os.getenv("AERIS_LORA_SPI_BUS", "0"))
LORA_SPI_DEVICE = int(os.getenv("AERIS_LORA_SPI_DEVICE", "0"))
LORA_SPI_SPEED_HZ = int(os.getenv("AERIS_LORA_SPI_SPEED_HZ", "5000000"))
LORA_PIN_NSS = int(os.getenv("AERIS_LORA_PIN_NSS", "8"))    # BCM, CE0 default
LORA_PIN_RESET = int(os.getenv("AERIS_LORA_PIN_RESET", "25"))
LORA_PIN_DIO0 = int(os.getenv("AERIS_LORA_PIN_DIO0", "24"))
LORA_FREQUENCY_MHZ = float(os.getenv("AERIS_LORA_FREQUENCY_MHZ", "433.0"))  # VERIFY for LoRa 02 variant
LORA_TX_POWER_DBM = int(os.getenv("AERIS_LORA_TX_POWER_DBM", "17"))
LORA_SPREADING_FACTOR = int(os.getenv("AERIS_LORA_SPREADING_FACTOR", "7"))
LORA_BANDWIDTH_HZ = int(os.getenv("AERIS_LORA_BANDWIDTH_HZ", "125000"))
LORA_CODING_RATE = int(os.getenv("AERIS_LORA_CODING_RATE", "5"))  # 5..8 => 4/5..4/8
LORA_PREAMBLE_LENGTH = int(os.getenv("AERIS_LORA_PREAMBLE_LENGTH", "8"))
LORA_SYNC_WORD = int(os.getenv("AERIS_LORA_SYNC_WORD", "0x12"), 16)
LORA_ENABLE_CRC = os.getenv("AERIS_LORA_ENABLE_CRC", "1") == "1"
LORA_REQUIRE_ACK = os.getenv("AERIS_LORA_REQUIRE_ACK", "0") == "1"
LORA_ACK_TIMEOUT_S = float(os.getenv("AERIS_LORA_ACK_TIMEOUT_S", "1.5"))
LORA_MAX_RETRIES = int(os.getenv("AERIS_LORA_MAX_RETRIES", "2"))
LORA_TX_INTERVAL_S = float(os.getenv("AERIS_LORA_TX_INTERVAL_S", "2.0"))

# Storage
DATABASE_PATH = Path(os.getenv("AERIS_DATABASE_PATH", str(DATA_DIR / "aeris.db")))

# Device / mission identity
DEVICE_ID = os.getenv("AERIS_DEVICE_ID", "aeris-rpi4b-01")
DEVICE_NAME = os.getenv("AERIS_DEVICE_NAME", "AERIS Raspberry Pi 4B")

# GPS/altitude are unavailable without a positioning source; keep explicit unknowns.
DEFAULT_LAT = os.getenv("AERIS_DEFAULT_LAT")
DEFAULT_LNG = os.getenv("AERIS_DEFAULT_LNG")
DEFAULT_ALTITUDE_M = os.getenv("AERIS_DEFAULT_ALTITUDE_M")

# Offline street map (PMTiles + MapLibre GL JS; locally hosted only; no online fallback)
# Map data lives in DATA_DIR/maps (gitignored runtime data):
#   aeris.pmtiles                 vector tile archive (OpenStreetMap-derived; see data/maps/README.md)
#   fonts/{fontstack}/{range}.pbf local glyph PBFs used by the MapLibre style
MAP_DATA_DIR = Path(os.getenv("AERIS_MAP_DATA_DIR", str(DATA_DIR / "maps")))
MAP_PMTILES_PATH = Path(os.getenv("AERIS_MAP_PMTILES_PATH", str(MAP_DATA_DIR / "aeris.pmtiles")))
# High-zoom operational-area archive (z0–17, Maragondon/Cavite bbox). Served in preference
# to the nationwide z0–15 archive when present and valid. The nationwide archive is never modified.
MAP_PMTILES_HQ_PATH = Path(os.getenv("AERIS_MAP_PMTILES_HQ_PATH", str(MAP_DATA_DIR / "aeris-hq.pmtiles")))
MAP_FONTS_DIR = Path(os.getenv("AERIS_MAP_FONTS_DIR", str(MAP_DATA_DIR / "fonts")))
MAP_ATTRIBUTION = os.getenv(
    "AERIS_MAP_ATTRIBUTION",
    '© <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
)
MAP_MIN_ZOOM = int(os.getenv("AERIS_MAP_MIN_ZOOM", "0"))
MAP_MAX_ZOOM = int(os.getenv("AERIS_MAP_MAX_ZOOM", "15"))
MAP_DEFAULT_ZOOM = int(os.getenv("AERIS_MAP_DEFAULT_ZOOM", "13"))
# Operational area default: Maragondon, Cavite, Philippines
MAP_DEFAULT_LAT = float(os.getenv("AERIS_MAP_DEFAULT_LAT", "14.3045"))
MAP_DEFAULT_LNG = float(os.getenv("AERIS_MAP_DEFAULT_LNG", "120.7408"))

# Optional local GNSS (USB/serial GPS/gnss receiver, NMEA 0183) — genuine satellite
# positioning with no internet dependency. No hardware => service reports unavailable.
# AERIS_GPS_ENABLED=auto|off|on, AERIS_GPS_PORT=/dev/ttyUSB0, AERIS_GPS_BAUD=9600
GPS_ENABLED = os.getenv("AERIS_GPS_ENABLED", "auto")
GPS_PORT = os.getenv("AERIS_GPS_PORT", "")
GPS_BAUD = int(os.getenv("AERIS_GPS_BAUD", "9600"))
GPS_FRESH_S = float(os.getenv("AERIS_GPS_FRESH_S", "10"))

# Optional HTTPS for secure-context browser geolocation over LAN (recommended for laptop access)
SSL_CERTFILE = os.getenv("AERIS_SSL_CERTFILE")
SSL_KEYFILE = os.getenv("AERIS_SSL_KEYFILE")
