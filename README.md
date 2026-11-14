# AERIS — Raspberry Pi 4B Offline System (MLX90640 + LoRa 02 + Local Web Dashboard)

This repository contains the cleaned and restructured AERIS project targeting **Raspberry Pi 4B** as the edge processing unit and local web server. The system is designed to operate **offline** on a local Wi-Fi hotspot, use **real MLX90640 thermal data** for thermal presence detection, and transmit **selected real telemetry** over **LoRa 02** (when hardware is available/configured). The **existing AERIS website UI** has been preserved and moved to `website/` and integrated with a local backend API/WebSocket.

> **Hardware verification status:** This workspace refactor/implementation was completed without attached MLX90640/LoRa/hotspot hardware. Real-hardware reads/transmissions and on-device network/service behavior are **NOT TESTED** here and must be verified on the target Raspberry Pi 4B. The application does **not** generate simulated sensor/radio data.

## Final system architecture (target)

### Thermal data path
`MLX90640 (32×24, I2C)` → `Raspberry Pi 4B` → `Thermal processing` → `Thermal presence detection (heuristic)` → `Local storage (SQLite)`

### Long-range communication path
`Raspberry Pi 4B` → `LoRa 02 transmitter (SPI/GPIO)` → `LoRa receiver / ground station` *(receiver hardware/integration required for end-to-end confirmation)*

### Local dashboard path
`Raspberry Pi 4B Wi-Fi hotspot (AERIS-AP)` → `Laptop` → `Existing AERIS website` served by local backend (`http://192.168.4.1:5000` target)

These paths are separate: **LoRa is not required for laptop access to the locally hosted website**.

## Clean project structure

```text
.
├── app/                         # Raspberry Pi 4B application (backend + hardware integration)
│   ├── main.py                  # Entry point (runs local server)
│   ├── config.py                # Runtime/hardware/network configuration (env-overridable)
│   ├── sensors/
│   │   ├── mlx90640.py          # Real MLX90640 I2C reader (no simulated data)
│   │   └── thermal_processing.py# Frame stats, heatmap grid, thermal presence heuristic
│   ├── ai/
│   │   └── human_detection.py   # Thermal presence detection wrapper (not human identification)
│   ├── communication/
│   │   ├── lora_transmitter.py  # Real SX127x-style LoRa TX over SPI/GPIO (config-dependent)
│   │   └── lora_receiver.py     # RX status/interface placeholder (receiver not verified)
│   ├── dashboard/
│   │   └── routes.py            # FastAPI server, REST/WS APIs, serves website build
│   ├── storage/
│   │   └── database.py          # SQLite storage for readings/events/transmissions
│   └── services/
│       └── data_manager.py      # Polling loop, state, LoRa telemetry scheduling
├── website/                     # Existing AERIS website (React + Vite + TypeScript), preserved UI
│   ├── src/ ...                 # Adapted to consume real local backend state (no simulated fallback)
│   ├── public/ ...
│   ├── package.json
│   └── ...
├── scripts/
│   ├── aeris.service            # systemd unit template
│   ├── install_services.sh      # installs/enables service on Raspberry Pi
│   └── setup_hotspot_nmcli.sh   # hotspot helper (NetworkManager/nmcli)
├── logs/                        # runtime logs
├── data/                        # created at runtime (SQLite DB) - gitignored
├── tests/                       # placeholder for future tests
├── archive/
│   └── legacy-*/                # archived legacy implementations (RPi5, old onboard/ground-station trees, etc.)
├── requirements.txt
├── .gitignore
└── README.md
```

## Backup and cleanup performed

- **External full backup created (outside project):** `/home/blezlyy/Documents/projects/aeris-project-backup-20261114-120327` (complete copy including `.git`).
- **Archived in-repo (not permanently deleted):**
  - `archive/legacy-20261114-120343/raspberry-pi-5/` (RPi 5 implementation and `hardware_simulator.py`).
  - `archive/legacy-20261114-120404/drone-onboard/` (legacy onboard tree including previous `raspberry-pi-4b/` implementation used as migration source).
  - `archive/legacy-20261114-120404/ground-station/` (legacy FastAPI backend and original frontend location before move to `website/`).
