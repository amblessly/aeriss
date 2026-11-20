# AERIS — Raspberry Pi 4B Offline System (MLX90640 + LoRa 02 + Local Web Dashboard)

This repository contains the cleaned and restructured AERIS project targeting **Raspberry Pi 4B** as the edge processing unit and local web server. The system is designed to operate **offline** on a local Wi-Fi hotspot, use **real MLX90640 thermal data** for thermal presence detection, and transmit **selected real telemetry** over **LoRa 02** (when hardware is available/configured). The **existing AERIS website UI** has been preserved and moved to `website/` and integrated with a local backend API/WebSocket.

> **Hardware verification status:** This workspace refactor/implementation was completed without attached MLX90640/LoRa/hotspot hardware. Real-hardware reads/transmissions and on-device network/service behavior are **NOT TESTED** here and must be verified on the target Raspberry Pi 4B. The application does **not** generate simulated sensor/radio data.

A complete step-by-step tutorial to get AERIS running from scratch.

### Prerequisites
- **Software:** Python 3.9+, Node.js (v18+), Git
- **Hardware (Raspberry Pi 4B):** Raspberry Pi 4B, micro-SD card, stable power supply, MLX90640 thermal camera (optional), LoRa 02 radio module (optional)
- **For laptop development:** A laptop/desktop with a browser (Chrome, Firefox, Edge)

### Step 1: Get the project
```bash
cd /path/to/your/projects
git clone https://github.com/your-aeris-project/aeris-project.git
cd aeris-project
```

### Step 2: Set up Python environment
```bash
python3 -m venv .venv
source .venv/bin/activate  # Linux/macOS: .venv\Scriptsctivate on Windows
```

### Step 3: Install Python dependencies
```bash
pip install --upgrade pip
pip install -r requirements.txt
# Optional hardware libraries (install on Raspberry Pi as needed):
# pip install adafruit-circuitpython-mlx90640 adafruit-blinka smbus2
# pip install spidev RPi.GPIO
# pip install pyserial>=3.5  # for USB GPS receiver
```

### Step 4: Build the website (React + Vite)
```bash
cd website
npm ci  # or: npm install
npm run build
cd ..
```
*This creates `website/dist/` which the Python backend serves automatically.*

### Step 5: Configure environment variables
```bash
cp config/aeris-groundstation.env.example .env
```
Edit `.env` with your preferred editor (`nano .env`, `code .env`, or `notepad .env`).

**Key variables you can set:**
| Variable | Default | Description |
|---|---|---|
| `AERIS_HOST` | `0.0.0.0` | Server bind address |
| `AERIS_PORT` | `5000` | Server port (dashboard URL uses this) |
| `AERIS_HOTSPOT_SSID` | `aeris-groundstation` | Wi-Fi hotspot name (Pi only) |
| `AERIS_HOTSPOT_PASSWORD` | `pi12345678` | Wi-Fi hotspot password (Pi only) |
| `AERIS_MLX90640_I2C_BUS` | `1` | I2C bus number (Pi only) |
| `AERIS_MAP_PMTILES_HQ_PATH` | `data/maps/aeris-hq.pmtiles` | High-zoom map archive path |

> **Important:** Do not share `.env` publicly. For Pi deployment, move the Wi-Fi password to a protected file (see Step 6).

### Step 6: (Pi only) Protect credentials on deployment
**Never share your Wi-Fi password publicly!** On the Raspberry Pi:

```bash
sudo mkdir -p /etc/aeris
sudo cp config/aeris-groundstation.env.example /etc/aeris/aeris.env
sudo chown root:root /etc/aeris/aeris.env
sudo chmod 600 /etc/aeris/aeris.env
```
This moves the config to a root-owned, permission-restricted file.

### Step 7: Run the application
```bash
source .venv/bin/activate
python -m app.main
# Or: uvicorn app.dashboard.routes:app --host 0.0.0.0 --port 5000
```

