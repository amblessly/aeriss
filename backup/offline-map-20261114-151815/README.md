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
- **Created (ops/docs):** `scripts/aeris.service`, `scripts/install_services.sh`, `scripts/setup_hotspot_nmcli.sh`, updated `requirements.txt`, updated `.gitignore`, rewritten `README.md`.
- **Moved/preserved:** `ground-station/frontend/*` → `website/*` (existing website).
- **Modified (website integration, simulation removal):** `website/src/App.tsx`, `website/src/hooks/useWebSocket.ts`, `website/src/hooks/useTelemetrySimulation.ts` (disabled), `website/src/stores/appStore.ts`, `website/src/types/index.ts`, `website/src/components/LiveFeed.tsx`, `website/src/components/CommLinkHealth.tsx`, `website/src/components/DetectionsTable.tsx`, `website/src/components/SurvivorModal.tsx`, `website/src/components/MissionMap.tsx`, `website/src/pages/LiveFeedPage.tsx`, `website/src/components/ActiveMission.tsx` (and related behavior) to use real backend state, remove random/fake data, and show disconnected/unavailable states clearly.

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

## Actual testing results

| Test | Result | Notes |
|---|---|---|
| Wi-Fi status: development mode (Ubuntu laptop) | **TESTED (dev)** | Repeated backend status checks remained stable: `state=connecting`, `operation_mode=development`, `hosting_ap=false`, `target_ssid=aeris-groundstation`, `verified=true`, no flapping; local client Wi-Fi was not treated as AERIS hotspot/client connection. |
| Wi-Fi config/deployment prep (RPi target) | **PREPARED, NOT APPLIED ON DEV LAPTOP** | Defaults/scripts/config prepared for `aeris-groundstation` (WPA2-PSK), gateway `192.168.4.1`, dashboard `http://192.168.4.1:5000`; protected env example and hotspot/service scripts added. RPi-specific network changes not applied/tested on this laptop. |
| Wi-Fi client detection logic (AP station verification) | **IMPLEMENTED, RPi HARDWARE TEST REQUIRED** | Hotspot mode logic reports Connected only when actual AP client(s) are verified (station/client info, e.g. `iw station dump` count) and Connecting while AP is waiting for clients; physical AP/client association must be validated on Raspberry Pi 4B. |
| Wi-Fi hotspot hosting on Raspberry Pi 4B (`aeris-groundstation`) | **NOT TESTED** | Requires on-device NetworkManager/hostapd provisioning and verification. |
| Laptop connection to Raspberry Pi hotspot | **NOT TESTED** | Requires physical RPi hotspot bring-up and client join. |
| Connected client IP/info retrieval on RPi hotspot | **NOT TESTED** | Client presence detection implemented; client IP/lease details depend on on-device DHCP/network tooling and must be verified on Raspberry Pi. |
| AERIS dashboard accessibility over hotspot | **NOT TESTED** | End-to-end access to `http://192.168.4.1:5000` from laptop via RPi hotspot not verified. |
| MLX90640 connection / thermal readings / presence detection | **NOT TESTED** | Requires MLX90640 hardware and on-device I2C/driver validation. |
| LoRa 02 transmission/reception | **NOT TESTED** | Requires LoRa 02 wiring/chip/freq verification and compatible receiver for reception/RSSI/SNR/packet-loss measurements. |
| Offline operation | **NOT TESTED** | Must be validated on isolated local network with RPi hotspot. |
| Reboot + auto-start (systemd) | **NOT TESTED** | Service template/install script provided; must be installed and verified on device. |

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