- **Removed artifacts:** `ground-station/backend/__pycache__/` bytecode cache.
- **Investigated:** `_check.html` and `0` not found in project.
- **Preserved:** `.git` history, existing AERIS website UI/components/pages/styles, useful logging/storage concepts (reimplemented for real data), and project paper.

## Key files modified/created (high level)

- **Created (new app):** `app/**` (config, MLX90640 reader, thermal processing, presence detection, LoRa TX/RX status, SQLite storage, data manager, FastAPI server, entrypoint).
- **Created (ops/docs/config):** `scripts/aeris.service`, `scripts/install_services.sh`, `scripts/setup_hotspot_nmcli.sh`, `scripts/generate_local_https_cert.sh`, `config/aeris-groundstation.env.example`, `data/maps/README.md`, updated `requirements.txt`, updated `.gitignore`, rewritten `README.md`.
- **Moved/preserved:** `ground-station/frontend/*` → `website/*` (existing website).
- **Modified (website integration, simulation removal, Wi-Fi status, offline map):** `website/src/App.tsx`, `website/src/hooks/useWebSocket.ts`, `website/src/hooks/useTelemetrySimulation.ts` (disabled), `website/src/stores/appStore.ts`, `website/src/types/index.ts`, `website/src/components/LiveFeed.tsx`, `website/src/components/CommLinkHealth.tsx`, `website/src/components/DetectionsTable.tsx`, `website/src/components/SurvivorModal.tsx`, `website/src/components/MissionMap.tsx`, `website/src/pages/LiveFeedPage.tsx`, `website/src/pages/MapPage.tsx`, `website/src/components/ActiveMission.tsx`, `website/src/index.css`, `website/public/vendor/leaflet/*` (local Leaflet assets), `app/config.py`, `app/dashboard/routes.py`, `app/services/data_manager.py` to use real backend state, remove random/fake data, implement stable Wi-Fi/AP client status behavior, and integrate a fully offline street-only map panel.
- **Pre-change backup (this session):** `backup/offline-map-20261114-151815/` (copies of files modified for the offline map implementation).

## Offline live GPS street map (implemented, offline-first)

### Architecture (local/offline)
- **Map rendering:** Leaflet (bundled locally via project dependencies/build; local vendor assets also stored in `website/public/vendor/leaflet/`). **No external CDN, no online tile fallback.**
- **Map style:** **Street map only** (satellite/hybrid/terrain removed).
- **Map data storage (local):**
  - MBTiles: `data/maps/streets.mbtiles` (default, configurable via `AERIS_MAP_MBTILES_PATH`)
  - or XYZ tiles: `data/maps/tiles/{z}/{x}/{y}.png|jpg|webp` (configurable via `AERIS_MAP_TILES_DIR`)
- **Tile serving:** local backend endpoint `GET /api/map/tiles/{z}/{x}/{y}.png` (serves only local MBTiles/XYZ; returns 404 JSON when unavailable). Map status/config: `GET /api/map/status`.
- **Attribution:** OpenStreetMap attribution supported/configurable (`AERIS_MAP_ATTRIBUTION`). Use appropriate attribution for the dataset you load.
- **Coverage:** configurable/preloaded geographic area and zoom range only (no automatic worldwide download). Locations outside preloaded coverage may have no street details; GPS coordinates may still be available from the device/browser.

### Live GPS location (browser-based, real data only)
- Uses `navigator.geolocation.watchPosition()` when the user starts location tracking.
- **Blue dot:** custom Google Maps-style marker with white border and accuracy circle based on reported GPS accuracy; smooth updates without full map reload. **No fake blue dot when location is unavailable.**
- **Displayed data:** latitude, longitude, GPS accuracy (m), last update time, location/tracking/permission status.
- **Heading:** directional cone shown only when valid heading is available (device orientation/compass APIs, or GPS course-over-ground only while moving). Heading source indicated; `N/A` when unavailable/unreliable. Stationary GPS direction is not treated as compass heading.
- **Permissions:** requested on user action; supports browser persistent Allow where available (do not repeatedly prompt after granted). Permission denial/errors/timeouts/unavailable states handled with meaningful messages.
- **Location source:** actual browser/device location provider only (never fabricated). Raspberry Pi 4B has no built-in GPS; laptop browser geolocation uses laptop location services. Separate device GPS receiver integration on RPi backend can be added for device-native location (not claimed/tested here).