### Step 8: Access the dashboard from a browser
- **Development mode (laptop):** `http://localhost:5000` or `http://127.0.0.1:5000`
- **Raspberry Pi hotspot mode:** `http://192.168.4.1:5000`

> **For browser geolocation:** Accessing via `http://192.168.4.1:5000` (Pi hotspot IP) blocks geolocation in browsers. Use HTTPS as described below or access via `http://localhost:5000` on the Pi's own screen.

### 🔧 HTTPS for Secure Browser Geolocation
**Why?** Browsers block geolocation on plain HTTP when accessed from another device.

**Quick solution:**
1. Generate a local certificate:
   ```bash
   bash scripts/generate_local_https_cert.sh config/certs 192.168.4.1 825
   ```
2. Start the server with SSL:
   ```bash
   AERIS_SSL_CERTFILE=config/certs/aeris-local.cert.pem    AERIS_SSL_KEYFILE=config/certs/aeris-local.key.pem    python -m app.main
   ```
3. Trust the certificate in your browser:
   - Visit `https://192.168.4.1:5000`
   - Click the padlock → "Connection is not private" → "Advanced" → "Proceed anyway"
   - Go to "Certificate information" → "Certificate" → "Import" → "Trust this certificate"

**Robust solution:** Use `mkcert` to create a local CA, install it on each laptop, and then `https://192.168.4.1:5000` works without warnings.

### 🛑 How to Stop the Application
- **Foreground mode:** Press `Ctrl+C` in the terminal where the server is running
- **Background mode:** Find the process ID and kill it:
  ```bash
  ps aux | grep "uvicorn\|app.main"
  kill <PID>
  # Or on Pi with systemd:
  sudo systemctl stop aeris
  ```

### 🐛 Troubleshooting (Quick Fixes)
| Problem | Solution |
|---|---|
| `ModuleNotFoundError` | Activate virtual environment `(.venv)` and install dependencies with `pip install -r requirements.txt` |
| `npm: command not found` | Install Node.js from https://nodejs.org/ |
| `build failed` in website | Try `npm install` instead of `npm ci`, or check Node.js version is v18+ |
| Dashboard shows "website not built" | Run `cd website && npm run build` |
| `Connection refused` at `http://localhost:5000` | Make sure the server is running (`python -m app.main`) |
| Browser geolocation blocked | Access via `http://localhost:5000` or set up HTTPS |
| MLX90640 sensor not found | Enable I2C on Pi (`sudo raspi-config -> Interface Options -> I2C`), check wiring |
| LoRa transmission fails | Verify SPI enabled, check pin connections (NSS, RESET, DIO0), confirm frequency/parameters |
| Can't connect to Pi hotspot | Hotspot SSID: `aeris-groundstation`, password: `pi12345678` |
| Map tiles returning 404 | Ensure map data files exist: `data/maps/aeris.pmtiles` and/or `data/maps/aeris-hq.pmtiles` |

### 📊 Default Summary
| Item | Value |
|---|---|
| **Server bind address** | `0.0.0.0` |
| **Server port** | `5000` |
| **Dashboard URL (dev)** | `http://localhost:5000` |
| **Dashboard URL (Pi hotspot)** | `http://192.168.4.1:5000` |
| **Default Wi-Fi SSID** | `aeris-groundstation` |
| **Default Wi-Fi password** | `pi12345678` |
| **Default map center** | Maragondon, Cavite, Philippines (lat: 14.3045, lng: 120.7408) |
| **Default map zoom** | 13 |