### Secure context (HTTPS) for browser geolocation
- Browser geolocation requires a secure context. Plain HTTP over ordinary LAN IP may not allow geolocation.
- Backend supports HTTPS when configured: set `AERIS_SSL_CERTFILE` and `AERIS_SSL_KEYFILE` (uvicorn SSL). Helper script: `scripts/generate_local_https_cert.sh`.
- For LAN access, use a certificate trusted by the client browser/OS (self-signed must be explicitly trusted/imported; local PKI/mkcert may be used as appropriate). Users can grant persistent location permission via browser site settings (lock/info icon → Location → Allow) after trust/permission setup.
- The UI reports secure-context/permission/location errors; it does not bypass browser restrictions.

### Dashboard UI (Map page/panel)
- Street map only (no satellite/hybrid/terrain/layer switcher), center-on-location, recenter, zoom controls, and status/info panel.
- **Location status labels:** Waiting for Permission, Requesting Location, Active, Permission Denied, Location Unavailable, GPS Signal Unavailable.
- **Map status labels:** Offline Map Ready, Loading Local Map, Outside Available Map Coverage, Map Data Missing.
- Statuses reflect actual state (not forced to Connected/Active). Design kept consistent with existing AERIS dashboard; unrelated features preserved. Thermal Feed and other dashboard sections not modified for this work.

### Map configuration (env/config)
- `AERIS_MAP_DATA_DIR`, `AERIS_MAP_TILES_DIR`, `AERIS_MAP_MBTILES_PATH`
- `AERIS_MAP_ATTRIBUTION`, `AERIS_MAP_MIN_ZOOM`, `AERIS_MAP_MAX_ZOOM`, `AERIS_MAP_DEFAULT_ZOOM`
- `AERIS_MAP_DEFAULT_LAT`, `AERIS_MAP_DEFAULT_LNG`
- `AERIS_SSL_CERTFILE`, `AERIS_SSL_KEYFILE`

## Installation and startup (Raspberry Pi 4B) — updated notes
- Build website (`npm ci && npm run build` in `website/`) so backend serves local frontend/assets.
- Place offline street map data on the Pi (`data/maps/streets.mbtiles` or `data/maps/tiles/...`) for the required coverage/zoom levels.
- (Recommended for geolocation) configure HTTPS cert/key and start with SSL env vars set; trust cert on client laptop and access via `https://<pi-ip>:5000`.
- Start backend: `python -m app.main` (or systemd via `scripts/install_services.sh`), bind as configured (`AERIS_HOST`/`AERIS_PORT`).
- Laptop access: connect to AERIS hotspot/network, open dashboard URL (HTTP for UI access where available; **HTTPS/secure context required for browser geolocation**), start location tracking, allow permission. 

## MLX90640 real thermal integration (implementation)

- **Interface:** I2C (`app/sensors/mlx90640.py`), default bus `1`, address `0x33` (configurable).
- **Reads:** actual 32×24 frames via supported drivers when installed/available (`adafruit-circuitpython-mlx90640`/Blinka stack or compatible `mlx90640` driver fallback). No random/fake frames.
- **Processing:** min/max/avg, 2D heatmap grid, adaptive threshold presence heuristic (`app/sensors/thermal_processing.py`).
- **Detection:** thermal presence only (heuristic confidence score), **not** biometric human identification.
- **Error handling:** sensor disabled/unavailable/read failures are reported as disconnected/unavailable with error details; UI shows "no live thermal data" instead of fabricated values.
- **Verify on device:** `i2cdetect -y 1` should show device at configured address; enable I2C in Raspberry Pi configuration.

## LoRa 02 communication (implementation)

- **Role:** Raspberry Pi processes thermal data; LoRa transmits **selected telemetry/results only** (no continuous thermal image/video).
- **Implementation:** `app/communication/lora_transmitter.py` performs real SX127x register configuration and SPI packet TX when `spidev` + `RPi.GPIO` and correct wiring/config are available.
- **Packet contents:** device id, timestamp, sequence number, sensor status, detection status/type/confidence, thermal summary, and error/status fields.
- **Reliability features:** sequence numbers, TX-done confirmation via IRQ flag/DIO0 polling, error/status recording, transmission logging. ACK/retry logic hooks/config exist conceptually but **receiver-dependent ACK protocol is not fully verified** without a compatible receiver.
- **No simulation:** no UDP localhost LoRa replacement, no fabricated RSSI/SNR/PLR/delivery claims.
- **Receiver:** `app/communication/lora_receiver.py` is a status placeholder; **compatible LoRa receiver hardware/software is required** for reception, RSSI/SNR measurement, and end-to-end validation.
- **Important:** LoRa 02 variants differ (chipset/frequency/pins). You must verify chipset, frequency band, SPI/GPIO pinout, and antenna before operation.

## Wi-Fi hotspot and local dashboard access (Raspberry Pi 4B ground station target)

- **Target SSID:** `aeris-groundstation`
- **Security:** `WPA2-PSK`
- **Gateway/IP:** `192.168.4.1`
- **Dashboard URL:** `http://192.168.4.1:5000`
- **Backend bind:** `0.0.0.0:5000` (`app/config.py`, env-overridable)
- **Operation:** Raspberry Pi 4B hosts the local Wi-Fi access point; laptop connects directly (no internet required). LoRa is independent of local dashboard access.
- **Frontend connection:** WebSocket/API uses same-origin host (`ws(s)://<dashboard-host>/ws`) when served by backend; no cloud dependency for core local operation.

### Development mode vs Raspberry Pi hotspot mode
- **Development mode (Ubuntu laptop, no AERIS AP hosted):** dashboard shows **Connecting** (stable) while waiting for an actual AERIS ground-station client/hotspot connection. It does **not** report Connected based on the laptop's existing/local Wi-Fi connection.
- **Raspberry Pi hotspot mode (AERIS AP hosted on RPi):** dashboard shows **Connecting** while the AP is up but no client is connected, and **Connected** only when an actual laptop/client association is verified (e.g. via AP station/client info such as `iw station dump`).

### Protected credentials and deployment preparation
- Wi-Fi credentials/config are read from protected environment/config (e.g. `/etc/aeris/aeris.env`, root-owned `chmod 600`) or deployment environment variables. **Wi-Fi password is never exposed via frontend JavaScript or public API responses.**
- Example protected config: `config/aeris-groundstation.env.example`
- Hotspot provisioning script (run on Raspberry Pi only): `scripts/setup_hotspot_nmcli.sh` (configures NetworkManager AP, WPA2-PSK, target gateway `192.168.4.1`).
- Service template: `scripts/aeris.service` (loads optional `EnvironmentFile` from `/etc/aeris/aeris.env` or project config path).
- **Not applied to the development laptop:** Raspberry Pi-specific network/hotspot changes must be performed on the target device only. Not applied/tested in this environment.

## Installation and startup (Raspberry Pi 4B)