### 💡 Need Help?
- Check the `README.md` for project overview and architecture
- Review `config/aeris-groundstation.env.example` for all configurable options
- See `data/maps/README.md` for offline map data generation steps
- The `scripts/` directory contains helper scripts for hotspot setup and certificate generation
- This guide separates **Raspberry Pi 4B hardware** from **laptop development** — follow the path that matches your setup!

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
- **Map rendering:** MapLibre GL JS (bundled npm dependency; built into `website/dist/assets/`). **No external CDN, no online tile fallback.**
- **Map style:** custom street-only style (`website/public/map/style.json`); no external style/font URLs, no remote glyphs, no sprite dependencies (text-only labels/POIs).
- **Map data storage (local):**
  - PMTiles v3 vector archive: `data/maps/aeris-hq.pmtiles` (operational high-zoom archive, z0–16 — **primary**; env override `AERIS_MAP_PMTILES_HQ_PATH`) — plus `data/maps/aeris.pmtiles` (nationwide z0–15 — **fallback**, untouched; `AERIS_MAP_PMTILES_PATH`)
  - Local glyph PBFs: `data/maps/fonts/{fontstack}/{range}.pbf` (default, configurable via `AERIS_MAP_FONTS_DIR`)
- **Backend endpoints (FastAPI):**
  - `GET /api/map/aeris.pmtiles` — streams the archive with HTTP Range support (206 Partial Content, `Accept-Ranges: bytes`), chunked file streaming (no full-archive memory load).
  - `GET /api/map/style.json` — serves the map style (single source: `website/public/map/style.json`).
  - `GET /api/map/fonts/{fontstack}/{range}.pbf` — serves local glyphs (path-traversal guarded).
  - `GET /api/map/status` — readiness/bounds/zoom/attribution for the UI (parses only the 127-byte PMTiles header).
- **Attribution:** OpenStreetMap attribution supported/configurable (`AERIS_MAP_ATTRIBUTION`). Data © OpenStreetMap contributors (ODbL).
- **Coverage:** **Maragondon/Cavite operational bbox** at zooms **0–16** via `aeris-hq.pmtiles` (genuine z16 street-level detail, ~7 MB); falls back automatically to the **nationwide z0–15** archive (`aeris.pmtiles`) if the HQ archive is missing/invalid: **entire Philippines** (Luzon, Metro Manila, Visayas, Mindanao, Palawan). `/api/map/status` reports `map_source` / `highzoom_available`. The camera `maxZoom` follows the *effective* archive (z16 HQ / z15 fallback). No overzoom past the effective archive's own max zoom.
- **Map data:** generated from the Geofabrik Philippines OSM extract using Planetiler (OpenMapTiles schema). See `data/maps/README.md` for regeneration steps.

### Live GPS location (browser-based, real data only)
- Uses `navigator.geolocation.watchPosition()` when the user starts location tracking.
- **Blue dot:** custom Google Maps-style marker with white border and accuracy circle based on reported GPS accuracy; smooth updates without full map reload. **No fake blue dot when location is unavailable.**
- **Displayed data:** latitude, longitude, GPS accuracy (m), last update time, location/tracking/permission status.
- **Heading:** directional cone shown only when valid heading is available (device orientation/compass APIs, or GPS course-over-ground only while moving). Heading source indicated; `N/A` when unavailable/unreliable. Stationary GPS direction is not treated as compass heading.
- **Permissions:** requested on user action; supports browser persistent Allow where available (do not repeatedly prompt after granted). Permission denial/errors/timeouts/unavailable states handled with meaningful messages.
- **Location source:** actual browser/device location provider only (never fabricated). Raspberry Pi 4B has no built-in GPS; laptop browser geolocation uses laptop location services. Separate device GPS receiver integration on RPi backend can be added for device-native location (not claimed/tested here).

### Mission Map laptop geolocation (browser-based, real data only)
- The **Mission Map** card has a **"LAPTOP LOCATION"** control (top-right). It uses the browser Geolocation API (`getCurrentPosition`/`watchPosition`/`clearWatch`) with `enableHighAccuracy: true`. Laptop coordinates never overwrite the AERIS hardware/telemetry GPS (`useAppStore.uav`) — separate sources by design.
- **Enable** starts tracking: browser permission is requested on first use; on grant, the marker + accuracy ring update live; the map flies to the fix once per enable (it never yanks the map during manual panning).
- **Disable** stops the watcher and keeps the last saved coordinates; pressing Enable resumes it.
- **Persistence:** the last fix and the tracking-enabled flag persist in `localStorage` (`aeris-laptop-location-v1`). On refresh, the marker is restored; tracking auto-resumes **only** if previously enabled **and** the browser still grants permission — never otherwise. Persisted permission is not assumed; the Permissions API is queried on load.
- **Displayed data:** latitude/longitude, accuracy (m), last update time, permission state (Granted/Denied/Prompt), acquisition status (Tracking active/Requesting/Waiting/Disabled/etc.).
- **Marker:** green teardrop map pin + accuracy ring for live fixes — same visual language as the rest of the dashboard.
- **Live vs last-known:** the UI never presents a stale fix as live. A fresh validated fix renders the green pin with a `LIVE — <provider>` chip (e.g. `LIVE — USB GNSS (NMEA) · /dev/ttyUSB0 · 9 sats` or `LIVE — Browser geolocation`). When no fresh fix is available (position error, timeout, or ageing out), the persisted last-known fix stays on the map as a dimmed amber dashed pin with an explicit `LAST KNOWN POSITION` banner (fix time + provider). On refresh, the persisted last fix is likewise shown only as labeled last-known. Live fixes age out to last-known after 60 s (browser) / `AERIS_GPS_FRESH_S` (USB GNSS).

### Offline positioning (USB/serial GNSS — NMEA 0183) — new
- **Hardware reality:** browser geolocation can only return a fix when the OS has a location source. The development laptop (Intel Gemini Lake, Intel CNVi WiFi, no GNSS receiver, no modem) has **no offline-capable positioning source**: GeoClue has no GPS/NMEA/modem hardware to query, and its WiFi positioning endpoint answers `Not Found` even *with* internet. On such hardware, "offline location" via the browser is impossible no matter how the app is configured.
- **Genuine offline source (supported):** attach a USB/serial GNSS receiver (e.g. u-blox dongle) to the AERIS Raspberry Pi. The local backend reads NMEA sentences (`app/services/nmea.py`, pure parser; `app/services/gps_source.py`, read-only serial reader, auto-probes `/dev/serial/by-id/*gps*|gnss*`, `/dev/ttyUSB*`, `/dev/ttyACM*`, `/dev/ttyS0`) and serves the latest fix at `GET /api/location/local`. No internet, IP geolocation, or cloud API is involved — the receiver computes position from satellites.
- **Enable it:** the AERIS host must see the receiver as a serial device; install `pyserial` on the Pi (`pip install pyserial`, kept as a commented optional dependency in `requirements.txt`). Envs: `AERIS_GPS_ENABLED=auto|on|off`, `AERIS_GPS_PORT=/dev/ttyUSB0` (explicit override; otherwise auto-probe), `AERIS_GPS_BAUD=9600` (NMEA default), `AERIS_GPS_FRESH_S=10` (freshness window), `AERIS_GPS_STALE_S=60`. The reader sends nothing to the receiver. If no receiver is attached, the endpoint reports `available: false` with a machine-readable `reason` (e.g. `no_candidate_port`, `open_failed:...`, `pyserial_not_installed`) and `fix: null` — it never invents coordinates.
- **Client behavior:** the dashboard polls `/api/location/local` while tracking is enabled; a fresh USB GNSS fix outranks the browser's (often coarse) position. Browser geolocation is still used as delivered above, and remains the source when no local receiver is available.
- **Map zoom:** the MapLibre camera is capped at the effective archive's real zoom ceiling (`maxZoom` from `/api/map/status` on both map views — z16 operational HQ archive / z15 nationwide fallback; `source maxzoom` in `website/public/map/style.json` is set to 16 for HQ, and MapLibre takes TileJSON override from the archive header for the fallback). Wheel, trackpad pinch (ctrl+wheel), pinch touch, double-click, keyboard, on-screen +/- and fly-to all resolve to that ceiling at most. z16 vector tiles exist in the HQ archive for the Maragondon bbox (verified for tile z16/x54748/y30136). No overzoom past the ceiling. **z17 is not available** — Planetiler's OpenMapTiles profile hard-caps at z16 (`Max zoom must be <= 16`); no z17 tiles are generated and none are faked.