### 1) System prerequisites (on Raspberry Pi OS)
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip i2c-tools git
# Enable I2C and SPI: sudo raspi-config -> Interface Options
```

### 2) Python environment and app dependencies
```bash
cd /path/to/aeris-project
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# Install hardware driver libraries as required by your setup, e.g.:
# pip install adafruit-blinka adafruit-circuitpython-mlx90640 smbus2 spidev RPi.GPIO
```

### 3) Build existing website (recommended for production serving)
```bash
cd website
npm ci   # or npm install
npm run build
cd ..
```
The backend serves `website/dist` when present (and falls back to `website/index.html` only if needed).

### 4) Configure hardware/environment
Set env vars or edit `app/config.py` defaults for your verified hardware:
- MLX90640: `AERIS_MLX90640_I2C_BUS`, `AERIS_MLX90640_I2C_ADDRESS`, `AERIS_MLX90640_REFRESH_HZ`
- LoRa 02: `AERIS_LORA_*` (SPI bus/device, reset/DIO0/NSS pins, frequency, SF/BW/CR, power, sync word)
- Device/network: `AERIS_DEVICE_ID`, `AERIS_HOTSPOT_SSID`, `AERIS_HOTSPOT_IP`

### 5) Run manually
```bash
source .venv/bin/activate
python -m app.main
# or: uvicorn app.dashboard.routes:app --host 0.0.0.0 --port 5000
```

### 6) Auto-start on boot (systemd)
```bash
sudo bash scripts/install_services.sh /path/to/aeris-project /path/to/aeris-project/.venv/bin/python pi
```
Review/edit `scripts/aeris.service` as needed for your user/paths/environment.

## Hardware pin/wiring notes (must verify on actual hardware)

- **MLX90640:** I2C (SDA/SCL), 3.3V and GND per sensor breakout specs; default address typically `0x33`.
- **LoRa 02 (SX127x common wiring, verify exact module):** SPI (`MOSI`, `MISO`, `SCLK`), `NSS/CS`, `RESET`, `DIO0` to GPIO, 3.3V/GND, proper antenna. Defaults in config assume common RPi mappings (`CE0` NSS=BCM8, RST=BCM25, DIO0=BCM24) but **must be confirmed** for your board/module.
- **Power:** ensure stable supply for RPi 4B + peripherals; do not power modules beyond rated voltage.

## API / data behavior (local, real-data-only)

- `GET /api/status` — full system state (sensor, thermal, detection, LoRa, network, recent detections)
- `GET /api/system` — summary
- `GET /api/thermal/latest` — latest thermal/detection snapshot
- `GET /api/detections` — recent stored detection events
- `WS /ws` — real-time `system_state` broadcasts (+ compatibility messages)
- External/simulated detection injection via `POST /api/detection` is rejected in production mode.

## Actual testing and validation results

| Test | Result | Notes |
|---|---|---|
| Wi-Fi status: development mode (Ubuntu laptop) | **TESTED (dev)** | Stable repeated checks: `state=connecting`, `operation_mode=development`, `hosting_ap=false`, `target_ssid=aeris-groundstation`, `ssid/ip/signal=null`, `verified=true`; no flapping and no local network/gateway shown as client info. |
| Wi-Fi config/deployment prep (RPi target) | **PREPARED, NOT APPLIED ON DEV LAPTOP** | `aeris-groundstation` (WPA2-PSK), gateway `192.168.4.1`, dashboard `http://192.168.4.1:5000`; protected env and hotspot/service scripts prepared. RPi-specific network changes not applied on dev laptop. |
| Wi-Fi hotspot hosting / laptop AP client join / client IP on RPi | **NOT TESTED** | Requires physical Raspberry Pi 4B hotspot provisioning and real client association. |
| Offline map backend: status + local tile serving (no online fallback) | **TESTED (local dev)** | `GET /api/map/status` returns local/offline config and `ready=false, format=none` when no map data present. `GET /api/map/tiles/0/0/0.png` returns `404 {"error":"tile_not_found","offline":true}` (no external fetch). Frontend/backend build and route imports succeeded. |
| Offline map UI integration (code/build) | **TESTED (build), RUNTIME BROWSER TEST PARTIAL/NOT FULLY VERIFIED** | Map page/component rebuilt with street-only local tiles, geolocation tracking logic, blue-dot/accuracy/heading/status UI. Full interactive browser geolocation and visual map rendering require secure-context browser session and user interaction; not fully end-to-end verified in this environment. |
| Internet-disabled end-to-end dashboard over RPi hotspot + HTTPS geolocation | **NOT TESTED** | Requires Raspberry Pi hotspot, client laptop, trusted local HTTPS cert, disabled internet, and real browser permission flow. Not performed here. |
| Actual GPS fix, blue marker movement, accuracy radius, heading behavior | **NOT TESTED** | Requires real device/location provider in secure context with granted permission (and movement/orientation for heading scenarios). No GPS coordinates fabricated. |
| Local-only network requests (no external map/CDN/API) | **NOT FULLY VERIFIED** | Implementation removes online tile/CDN/font URLs and serves local assets/tiles; a browser network-inspector audit under real usage was not performed in this environment. |
| Outside preloaded coverage / missing map data behavior | **PARTIALLY TESTED (logic/config)** | Map-missing state reported by API/UI logic; behavior with real preloaded coverage bounds and actual GPS positions outside coverage not tested on-device. |
| Location permission denied / unsupported / timeout handling | **IMPLEMENTED, NOT FULLY BROWSER-TESTED** | Error/status handling paths implemented; full browser-permission scenario validation not performed. |
| MLX90640 / LoRa 02 / offline reboot-auto-start on RPi | **NOT TESTED** | Requires target hardware and on-device validation. |

**Tests requiring physical Raspberry Pi 4B and/or real client environment:** hotspot activation and laptop association (`aeris-groundstation`, WPA2-PSK, `192.168.4.1`), HTTPS trusted-cert access over LAN, browser geolocation permission/actual fixes/heading, offline internet-disabled operation, preloaded map coverage validation, local-network request audit, MLX90640/LoRa hardware paths, and reboot/auto-start. No GPS, RF, sensor, or map-coverage results were fabricated.

**Tests that require physical Raspberry Pi 4B:** hotspot activation (`aeris-groundstation`, WPA2-PSK, `192.168.4.1`), laptop association as an actual AP client, AP-side client detection/IP retrieval, dashboard access over hotspot, MLX90640 I2C/thermal operation, LoRa 02 TX/RX, offline operation, and reboot/auto-start verification. No fabricated RF, RSSI/SNR, packet-loss, or sensor measurements.

**Recorded measurements (latency, packet loss, RSSI/SNR, sensor update rate, AI processing time, power):** **NOT TESTED** (no measurement equipment/hardware-in-the-loop available in this environment). Do not infer or fabricate these values.

## Known limitations and unresolved issues

- **Physical verification required:** MLX90640 I2C detection/readouts, LoRa 02 chipset/frequency/pinout, RF transmission/reception, hotspot behavior/IP assignment, laptop connectivity, offline operation, and reboot/service startup must be tested on the actual Raspberry Pi 4B.
- **LoRa receiver unavailable/unverified:** end-to-end reception, ACK confirmation, measured RSSI/SNR, and packet loss cannot be reported without a compatible receiver and protocol validation.
- **Exact hotspot IP:** `nmcli` shared mode commonly uses `10.42.0.1`; achieving `192.168.4.1` may require `hostapd`+`dnsmasq` or explicit NetworkManager IPv4 configuration depending on OS.
- **Detection semantics:** current implementation provides **thermal presence detection (heuristic)**, not human classification/identification and not medical vital signs.
- **Positioning/telemetry fields:** GPS, altitude, speed, heading, distance, UAV battery, and camera bitrate are unavailable without corresponding hardware/sources and are shown as unavailable rather than fabricated.
- **Website build:** production serving expects `website/dist` (`npm run build` in `website/`); source-only serving is a fallback and may be limited.
- **LoRa ACKs/retries:** robust link-layer acknowledgments/retransmission require a defined protocol on both transmitter and receiver; only transmission confirmation/status and config scaffolding are provided without a verified peer.
- **Environment constraints:** dependency installation and driver compatibility (Blinka/smbus/spidev/RPi.GPIO) depend on Raspberry Pi OS version and Python environment.

## Safety and integrity notes

- No simulated/random sensor values, fake thermal frames, fabricated detections, or invented LoRa/RF metrics are presented as real measurements.
- When hardware is unavailable, the system reports disconnected/unavailable/error states.
- Archive and external backup were created before cleanup/restructuring; `.git` history retained.