### Secure context (HTTPS) for browser geolocation
- Browser geolocation requires a secure context. Plain HTTP over the Pi's LAN IP (e.g. `http://192.168.4.1:5000` from the AERIS hotspot) is **not** a secure context in Chromium-class browsers — geolocation will be blocked. `http://localhost:5000` / `http://127.0.0.1:5000` on the Pi's own machine *is* a secure context.
- **Recommended fix:** serve the dashboard over HTTPS with a certificate the client laptop trusts.
  - Quick path: `bash scripts/generate_local_https_cert.sh config/certs 192.168.4.1 825`, then start AERIS with `AERIS_SSL_CERTFILE=config/certs/aeris-local.cert.pem AERIS_SSL_KEYFILE=config/certs/aeris-local.key.pem` and import/trust the cert in the client browser (site settings → trust / install to OS).
  - Robust path: `mkcert` local CA (or local PKI) — install the CA once on each field laptop, then `https://192.168.4.1:5000` works with no warnings and no per-site clicks.
- Do not use browser flag bypasses for field deployments (insecure; the flag is ignored on some browsers / enterprise builds).
- The UI reports secure-context/permission/location errors; it does not bypass browser restrictions. The map, PMTiles rendering, hotspot, and dashboard remain fully functional offline regardless — only browser geolocation needs the secure context.

### Dashboard UI (Map page/panel)
- Street map only (no satellite/hybrid/terrain/layer switcher), center-on-location, recenter, zoom controls, and status/info panel.
- **Location status labels:** Waiting for Permission, Requesting Location, Active, Permission Denied, Location Unavailable, GPS Signal Unavailable.
- **Map status labels:** Offline Map Ready, Loading Local Map, Outside Available Map Coverage, Map Data Missing.
- Statuses reflect actual state (not forced to Connected/Active). Design kept consistent with existing AERIS dashboard; unrelated features preserved. Thermal Feed and other dashboard sections not modified for this work.

### Map configuration (env/config)
- `AERIS_MAP_DATA_DIR`, `AERIS_MAP_PMTILES_PATH`, `AERIS_MAP_FONTS_DIR`
- `AERIS_MAP_ATTRIBUTION`, `AERIS_MAP_MIN_ZOOM`, `AERIS_MAP_MAX_ZOOM`, `AERIS_MAP_DEFAULT_ZOOM`
- `AERIS_MAP_DEFAULT_LAT`, `AERIS_MAP_DEFAULT_LNG`
- `AERIS_SSL_CERTFILE`, `AERIS_SSL_KEYFILE`

## Installation and startup (Raspberry Pi 4B) — updated notes
- Build website (`npm ci && npm run build` in `website/`) so backend serves local frontend/assets.
- Place offline map data on the Pi (`data/maps/aeris-hq.pmtiles` for the Maragondon z0–16 operational area, optionally `data/maps/aeris.pmtiles` as nationwide z0–15 fallback, + `data/maps/fonts/…`) (see `data/maps/README.md`).
- (Recommended for geolocation) configure HTTPS cert/key and start with SSL env vars set; trust cert on client laptop and access via `https://<pi-ip>:5000`.
- Start backend: `python -m app.main` (or systemd via `scripts/install_services.sh`), bind as configured (`AERIS_HOST`/`AERIS_PORT`).
- Laptop access: connect to AERIS hotspot/network, open dashboard URL (HTTP for UI access where available; **HTTPS/secure context required for browser geolocation**), start location tracking, allow permission.


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
- **Map rendering:** MapLibre GL JS (bundled npm dependency; built into `website/dist/assets/`). **No external CDN, no online tile fallback.**
- **Map style:** custom street-only style (`website/public/map/style.json`); no external style/font URLs, no remote glyphs, no sprite dependencies (text-only labels/POIs).
- **Map data storage (local):**
  - PMTiles v3 vector archive: `data/maps/aeris-hq.pmtiles` (operational high-zoom archive, z0–16 — **primary**; env override `AERIS_MAP_PMTILES_HQ_PATH`) — plus `data/maps/aeris.pmtiles` (nationwide z0–15 — **fallback**, untouched; `AERIS_MAP_PMTILES_PATH`)
  - Local glyph PBFs: `data/maps/fonts/{fontstack}/{range}.pbf` (default, configurable via `AERIS_MAP_FONTS_DIR`)
- **Backend endpoints (FastAPI):**
  - `GET /api/map/aeris.pmtiles` — streams the archive with HTTP Range support (206 Partial Content, `Accept-Ranges: bytes`), chunked file streaming (no full-archive memory load).
  - `GET /api/map/style.json` — serves the map style (single source: `website/public/map/style.json`).
  - `GET /api/map/fonts/{fontstack}/{range}.pbf` — serves local glyphs (path-traversal guarded).
  - `GET /api/map/status` — readiness/bounds/zoom/attribution for the UI (parses only the 127-byte PMTiles header).
- **Attribution:** OpenStreetMap attribution supported/configurable (`AERIS_MAP_ATTRIBUTION`). Data © OpenStreetMap contributors (ODbL).
- **Coverage:** **Maragondon/Cavite operational bbox** at zooms **0–16** via `aeris-hq.pmtiles` (genuine z16 street-level detail, ~7 MB); falls back automatically to the **nationwide z0–15** archive (`aeris.pmtiles`) if the HQ archive is missing/invalid: **entire Philippines** (Luzon, Metro Manila, Visayas, Mindanao, Palawan). `/api/map/status` reports `map_source` / `highzoom_available`. The camera `maxZoom` follows the *effective* archive (z16 HQ / z15 fallback). No overzoom past the effective archive's own max zoom.
- **Map data:** generated from the Geofabrik Philippines OSM extract using Planetiler (OpenMapTiles schema). See `data/maps/README.md` for regeneration steps.

### Live GPS location (browser-based, real data only)
- Uses `navigator.geolocation.watchPosition()` when the user starts location tracking.
- **Blue dot:** custom Google Maps-style marker with white border and accuracy circle based on reported GPS accuracy; smooth updates without full map reload. **No fake blue dot when location is unavailable.**
- **Displayed data:** latitude, longitude, GPS accuracy (m), last update time, location/tracking/permission status.
- **Heading:** directional cone shown only when valid heading is available (device orientation/compass APIs, or GPS course-over-ground only while moving). Heading source indicated; `N/A` when unavailable/unreliable. Stationary GPS direction is not treated as compass heading.
- **Permissions:** requested on user action; supports browser persistent Allow where available (do not repeatedly prompt after granted). Permission denial/errors/timeouts/unavailable states handled with meaningful messages.
- **Location source:** actual browser/device location provider only (never fabricated). Raspberry Pi 4B has no built-in GPS; laptop browser geolocation uses laptop location services. Separate device GPS receiver integration on RPi backend can be added for device-native location (not claimed/tested here).

### Mission Map laptop geolocation (browser-based, real data only)
- The **Mission Map** card has a **"LAPTOP LOCATION"** control (top-right). It uses the browser Geolocation API (`getCurrentPosition`/`watchPosition`/`clearWatch`) with `enableHighAccuracy: true`. Laptop coordinates never overwrite the AERIS hardware/telemetry GPS (`useAppStore.uav`) — separate sources by design.
- **Enable** starts tracking: browser permission is requested on first use; on grant, the marker + accuracy ring update live; the map flies to the fix once per enable (it never yanks the map during manual panning).
- **Disable** stops the watcher and keeps the last saved coordinates; pressing Enable resumes it.
- **Persistence:** the last fix and the tracking-enabled flag persist in `localStorage` (`aeris-laptop-location-v1`). On refresh, the marker is restored; tracking auto-resumes **only** if previously enabled **and** the browser still grants permission — never otherwise. Persisted permission is not assumed; the Permissions API is queried on load.
- **Displayed data:** latitude/longitude, accuracy (m), last update time, permission state (Granted/Denied/Prompt), acquisition status (Tracking active/Requesting/Waiting/Disabled/etc.).
- **Marker:** green teardrop map pin + accuracy ring for live fixes — same visual language as the rest of the dashboard.
- **Live vs last-known:** the UI never presents a stale fix as live. A fresh validated fix renders the green pin with a `LIVE — <provider>` chip (e.g. `LIVE — USB GNSS (NMEA) · /dev/ttyUSB0 · 9 sats` or `LIVE — Browser geolocation`). When no fresh fix is available (position error, timeout, or ageing out), the persisted last-known fix stays on the map as a dimmed amber dashed pin with an explicit `LAST KNOWN POSITION` banner (fix time + provider). On refresh, the persisted last fix is likewise shown only as labeled last-known. Live fixes age out to last-known after 60 s (browser) / `AERIS_GPS_FRESH_S` (USB GNSS).

### Offline positioning (USB/serial GNSS — NMEA 0183) — new
- **Hardware reality:** browser geolocation can only return a fix when the OS has a location source. The development laptop (Intel Gemini Lake, Intel CNVi WiFi, no GNSS receiver, no modem) has **no offline-capable positioning source**: GeoClue has no GPS/NMEA/modem hardware to query, and its WiFi positioning endpoint answers `Not Found` even *with* internet. On such hardware, "offline location" via the browser is impossible no matter how the app is configured.
- **Genuine offline source (supported):** attach a USB/serial GNSS receiver (e.g. u-blox dongle) to the AERIS Raspberry Pi. The local backend reads NMEA sentences (`app/services/nmea.py`, pure parser; `app/services/gps_source.py`, read-only serial reader, auto-probes `/dev/serial/by-id/*gps*|gnss*`, `/dev/ttyUSB*`, `/dev/ttyACM*`, `/dev/ttyS0`) and serves the latest fix at `GET /api/location/local`. No internet, IP geolocation, or cloud API is involved — the receiver computes position from satellites.
- **Enable it:** the AERIS host must see the receiver as a serial device; install `pyserial` on the Pi (`pip install pyserial`, kept as a commented optional dependency in `requirements.txt`). Envs: `AERIS_GPS_ENABLED=auto|on|off`, `AERIS_GPS_PORT=/dev/ttyUSB0` (explicit override; otherwise auto-probe), `AERIS_GPS_BAUD=9600` (NMEA default), `AERIS_GPS_FRESH_S=10` (freshness window), `AERIS_GPS_STALE_S=60`. The reader sends nothing to the receiver. If no receiver is attached, the endpoint reports `available: false` with a machine-readable `reason` (e.g. `no_candidate_port`, `open_failed:...`, `pyserial_not_installed`) and `fix: null` — it never invents coordinates.
- **Client behavior:** the dashboard polls `/api/location/local` while tracking is enabled; a fresh USB GNSS fix outranks the browser's (often coarse) position. Browser geolocation is still used as delivered above, and remains the source when no local receiver is available.
- **Map zoom:** the MapLibre camera is capped at the effective archive's real zoom ceiling (`maxZoom` from `/api/map/status` on both map views — z16 operational HQ archive / z15 nationwide fallback; `source maxzoom` in `website/public/map/style.json` is set to 16 for HQ, and MapLibre takes TileJSON override from the archive header for the fallback). Wheel, trackpad pinch (ctrl+wheel), pinch touch, double-click, keyboard, on-screen +/- and fly-to all resolve to that ceiling at most. z16 vector tiles exist in the HQ archive for the Maragondon bbox (verified for tile z16/x54748/y30136). No overzoom past the ceiling. **z17 is not available** — Planetiler's OpenMapTiles profile hard-caps at z16 (`Max zoom must be <= 16`); no z17 tiles are generated and none are faked.

### Secure context (HTTPS) for browser geolocation
- Browser geolocation requires a secure context. Plain HTTP over the Pi's LAN IP (e.g. `http://192.168.4.1:5000` from the AERIS hotspot) is **not** a secure context in Chromium-class browsers — geolocation will be blocked. `http://localhost:5000` / `http://127.0.0.1:5000` on the Pi's own machine *is* a secure context.
- **Recommended fix:** serve the dashboard over HTTPS with a certificate the client laptop trusts.
  - Quick path: `bash scripts/generate_local_https_cert.sh config/certs 192.168.4.1 825`, then start AERIS with `AERIS_SSL_CERTFILE=config/certs/aeris-local.cert.pem AERIS_SSL_KEYFILE=config/certs/aeris-local.key.pem` and import/trust the cert in the client browser (site settings → trust / install to OS).
  - Robust path: `mkcert` local CA (or local PKI) — install the CA once on each field laptop, then `https://192.168.4.1:5000` works with no warnings and no per-site clicks.
- Do not use browser flag bypasses for field deployments (insecure; the flag is ignored on some browsers / enterprise builds).
- The UI reports secure-context/permission/location errors; it does not bypass browser restrictions. The map, PMTiles rendering, hotspot, and dashboard remain fully functional offline regardless — only browser geolocation needs the secure context.

### Dashboard UI (Map page/panel)
- Street map only (no satellite/hybrid/terrain/layer switcher), center-on-location, recenter, zoom controls, and status/info panel.
- **Location status labels:** Waiting for Permission, Requesting Location, Active, Permission Denied, Location Unavailable, GPS Signal Unavailable.
- **Map status labels:** Offline Map Ready, Loading Local Map, Outside Available Map Coverage, Map Data Missing.
- Statuses reflect actual state (not forced to Connected/Active). Design kept consistent with existing AERIS dashboard; unrelated features preserved. Thermal Feed and other dashboard sections not modified for this work.

### Map configuration (env/config)
- `AERIS_MAP_DATA_DIR`, `AERIS_MAP_PMTILES_PATH`, `AERIS_MAP_FONTS_DIR`
- `AERIS_MAP_ATTRIBUTION`, `AERIS_MAP_MIN_ZOOM`, `AERIS_MAP_MAX_ZOOM`, `AERIS_MAP_DEFAULT_ZOOM`
- `AERIS_MAP_DEFAULT_LAT`, `AERIS_MAP_DEFAULT_LNG`
- `AERIS_SSL_CERTFILE`, `AERIS_SSL_KEYFILE`

## Installation and startup (Raspberry Pi 4B) — updated notes
- Build website (`npm ci && npm run build` in `website/`) so backend serves local frontend/assets.
- Place offline map data on the Pi (`data/maps/aeris-hq.pmtiles` for the Maragondon z0–16 operational area, optionally `data/maps/aeris.pmtiles` as nationwide z0–15 fallback, + `data/maps/fonts/…`) (see `data/maps/README.md`).
- (Recommended for geolocation) configure HTTPS cert/key and start with SSL env vars set; trust cert on client laptop and access via `https://<pi-ip>:5000`.
- Start backend: `python -m app.main` (or systemd via `scripts/install_services.sh`), bind as configured (`AERIS_HOST`/`AERIS_PORT`).
- Laptop access: connect to AERIS hotspot/network, open dashboard URL (HTTP for UI access where available; **HTTPS/secure context required for browser geolocation**), start location tracking, allow permission.


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
