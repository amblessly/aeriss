# AERIS Prototype Measurement Report

Raspberry Pi 4 Model B, MLX90640 Thermal Camera, and LoRa Ra-02 Module

## 1. Introduction

### 1.1 Purpose

This report identifies, researches, and documents the technical measurement parameters relevant to the AERIS (Autonomous Edge-Processing Rescue Intelligent System) prototype. It covers hardware specifications, video transmission performance, LoRa communication performance, telemetry performance, AI evaluation metrics, and power consumption. It also lists additional parameters that may be useful for the prototype evaluation.

### 1.2 Scope and reference configuration

The reference hardware configuration for this research is:

- Raspberry Pi 4 Model B (referred to in the project brief as the "2018 model"; see note below).
- MLX90640 Thermal Infrared Camera (32 x 24 pixels).
- LoRa Ra-02 / LoRa 02 communication module (Semtech SX1278 based, 433 MHz class).

Note on the Raspberry Pi model year: the Raspberry Pi 4 Model B was first released in June 2019. There is no 2018 Raspberry Pi 4 Model B. The 2018-era flagship was the Raspberry Pi 3 Model B+. This report treats the reference as the Raspberry Pi 4 Model B, which is the target platform stated throughout the project source code and README.

### 1.3 Source priority

Values in this report were assigned using the following priority order:

1. Existing AERIS source code and configuration.
2. Existing project measurement logs (`data/aeris.db`, `logs/`).
3. Official component datasheets.
4. Official manufacturer documentation.
5. Reliable technical documentation and research publications.

### 1.4 Classification scheme

Every value in this report is classified with one of the following labels:

- Measured: directly obtained from an actual test or from recorded prototype data.
- Calculated: derived mathematically from verified measurements or specifications.
- Estimated: based on component specifications, documented operating characteristics, or reasonable engineering assumptions. The assumptions are stated.
- Proposed: a recommended parameter or measurement method that has not yet been evaluated on the prototype.

### 1.5 Key findings (read this first)

- The current prototype code in this repository has never been run against real MLX90640 or LoRa hardware in this development environment. All 1,995 logged thermal readings and all 369+ logged LoRa transmission attempts in `data/aeris.db` are failure/disconnected records (sensor disconnected; LoRa init failed because `spidev` is not available). No valid sensor, RF, latency, power, or AI measurement exists.
- The research paper in the repository (`AERIS PAPER v3.docx`) describes a different, larger target system: Raspberry Pi 5, Hailo-8L NPU, YOLOv8, FLIR Lepton 3.5, Ebyte E220/E32 LoRa (915/923 MHz), MAVLink telemetry, and a 5 GHz video downlink. That target system is not implemented in the current codebase. Where the paper defines targets (for example, latency and PLR thresholds), those targets are reported here as paper-defined targets, not as measured prototype results.
- The AI functionality actually implemented is a thermal presence heuristic, not a machine learning model and not human identification.
- The prototype has no GPS module. Position is only available from a laptop browser via `navigator.geolocation` on the dashboard map page.
- The prototype has no video downlink implementation. The dashboard shows an MLX90640 thermal heatmap over a local WebSocket, which is not a video stream.
- No GPS, RF, latency, power, or AI-accuracy value in this report was experimentally obtained, because no such test data exists in the project.

### 1.6 Information that could not be verified

The following could not be verified from the project or from manufacturer documentation and are left open:

- Which Raspberry Pi 4 RAM variant (1, 2, 4, or 8 GB) is installed in the prototype. The project does not record it.
- The exact LoRa Ra-02 variant frequency (410-525 MHz range; project defaults to 433.0 MHz and marks it "VERIFY").
- The MLX90640 field-of-view variant (55 x 35 deg or 110 x 75 deg) installed in the prototype.
- Battery type, capacity, and voltage. No battery is configured or documented in the current prototype. The paper assumes a LiPo UAV battery with Depth of Discharge (DoD) of 0.7 to 0.8.
- Any real-world RF range, latency, RSSI, SNR, PLR, or power measurement.

## 2. AERIS Hardware Configuration

### 2.1 What the prototype actually contains (from source code)

| Subsystem | Implementation | Status |
|---|---|---|
| Compute | Raspberry Pi 4 Model B target (`app/`, README) | Not verified on hardware in this environment |
| Thermal sensor | MLX90640 over I2C, bus 1, address 0x33, 32 x 24 frames (`app/sensors/mlx90640.py`) | Code present; hardware not verified |
| Presence detection | Adaptive threshold blob heuristic (`app/sensors/thermal_processing.py`, `app/ai/human_detection.py`) | Code present; not ML-based |
| LoRa radio | SX127x register-level SPI driver (`app/communication/lora_transmitter.py`), 433.0 MHz default, SF7, BW 125 kHz, CR 4/5, 17 dBm, 2.0 s TX interval | Code present; hardware not verified |
| LoRa receiver | Placeholder only (`app/communication/lora_receiver.py`) | Not implemented/verified |
| Storage | SQLite (`app/storage/database.py`, `data/aeris.db`) | Works; contains only failure logs |
| Dashboard | FastAPI + React website, WebSocket state broadcast, local Wi-Fi hotspot target `aeris-groundstation` @ `192.168.4.1:5000` | Dev-tested for Wi-Fi status logic only |
| GPS | None (browser geolocation only) | Not available on device |
| Video | None (thermal heatmap only) | Not implemented |
| Battery | None configured | Not available |

### 2.2 Raspberry Pi 4 Model B

| Parameter | Value | Classification | Source |
|---|---|---|---|
| SoC | Broadcom BCM2711 | Estimated (manufacturer documentation) | Raspberry Pi product page [11] |
| CPU | Quad-core Cortex-A72 (ARM v8) 64-bit | Estimated (manufacturer documentation) | Raspberry Pi product page [11] |
| CPU clock | 1.5 GHz at launch (June 2019); current product page lists 1.8 GHz (later hardware revisions after a clock-speed increase) | Estimated (manufacturer documentation; revision-dependent) | Raspberry Pi product page [11] |
| RAM | 1 GB, 2 GB, 4 GB, or 8 GB LPDDR4-3200 SDRAM depending on model | Estimated; prototype variant not recorded | Raspberry Pi product page [11] |
| GPU | VideoCore VI; H.265 4Kp60 decode; H.264 1080p60 decode and 1080p30 encode; OpenGL ES 3.1, Vulkan 1.0 | Estimated (manufacturer documentation) | Raspberry Pi product page [11] |
| Wireless | 2.4 GHz and 5.0 GHz IEEE 802.11ac Wi-Fi; Bluetooth 5.0 BLE | Estimated (manufacturer documentation) | Raspberry Pi product page [11] |
| Ethernet | Gigabit Ethernet | Estimated (manufacturer documentation) | Raspberry Pi product page [11] |
| USB | 2 x USB 3.0, 2 x USB 2.0 | Estimated (manufacturer documentation) | Raspberry Pi product page [11] |
| GPIO | 40-pin header; I2C, SPI, UART; 2-lane MIPI CSI camera port | Estimated (manufacturer documentation) | Raspberry Pi product page [11] |
| Power input | 5 V DC via USB-C (minimum 3 A recommended) or GPIO header; PoE supported with separate HAT | Estimated (manufacturer documentation) | Raspberry Pi product page [11] |
| Operating temperature | 0 to 50 deg C ambient | Estimated (manufacturer documentation) | Raspberry Pi product page [11] |
| Idle power | About 540 mA at 5 V = 2.7 W (measured by a third party); ~2.9 W also reported | Estimated (literature, not AERIS measurement) | pidramble [12], raspberry.tips [13], raspi.tv [14] |
| Web-server load | About 1010 mA at 5 V = 5.1 W | Estimated (literature, not AERIS measurement) | pidramble [12] |
| Full CPU load | About 1280 mA at 5 V = 6.4 W; ~6-8 W also reported | Estimated (literature, not AERIS measurement) | pidramble [12], raspberry.tips [13] |

Processing and thermal notes:

- The BCM2711 is a capable quad-core 64-bit SoC. It can run the AERIS FastAPI server, the thermal processing loop, and the website build comfortably on a 4 GB model. The heaviest workload in this project is serving the built website and running the Python polling loop; neither is CPU-bound in normal operation.
- There is no active cooling assumption in the project. Sustained full CPU load without a heatsink or fan can reduce clock speed (thermal throttling). This is a documented general Raspberry Pi behavior; it is not measured in this project. Classification: Estimated.
- Video processing considerations: the current code does not use the H.264/H.265 hardware codec blocks at all. If a video downlink is added later (as the paper describes), hardware H.264 encoding via the VideoCore VI GPU or a GStreamer pipeline would be required to keep CPU load and latency acceptable.
- RAM: 1 GB would be tight for the full stack; 2 GB is workable; 4 GB or 8 GB is recommended. Classification: Estimated (engineering assumption).

### 2.3 MLX90640 Thermal Infrared Camera

| Parameter | Value | Classification | Source |
|---|---|---|---|
| Array resolution | 32 x 24 pixels (768 pixels) | Estimated (manufacturer documentation) | Melexis datasheet [25] |
| Field of view | 55 x 35 deg (narrow) or 110 x 75 deg (wide), variant-dependent | Estimated; prototype variant not recorded | Melexis datasheet [25], Waveshare wiki [17], Adafruit guide [16] |
| Object temperature range | -40 to +300 deg C | Estimated (manufacturer documentation) | Melexis datasheet [25], zbotic [19], Waveshare [17] |
| Operating temperature | -40 to +85 deg C (sensor ambient) | Estimated (manufacturer documentation) | Melexis datasheet [25] |
| NETD (noise) | 0.1 K RMS at 1 Hz refresh rate | Estimated (manufacturer documentation) | Melexis datasheet [25], Waveshare [17], ultralibrarian [18] |
| Frame rate (refresh rate) | Programmable 0.5, 1, 2, 4, 8, 16, 32, 64 Hz | Estimated (manufacturer documentation) | Melexis datasheet [25] |
| Practical frame rate on typical hosts | About 16 Hz maximum (Adafruit notes 32 Hz is the theoretical I2C-limited ceiling but not practically achieved) | Estimated (manufacturer-adjacent documentation) | Adafruit guide [16] |
| Accuracy | Frame accuracy depends on zone; datasheet lists frame accuracy of about +/-1 deg C (MLX90640BAA) in the best zones, with larger errors toward zone edges, plus up to about +/-3 deg C long-term drift near room temperature. Breakout vendors commonly quote +/-1 to +/-2 deg C in the 0-100 deg C range | Estimated (manufacturer documentation; zone-dependent) | Melexis datasheet [25], Adafruit guide [16], Waveshare [17], ultralibrarian [18] |
| Absolute temperature accuracy drift | Up to about +/-3 deg C after years of drift near room temperature (datasheet note) | Estimated (manufacturer documentation) | Melexis datasheet [25] |
| Interface | I2C, up to 1 MHz (fast-mode plus); project code uses 400 kHz (`busio.I2C(board.SCL, board.SDA, frequency=400000)`) | Estimated (configured in code; manufacturer limit from datasheet) | Melexis datasheet [25], `app/sensors/mlx90640.py` |
| I2C address | 0x33 (default) | Estimated (configured in code and documentation) | `app/config.py`, Melexis datasheet [25], Waveshare [17] |
| Supply voltage | 3.3 V (breakout boards accept 3.3 V or 5 V) | Estimated (manufacturer documentation) | Melexis datasheet [25], Waveshare [17] |
| Current consumption | Less than 23 mA | Estimated (manufacturer documentation) | Melexis datasheet [25], Waveshare [17] |
| Power consumption | Less than 3.3 V x 0.023 A = 0.076 W (76 mW) | Calculated from datasheet values | Derived from Melexis datasheet [25] |
| Data acquisition time per frame | At the project's configured 4 Hz refresh rate, a complete new frame is produced every 250 ms. The I2C transfer of 768 pixels plus calibration overhead is the dominant read cost | Estimated (configured value; not measured) | `app/config.py` (`MLX90640_REFRESH_HZ = 4`), `app/sensors/mlx90640.py` |
| Startup time | First valid data available after power-on depends on the selected refresh rate (datasheet formula, ms scale, refresh-rate dependent) | Estimated (manufacturer documentation) | Melexis datasheet [25] |
| FOV and pixel geometry | 55 x 35 deg (D55) or 110 x 75 deg (D110) | Estimated; prototype variant not recorded | Waveshare [17], Adafruit guide [16] |

Data acquisition timing in the prototype:

- The polling loop in `app/services/data_manager.py` reads frames at `max(0.25 s, min(2.0 s, 1/refresh_hz))`, so at 4 Hz the loop targets 0.25 s per iteration (clamped to the 0.25-2.0 s range).
- Each frame contains 768 float temperatures; min/max/avg are computed in `thermal_processing.analyze_frame`. This processing is lightweight (microseconds to milliseconds on a Pi 4). Classification: Estimated.
- Effective thermal sampling rate of the system is limited by the sensor refresh rate (configured 4 Hz), not by the CPU.

### 2.4 LoRa Ra-02 Module

The Ra-02 is an Ai-Thinker module based on the Semtech SX1278, for the 410-525 MHz band (used at 433 MHz in this project).

| Parameter | Value | Classification | Source |
|---|---|---|---|
| Chipset | Semtech SX1278 | Estimated (module documentation) | Ra-02 product specification [22], SX1276/77/78/79 datasheet [24] |
| Frequency range | 410-525 MHz; commonly used at 433 MHz | Estimated (module documentation); project default 433.0 MHz (marked VERIFY in config) | Ra-02 product specification [22], `app/config.py` |
| Supported frequency bands | 410-525 MHz (LF port of the SX1278) | Estimated (module documentation) | Ra-02 product specification [22], Semtech [23] |
| Modulation | LoRa (CSS), also FSK/GFSK/MSK/GMSK/OOK | Estimated (module documentation) | Ra-02 product specification [22], Semtech [23] |
| Max transmit power | 18 +/- 1 dBm (PA_BOOST) | Estimated (module documentation) | Ra-02 product specification [22], JLCPCB [20] |
| Project-configured TX power | 17 dBm | Estimated (configured in code, not measured) | `app/config.py` (`LORA_TX_POWER_DBM = 17`) |
| Receiver sensitivity @ SF7 / BW 125 kHz | -125 dBm (433 MHz) | Estimated (module documentation) | Ra-02 product specification [22] |
| Receiver sensitivity @ SF10 / BW 125 kHz | -134 dBm (433 MHz) | Estimated (module documentation) | Ra-02 product specification [22] |
| Receiver sensitivity @ SF12 / BW 125 kHz | -141 dBm (433 MHz) | Estimated (module documentation) | Ra-02 product specification [22] |
| Programmable bit rate | Up to 300 kbps (FSK); LoRa mode roughly 0.018-37.5 kbps depending on SF/BW | Estimated (module documentation) | Ra-02 product specification [22], Semtech [23] |
| Communication bandwidth (project config) | 125 kHz LoRa bandwidth; project config constant `LORA_BANDWIDTH_HZ = 125000` | Estimated (configured in code) | `app/config.py` |
| Spreading factor (project config) | SF7 (configurable 6-12) | Estimated (configured in code) | `app/config.py` |
| Coding rate (project config) | 4/5 (`LORA_CODING_RATE = 5`) | Estimated (configured in code) | `app/config.py` |
| Preamble length (project config) | 8 symbols | Estimated (configured in code) | `app/config.py` |
| Sync word (project config) | 0x12 | Estimated (configured in code) | `app/config.py` |
| CRC | Enabled (`LORA_ENABLE_CRC = 1`) | Estimated (configured in code) | `app/config.py` |
| Interface | SPI, half-duplex; up to 256-byte packets with CRC | Estimated (module documentation) | Ra-02 product specification [22], Semtech [23] |
| Supply voltage | 2.5-3.7 V, typical 3.3 V | Estimated (module documentation) | Ra-02 product specification [22], JLCPCB [20] |
| TX current @ 433 MHz | 93 mA typical | Estimated (module documentation) | Ra-02 product specification [22], JLCPCB [20] |
| RX current | 12.15 mA typical | Estimated (module documentation) | Ra-02 product specification [22], JLCPCB [20] |
| Standby current | 1.6 mA (433 MHz) / 1.5 mA (470 MHz) | Estimated (module documentation) | Ra-02 product specification [22] |
| TX power consumption | 3.3 V x 0.093 A = 0.307 W | Calculated from module documentation | Derived from Ra-02 product specification [22] |
| RX power consumption | 3.3 V x 0.01215 A = 0.040 W | Calculated from module documentation | Derived from Ra-02 product specification [22] |
| Standby power consumption | 3.3 V x 0.0016 A = 0.0053 W | Calculated from module documentation | Derived from Ra-02 product specification [22] |
| Antenna | IPEX (U.FL) connector; external 433 MHz antenna required | Estimated (module documentation) | Ra-02 product specification [22] |
| Operating temperature | -30 to +85 deg C | Estimated (module documentation) | Ra-02 product specification [22] |
| Marketing range claim | "Up to 10 km" in open field (vendor marketing, not a project measurement) | Estimated (vendor claim, not verified) | Module reseller documentation [from Ra-02 search results] |
| ACK / retry behavior | `LORA_REQUIRE_ACK = 0` (disabled), ACK timeout 1.5 s, max retries 2 | Estimated (configured in code) | `app/config.py` |
| Time-on-air at current config | See Section 4.9 | Calculated | Derived from Semtech ToA formula [24] |

Important configuration notes:

- The project marks `LORA_FREQUENCY_MHZ = 433.0` with the comment "VERIFY for LoRa 02 variant". The SX1278-based Ra-02 supports 410-525 MHz, so 433 MHz is legal for this module, but the actual module in hand must be checked (some LoRa 02-class boards are 868/915 MHz variants).
- `LORA_TX_POWER_DBM = 17` is below the module's 18 +/- 1 dBm maximum. The code writes PA_BOOST with `0x80 | clamp(power-2, 0, 15)` and sets PA_DAC = 0x84, which is the +20 dBm-capable setting on SX1276/78, but the effective output is set by PA_CONFIG; the configured intent is 17 dBm. Classification: Estimated (configured, not measured).
- The paper describes Ebyte E220/E32 modules at 915/923 MHz with MAVLink; the code targets SX127x at 433 MHz with compact JSON payloads. These are two different link budgets. 433 MHz propagates better around obstacles but at lower data rate; 915 MHz offers more bandwidth. The project README explicitly says LoRa 02 variants differ and must be verified before operation.
- The transmitter masks DIO0 as TxDone and polls both the DIO0 pin and `REG_IRQ_FLAGS` (0x12, TX_DONE mask 0x08) to confirm each transmission. This gives a "transmitted and not timed out" confirmation only; it is not an end-to-end delivery confirmation.

### 2.5 Other connected sensors and peripherals

| Component | Present in project? | Notes |
|---|---|---|
| GPS module | No | The Pi 4B has no built-in GPS; no GPS module or driver appears in the code. Browser geolocation only. |
| RGB/CSI camera | No (current build) | Paper describes a Pi RGB camera on MIPI CSI-2; not present in this codebase. |
| Wi-Fi | Yes (on-board) | Used as local access point (`aeris-groundstation`), 2.4/5 GHz 802.11ac. |
| Bluetooth | Yes (on-board, unused by app) | Not used. |
| MicroSD card storage | Yes | SQLite database and website build are stored on it. |
| Laptop (GCS-side) | External | Runs browser dashboard; provides geolocation. |
| Battery | No | Not configured. |
| Fan/heatsink | Not documented | Not specified in project. |

### 2.6 Recorded data availability

`data/aeris.db` (inspected) contains:

- `thermal_readings`: 1,995 rows, all with `sensor_connected = 0` (no temperature data). Timestamp range 1794759201.04 to 1794760023.01 epoch = 2026-11-15 16:13:21 to 16:27:03 UTC.
- `detection_events`: 0 rows.
- `lora_transmissions`: 369+ rows, all with `ok = 0`. All errors are "LoRa init failed (verify chipset/pins/frequency/wiring): No module named 'spidev'".

Classification of all recorded rows: they are real application logs of failed attempts, not measurements of performance. They confirm that no hardware was attached or available in the development environment. They must not be used as performance data.

## 3. Video Transmission Performance

### 3.0 Status of the video path in this prototype

The current prototype has no video transmission path. The dashboard renders the MLX90640 thermal heatmap (32 x 24 grid) pushed over a local WebSocket; this is not video. The research paper describes a separate 5 GHz Wi-Fi 802.11ac video downlink from the UAV to the ground control station (Alfa AWUS036ACM USB adapter, GStreamer H.264 compression, UDP transport, target latency <= 105 ms, 1080p30 / 720p60 capture, 5-6 Mbps pipeline). That link is not implemented in this codebase. All video parameter classifications below therefore reflect either the paper's targets or the thermal-heatmap substitute, never measured prototype video results.

### 3.1 Video Latency

- Parameter name: Video latency (glass-to-glass latency)
- Description: The total time from the moment a frame is captured by the camera until the same frame is displayed on the receiving screen. Includes capture, encoding, transmission, network queueing, decoding, and display.
- Unit: milliseconds (ms)
- Available value: The paper targets <= 105 ms for the 5 GHz video downlink (glass-to-glass). No value is measurable in the current prototype because no video downlink exists. For the thermal WebSocket feed, latency has not been measured. Classification: Proposed (measurement method below); paper target Estimated (paper-defined target, not a measurement).
- Relevance to AERIS: In the target UAV system, the operator needs near-real-time video to avoid disorientation and pilot-induced oscillation. In the current Pi 4B ground-station build, low-latency display of the thermal feed is still valuable for operator situational awareness.
- Suggested measurement method: Timestamp a visible LED/frame counter at the camera end, record display time at the receiving end, and compute the difference; or use a hardware frame generator and a photodiode at the display. Software-only: measure WebSocket message timestamps at both ends with synchronized clocks. Report min/avg/max/p95/p99.

### 3.2 Video Frame Rate (FPS)

- Parameter name: Video frame rate
- Description: The number of video frames transmitted and rendered per second.
- Unit: frames per second (FPS)
- Available value: Paper's described capture capability is 1080p at up to 30 FPS, or 720p at 60 FPS. The MLX90640 thermal feed is refresh-limited: the project configures 4 Hz (4 frames per second), and the Adafruit documentation notes ~16 FPS practical maximum on typical hosts. No FPS has been measured in the AERIS build. Classification: Estimated (configuration limit and vendor documentation); Proposed (measurement on hardware).
- Relevance to AERIS: Determines how fluid the operator's view is and how much compute the Pi 4 must spend on capture and encode. A thermal feed at 4 FPS is adequate for presence detection display but not for piloted flight control.
- Suggested measurement method: Count complete frames pushed through the pipeline per second over a 60 s window (e.g., instrument `read_frame()` and the WebSocket broadcast); use GStreamer `fpsdisplaysink` stats if a video pipeline is added; log heatmap publish rate in the browser.

### 3.3 Video Resolution

- Parameter name: Video resolution
- Description: The pixel dimensions of each video frame.
- Unit: pixels (e.g., 1920 x 1080)
- Available value: Paper target: 1080p at up to 30 FPS (or 720p60). Current thermal feed: fixed 32 x 24 (768 pixels), displayed scaled-up in the browser. No RGB camera is installed. Classification: Estimated (paper target) / Configured (32 x 24 thermal grid, `THERMAL_FRAME_WIDTH/HEIGHT` in `app/config.py`).
- Relevance to AERIS: Resolution drives bandwidth, encode CPU load, and detection quality. The MLX90640 grid is low by design; the paper uses RGB for AI and situational awareness.
- Suggested measurement method: Read frame dimensions at the decoder; verify against configured values (`videotestsrc`/`v4l2src` caps in GStreamer, or `thermal.frame.width/height` in the WebSocket payload).

### 3.4 Video Transmission Stability

- Parameter name: Video transmission stability
- Description: How consistently the video stream maintains its frame rate, bitrate, and connection over time, without interruptions, reconnects, or bitrate collapse.
- Unit: qualitative (e.g., uptime of stream, variance in Mbps) or expressed via bitrate jitter (Mbps) and stall count (events/min)
- Available value: Not available. The current prototype has no video transmission; Wi-Fi hotspot stability for the dashboard has not been soak-tested. Classification: Proposed.
- Relevance to AERIS: A rescue operator cannot tolerate a video feed that drops or freezes during a mission. Stability testing is a prerequisite before any video-based evaluation is meaningful.
- Suggested measurement method: Run the stream for N hours; log bitrate (Mbps), FPS, and stall events every second; compute jitter (standard deviation), uptime percentage, and number of reconnections; repeat across distances and with/without obstructions.

### 3.5 Video Processing Delay

- Parameter name: Video processing delay
- Description: The time spent on the companion computer to capture, pre-process, encode, and (on the receiver) decode each frame, excluding propagation.
- Unit: milliseconds (ms)
- Available value: Not available. `analyze_frame` in the thermal path is lightweight but has never been timed on hardware. Paper processing budget: total end-to-end <= 105 ms including all pipeline stages. Classification: Proposed (timing method); paper target Estimated.
- Relevance to AERIS: Excess processing delay consumes the latency budget before the RF link is even considered. On Pi 4 without hardware encode, a 1080p software encode would blow the budget by a wide margin.
- Suggested measurement method: Wrap each pipeline stage with `time.perf_counter()`; log per-stage durations (capture, normalize, encode, transmit, decode); compute per-stage mean and p95 over at least 1,000 frames.

### 3.6 Frame Drop Rate

- Parameter name: Frame drop rate
- Description: The percentage of frames that are captured but never displayed (dropped due to encode stalls, UDP loss, buffer overrun, or decoder overload).
- Unit: percent (%)
- Available value: Not available. The paper explicitly accepts UDP frame skipping for the video link to hold latency; an upper bound is not specified. Classification: Proposed.
- Relevance to AERIS: Frame drops translate directly into jerky video and possible missed detection opportunities. A known drop rate is required to size the pipeline (bitrate vs. congestion trade-off, rate-distortion theory).
- Suggested measurement method: Sequence-number UDP packets at the encoder; compare sequence numbers at the decoder; drop rate = (expected - received) / expected x 100. Cross-check with encoder-side QoS metrics (`fpsdisplaysink` drop counters). Expected: depends on configured bitrate headroom; benchmark at 5-6 Mbps as the paper suggests.

### 3.7 Video Bandwidth Consumption

- Parameter name: Video bandwidth consumption
- Description: The network throughput consumed by the video stream.
- Unit: megabits per second (Mbps)
- Available value: Paper target pipeline: 5-6 Mbps H.264 over UDP. Raw uncompressed 1080p30 would be about 200 Mbps (the paper cites 200 Mbps as the raw input). The thermal WebSocket feed consumes only a few kilobytes per frame (768 floats plus metadata, roughly 8-15 kB per frame at 4 Hz, i.e., well under 0.1 Mbps). Classification: Estimated (paper target for video; calculated for thermal feed).
- Relevance to AERIS: The 5 GHz link budget and the air interface (OFDM, 802.11ac) must carry this rate with margin; otherwise the link congests (as the paper's stress-test intentionally demonstrates).
- Suggested measurement method: Measure actual throughput at the sending interface (e.g., `ip -s link` byte counters, or GStreamer `identity` element byte counts); compare sent vs. received bytes; log Mbps over a 60 s window; report average and peak.

### 3.8 Summary table - video parameters

| # | Parameter | Unit | Value status | Classification |
|---|---|---|---|---|
| 1 | Video latency | ms | <= 105 ms (paper target, 5 GHz link); unmeasured | Estimated (paper) / Proposed (measurement) |
| 2 | Video frame rate | FPS | 1080p30 / 720p60 (paper); 4 Hz thermal refresh (configured) | Estimated / Configured |
| 3 | Video resolution | pixels | 1080p / 720p (paper); 32 x 24 (thermal, configured) | Estimated / Configured |
| 4 | Video transmission stability | qualitative / jitter | Not available | Proposed |
| 5 | Video processing delay | ms | Not available; <= 105 ms end-to-end budget (paper) | Proposed / Estimated (paper) |
| 6 | Frame drop rate | % | Not available | Proposed |
| 7 | Video bandwidth consumption | Mbps | 5-6 Mbps (paper target); ~0.1 Mbps thermal feed (calculated) | Estimated / Calculated |

## 4. LoRa Communication Performance

### 4.0 Scope of the LoRa path in this prototype

The prototype uses the LoRa link for small telemetry packets only (device ID, timestamp, sequence number, sensor status, detection status/type/confidence, thermal min/max/avg, error status). It never transmits thermal images or video over LoRa. The receiver is a placeholder; there is no verified end-to-end link, so all receiver-side parameters (RSSI, SNR, PLR, PDR, reception latency) are unverifiable today. The paper targets a different band (915/923 MHz), different modules (Ebyte E220/E32), and MAVLink framing; those parameters are quoted as paper targets, not as prototype specifications.

### 4.1 RSSI (Received Signal Strength Indicator)

- Parameter name: RSSI
- Description: The power of the received radio signal, as measured by the radio's received-signal-strength register. It indicates how strong the link is and how much margin remains before the signal is unreadable.
- Unit: dBm (decibel-milliwatts); typically negative, e.g., -60 dBm is strong, -120 dBm is very weak.
- Available value: Not measurable in this prototype (no verified receiver). Ra-02 sensitivity floor: -125 dBm (SF7), -134 dBm (SF10), -141 dBm (SF12) at 433 MHz. The paper's target zones: near-field -40 to -50 dBm at 10 m, and no worse than -95 dBm at 200 m (LoRa telemetry); for the 5 GHz link, no worse than -80 dBm. The SX1278 register 0x1A (`REG_PKT_RSSI_VALUE`, offset constant `-164` for the 433 MHz LF port) converts the raw register to dBm: RSSI(dBm) = -164 + Rssi (LF port, 137-525 MHz). For SNR < 0: Packet Strength = -164 + PacketRssi + PacketSnr x 0.25. These formulas are implemented-ready but the code does not yet read them in the placeholder receiver. Classification: Proposed (measurement); sensitivity floors Estimated (module documentation [22]); formulas Estimated (Semtech datasheet [24]); paper targets Estimated (paper).
- Relevance to AERIS: RSSI is the primary quantitative indicator of link margin and coverage in the field. The paper uses RSSI degradation curves over distance and altitude to validate the architecture.
- Suggested measurement method: On a compatible receiver (the repo placeholder `app/communication/lora_receiver.py` must be implemented, or a second Ra-02 node), read `REG_PKT_RSSI_VALUE` (0x1A) after each received packet, apply RSSI = -164 + value (LF port), and log per-packet RSSI vs. distance/altitude. Compare against the fade-margin target (>= 10 dB above sensitivity floor).

### 4.2 SNR (Signal-to-Noise Ratio)

- Parameter name: SNR
- Description: The ratio between the received signal power and the noise floor power. LoRa can decode packets at negative SNR (below the noise floor) because of chirp spread spectrum processing gain.
- Unit: dB (decibels), can be negative.
- Available value: Not measurable in this prototype. Ra-02/SX1278 demodulator floor: the paper and Semtech documentation use the relation SNR = RegPktSnrValue / 4 (signed two's-complement-like coding). Expected cliff values for LoRa at SF7 are about -7.5 dB; at SF12 about -20 dB (Ra-02 datasheet sensitivity columns list SNR -7, -15, -20 dB for SF7/SF10/SF12). Classification: Proposed (measurement); SF-SNR mapping Estimated (module documentation [22]); conversion formula Estimated (Semtech datasheet [24]).
- Relevance to AERIS: SNR determines whether a packet can be decoded at all. Near the link limit, SNR goes negative; the rate-distortion and fade-margin design targets in the paper assume healthy SNR at max range.
- Suggested measurement method: On the receiver, read `REG_PKT_SNR_VALUE` (0x19) after each packet, compute SNR = value / 4.0, log per-packet SNR vs. distance; flag packets decoded with SNR below the SF cliff (packet recovered by processing gain alone).

### 4.3 PLR (Packet Loss Rate)

- Parameter name: Packet Loss Ratio / Packet Loss Rate
- Description: The percentage of transmitted packets that fail to arrive at the receiver.
- Unit: percent (%)
- Available value: Paper target: <= 2.5% at 200 m (yields >= 97.5% PDR) for the telemetry link; 5 GHz video link intentionally not evaluated for PLR (UDP frame skipping). Prototype value: not measurable (no verified receiver; all logged TX attempts failed at init). Classification: Proposed (measurement); paper target Estimated (paper).
- Relevance to AERIS: PLR is the single most important reliability metric for mission-critical survivor coordinates. The paper's pass/fail threshold is PLR <= 2.5%.
- Suggested measurement method: Transmit N numbered packets (the implementation already increments `seq` and caps payloads at 255 bytes); on the receiver count unique received sequence numbers; PLR = (sent - received) / sent x 100. Recompute per distance/altitude cell. The project's `lora_transmissions` table is the correct sent-side log; the receiver side must be added.

### 4.4 PDR (Packet Delivery Ratio)

- Parameter name: Packet Delivery Ratio
- Description: The fraction of transmitted packets successfully received. PDR = 1 - PLR (when expressed as fractions).
- Unit: ratio (0 to 1) or percent (%)
- Available value: Paper target: >= 97.5%. Prototype: not measurable. Classification: Proposed (measurement); paper target Estimated (paper).
- Relevance to AERIS: Used in the paper's validation framework as the network reliability projection criterion (97.5% across simulated radial distances) and in the log-distance path-loss modeling.
- Suggested measurement method: Same experiment as PLR; PDR = received / sent. Report per test cell (distance x altitude).

### 4.5 Communication Range

- Parameter name: Communication range
- Description: The maximum distance over which the link maintains acceptable RSSI/SNR and PLR.
- Unit: meters (m) or kilometers (km)
- Available value: Paper tests radial distances of 10, 50, 100, 150, 200 m at altitudes 10/30/50 m (one paper section mentions 10-500 m; the validation matrix and target specifications use 200 m as the maximum edge). Ra-02 vendor marketing claims "up to 10 km" in open field with good antenna and high SF; not verified by this project. Prototype: not measurable. Classification: Proposed (measurement); paper distances Estimated (paper); vendor claim Estimated (vendor, unverified).
- Relevance to AERIS: Range defines the operational envelope of the search-and-rescue drone. The 433 MHz link generally out-ranges the 5 GHz video link.
- Suggested measurement method: Open-field LOS test per the paper's Stage A-E protocol (waypoint radial steps, altitudes 10/30/50 m, favorable weather); record RSSI/SNR/PLR per cell; define range as the distance at which PLR exceeds 2.5% or RSSI falls 10 dB above the sensitivity floor (whichever limit is hit first). Note: regulatory limits apply to 433 MHz ISM band duty cycle and power; check local rules.

### 4.6 Packet Transmission Interval

- Parameter name: Packet transmission interval
- Description: The time between consecutive LoRa telemetry transmissions.
- Unit: seconds (s); reciprocal is the update rate (Hz).
- Available value: Configured `LORA_TX_INTERVAL_S = 2.0` (0.5 Hz) in `app/config.py`. The data manager sends when `(now - last_tx) >= LORA_TX_INTERVAL_S`. Actual on-air period measured from `lora_transmissions.ts`: the DB contains only failed attempts spaced about 2.0-2.2 s apart (failure retry loop), which matches the configured interval but is not a valid TX measurement. Classification: Configured (code); measured spacing of failures Calculated (from DB timestamps, not a valid radio measurement).
- Relevance to AERIS: Sets the telemetry update rate of the whole system, bounds channel occupancy (duty cycle), and interacts with time-on-air to determine how much of the channel is used.
- Suggested measurement method: Log `meta["timestamp"]` for each transmitted packet; compute delta between consecutive timestamps; report the distribution. Verify the 2.0 s nominal and that blocking TX does not stretch the loop (at 4 Hz refresh and 2 s interval, TX duration ~287 ms, which is acceptable but not negligible).

### 4.7 Packet Reception Latency

- Parameter name: Packet reception latency / end-to-end telemetry latency
- Description: The total time from packet creation on the transmitter to availability at the receiver application (processing + serialization + air time + propagation + receiver interrupt handling + deserialization).
- Unit: milliseconds (ms)
- Available value: Paper target: <= 131 ms end-to-end for the 915 MHz LoRa telemetry link (accounting for CSS time-on-air, serial overhead, and edge inference). Calculated physical floor for the current config (SF7, BW 125 kHz, CR 4/5, preamble 8, CRC on): see Section 4.9 - about 287 ms for a ~177-byte payload. The paper's 131 ms target is not achievable at SF7/BW125 with 177-byte payloads; it would require SF7/BW250 (~144 ms) or a smaller payload (e.g., <= 64-byte binary frame, ~118 ms). Prototype: not measurable (no receiver). Classification: Proposed (measurement); paper target Estimated (paper); time-on-air Calculated.
- Relevance to AERIS: Meeting the <= 131 ms cap is a pass/fail criterion in the paper's validation matrix (SOP 2/SOP 4).
- Suggested measurement method: Sender embeds `ts` (already present as `body.setdefault("ts", time.time())`); receiver logs arrival time; latency = arrival - ts (requires synchronized clocks, e.g., NTP/PTP, or one-way via round-trip/2 if RTT is symmetric); report min/avg/p95/p99/max. Alternative: measure at the application layer of both Pi nodes.

### 4.8 LoRa Transmission and Reception Power

- Parameter name: LoRa TX/RX power consumption
- Description: Electrical power drawn by the radio during transmit, receive, and idle states.
- Unit: watts (W) and milliamps (mA) at 3.3 V
- Available value: TX: 93 mA @ 433 MHz -> 0.307 W (calculated from module spec). RX: 12.15 mA -> 0.040 W (calculated). Standby: 1.6 mA -> 0.0053 W (calculated). Sleep: microamp-level, not specified in the Ra-02 datasheet excerpt inspected; the SX127x supports 200 nA register retention per Semtech features; module-level sleep current not verified. Classification: Calculated (from module documentation [22]); sleep current Proposed (check module datasheet revision).
- Relevance to AERIS: LoRa is chosen precisely because its energy cost per bit is low; on a battery-powered UAV/ground node this dominates the radio-energy budget, not the average-vs-burst distinction.
- Suggested measurement method: Insert a power meter (e.g., INA219/INA226 breakout or a precision shunt) between the 3.3 V rail and the Ra-02; log current during TX bursts and RX listening; compute average power for the 2.0 s cycle at the calculated time-on-air duty cycle (~14%).

### 4.9 Calculated time-on-air at the current configuration

Assumptions: explicit header (H = 0), low data rate optimize DE = 0 (SF7), CRC on (16 bits), preamble 8 symbols, CR 4/5 (CR = 1), no implicit header. Formula (Semtech): N_payload = 8 + ceil((8PL - 4SF + 28 + 16 - 20*0) / (4*(SF - 2*DE))) x (CR + 4); T_packet = (preamble + 4.25 + N_payload) x 2^SF / BW.

| Payload size | Time-on-air SF7/BW125k | SF7/BW250k | SF7/BW500k |
|---|---|---|---|
| 51 B (compact binary) | 102.7 ms | 51.3 ms | 25.7 ms |
| 64 B | 118.0 ms | 59.0 ms | 29.5 ms |
| 120 B | 199.9 ms | 100.0 ms | 50.0 ms |
| 150 B | 246.0 ms | 123.0 ms | 61.5 ms |
| 177 B (typical JSON payload with temp block) | 287.0 ms | 143.5 ms | 71.7 ms |
| 208 B (JSON with temp and detection) | 327.9 ms | 164.0 ms | 82.0 ms |
| 255 B (maximum, code truncates at 255) | 399.6 ms | 199.8 ms | 99.9 ms |

Classification: Calculated (Semtech formula, from configured parameters; not measured).

Implications for the AERIS link design (engineering observations, not test results):

- At the current SF7/BW125 setting with the code's JSON telemetry, air time alone (~287 ms) already exceeds the 131 ms end-to-end target in the paper. To meet it, the payload should be reduced (binary protocol instead of JSON) or bandwidth increased (BW 250 kHz at the same SF7), subject to link-budget impact (wider bandwidth reduces sensitivity).
- Duty cycle at SF7/BW125 and 2.0 s interval with 177 B payload is 287/2000 = 14.3%, which may exceed ISM-band duty-cycle limits in some jurisdictions (e.g., 1% or 10% sub-band rules in EU; Philippine 433 MHz ISM usage should be checked locally). Check local regulations before field use. Classification: Estimated (regulatory caution, verify locally).
- The receiver must be in continuous RX or CAD-listen to catch packets; the prototype receiver is a placeholder, so reception behavior is unknown.

### 4.10 Register-level notes for verification on hardware

- Chipset check: read `REG_VERSION` (0x42); expect 0x12 for SX1276/78. The code rejects 0x00/0xFF with a clear error.
- RSSI: `REG_PKT_RSSI_VALUE` 0x1A; LF-port offset -164 (433 MHz). HF-port offset -157 (> 779 MHz).
- SNR: `REG_PKT_SNR_VALUE` 0x19; SNR(dB) = signed value / 4.
- TX confirmation: `REG_IRQ_FLAGS` 0x12, `IRQ_TX_DONE_MASK` 0x08; DIO0 mapped as TxDone via `REG_DIO_MAPPING_1` 0x40 = 0x40.
- Bandwidth map in code: BW_MAP covers 7.8 kHz to 500 kHz; `LORA_BANDWIDTH_HZ` must exist in the map or the default 0b0111 (125 kHz) is used silently. Classification: Configured (code inspection).

### 4.11 Summary table - LoRa parameters

| # | Parameter | Unit | Value status | Classification |
|---|---|---|---|---|
| 1 | RSSI | dBm | Not measurable; floors -125/-134/-141 dBm (SF7/10/12) | Proposed / Estimated (module spec) |
| 2 | SNR | dB | Not measurable; SF7 cliff about -7.5 dB (datasheet col: -7) | Proposed / Estimated (module spec) |
| 3 | PLR | % | Not measurable; paper target <= 2.5% @ 200 m | Proposed / Estimated (paper) |
| 4 | PDR | % (ratio) | Not measurable; paper target >= 97.5% | Proposed / Estimated (paper) |
| 5 | Communication range | m / km | Not measurable; paper test cells 10-200 m; vendor claim 10 km (unverified) | Proposed / Estimated |
| 6 | Packet transmission interval | s | 2.0 s configured (0.5 Hz) | Configured |
| 7 | Packet reception latency | ms | Not measurable; paper target <= 131 ms; current-config air time ~287 ms @ 177 B | Proposed / Estimated (paper) / Calculated |
| 8 | TX/RX power | W / mA | TX 0.307 W, RX 0.040 W, standby 0.0053 W (calculated from module spec) | Calculated |

## 5. Telemetry Performance

### 5.1 Telemetry Latency

- Parameter name: Telemetry latency (end-to-end)
- Description: The time from when telemetry is produced on the transmitter (here: the Pi building and handing the JSON payload to the radio) until it is available at the receiving application.
- Unit: milliseconds (ms)
- Available value: Not measurable (no receiver). Paper target: <= 131 ms (LoRa link). Calculated air-time floor at current config: ~102-287 ms depending on payload (see Section 4.9). The total also includes sensor acquisition (~250 ms at 4 Hz refresh, but telemetry is not query-synchronous; the payload uses the latest frame), queueing, and receiver handling. Classification: Proposed (measurement); paper target Estimated; air time Calculated.
- Relevance to AERIS: Freshness of survivor coordinates and detection flags is the core value of the telemetry link; stale data is worse than no data for Search-and-Rescue triage.
- Suggested measurement method: Stamp `ts` at payload build (already implemented); at the receiver, subtract from arrival timestamp; log distribution; also measure one-way delay components (sensor read to TX enqueue) with `time.perf_counter()` in `_build_lora_payload`.

### 5.2 GPS Update Rate

- Parameter name: GPS update rate
- Description: How often the positioning source produces a new fix.
- Unit: hertz (Hz) or fixes per second
- Available value: Not applicable to the current prototype - no GPS receiver is installed. The Pi 4B has no built-in GPS. The dashboard map uses browser geolocation (`navigator.geolocation.watchPosition`), whose update rate is browser/OS/power-profile dependent (commonly 0.5-1 Hz; not guaranteed and not configurable). The paper assumes GPS via MAVLink `GLOBAL_POSITION_INT` from the flight controller (ArduPilot SITL typically 1-10 Hz; 921600 baud link). Classification: Not available (hardware absent); Estimated (browser/FC typical rates, not AERIS measurements).
- Relevance to AERIS: In the target UAV, GPS provides the survivor coordinates transmitted over LoRa; fix rate bounds how fresh those coordinates are. In the ground-station Pi build, browser GPS is only for the operator's laptop display.
- Suggested measurement method (if GPS is added): Use `u-blox` receiver in UBX/NMEA mode; log `fixRate` from NAV-PVT; or parse NMEA GPGGA/GNRMC sentence rate; measure observed inter-fix interval over 10 minutes (cold/warm/hot start).

### 5.3 GPS Position Accuracy

- Parameter name: GPS position accuracy
- Description: The horizontal and vertical error radius of the reported position (CEP, 2DRMS), and the accuracy estimate the GPS reports (e.g., u-blox hAcc/vAcc).
- Unit: meters (m)
- Available value: Not applicable (no GPS module). Browser geolocation reports an accuracy value in meters when available; the map page displays it, but it has never been benchmarked against a known position. The paper relies on 3D GPS lock for GUIDED-mode authorization and target plotting, with no published accuracy figure for this project. Classification: Not available; Estimated (typical consumer GPS ~2-5 m CEP outdoors, unverified here).
- Relevance to AERIS: Survivor localization error directly determines search radius for rescue teams; the paper calls for GPS validation before autonomous flight.
- Suggested measurement method (if GPS is added): Stationary occupancy test at a surveyed point (or compare against a RTK reference); log reported hAcc/vAcc and true horizontal error; report CEP50 and CEP95 over >= 1,000 fixes.

### 5.4 Telemetry Update Frequency

- Parameter name: Telemetry update frequency
- Description: How often a telemetry packet is actually sent on the LoRa link.
- Unit: hertz (Hz) or packets per minute
- Available value: Configured 0.5 Hz (`LORA_TX_INTERVAL_S = 2.0`). Actual transmissions: none succeeded (all attempts failed at init). Dashboard state broadcast runs at the polling interval (~1-4 Hz at 4 Hz refresh, clamped to >= 0.25 s). Classification: Configured (code); Measured (only for failure rate: 369 failures in ~13.5 minutes, ~27 attempts/min, which is a retry-loop artifact, not a valid update rate).
- Relevance to AERIS: Sets the link duty cycle and the freshness of GCS situational awareness; must respect radio duty-cycle limits and not starve the link budget.
- Suggested measurement method: Count successful TX events per minute from `lora_transmissions` where `ok = 1`; compute effective rate = successes / elapsed time; also log the nominal 2.0 s scheduling jitter in the data manager loop.

### 5.5 Telemetry Packet Loss

- Parameter name: Telemetry packet loss
- Description: The percentage of telemetry packets lost over the LoRa link.
- Unit: percent (%)
- Available value: Not measurable (no receiver). Same as PLR (Section 4.3). Paper target <= 2.5%. Classification: Proposed (measurement); paper target Estimated (paper).
- Relevance to AERIS: Same as PLR; called out separately for the telemetry context because it is the SOP 2 / SOP 4 pass-fail criterion.
- Suggested measurement method: As in Section 4.3, using `seq` numbers and a receiving node; bucket by distance/altitude; fail the cell if PLR > 2.5%.

### 5.6 Sensor Data Acquisition Time

- Parameter name: Sensor data acquisition time
- Description: The time from initiating a sensor read to having a valid frame/reading available for processing and transmission.
- Unit: milliseconds (ms)
- Available value: MLX90640 at configured 4 Hz: a new frame is available every 250 ms; the I2C burst read itself (768 pixels, frame plus chess-mode subpages) typically takes a few ms to a few tens of ms depending on bus speed (400 kHz configured vs 1 MHz max). Not measured on this prototype. The polling loop adds up to one frame period of staleness. Classification: Estimated (configured refresh; I2C timing estimated from datasheet bus speed); Proposed (measurement).
- Relevance to AERIS: Acquisition time is the first term in the end-to-end latency budget (`t_total = t_acq + t_proc + t_queue + t_tx` in the paper). At 4 Hz it dominates the telemetry freshness for detection data.
- Suggested measurement method: Wrap `read_frame()` in `time.perf_counter()`; log read duration and frame age at use; compute p50/p95; verify the loop interval against `1/MLX90640_REFRESH_HZ`.

### 5.7 Telemetry Communication Reliability

- Parameter name: Telemetry communication reliability
- Description: The overall probability that the telemetry link delivers data correctly over time, combining PLR/PDR, retransmit success, and radio stability (no brownouts, no config drift).
- Unit: percent (%) availability or PDR; MTBF/MTTR for the link (hours)
- Available value: Not measurable. The code attempts re-init every `max(LORA_TX_INTERVAL_S, 5.0)` seconds and logs every attempt; 100% of attempts failed in the recorded window. ACK/retry scaffolding exists (`LORA_REQUIRE_ACK = 0`, `LORA_MAX_RETRIES = 2`, `LORA_ACK_TIMEOUT_S = 1.5`) but the receiver ACK path is not implemented/verified, so reliability-with-retry cannot be evaluated. Classification: Proposed (measurement); reliability features Configured (code).
- Relevance to AERIS: Reliability is the ultimate SOP 2/SOP 4 objective; a link that needs operator babysitting is not mission-grade.
- Suggested measurement method: Soak test N hours at fixed range: count successful vs failed TX, duplicate seq detection, ACK round-trip success rate; report PDR, MTBF between link failures, and recovery time after forced failures (radio power-cycle).

### 5.8 Summary table - telemetry parameters

| # | Parameter | Unit | Value status | Classification |
|---|---|---|---|---|
| 1 | Telemetry latency | ms | Not measurable; paper target <= 131 ms; air-time ~103-287 ms calculated | Proposed / Estimated / Calculated |
| 2 | GPS update rate | Hz | Not applicable (no GPS); browser ~0.5-1 Hz typical (unverified); FC via MAVLink in paper | Not available / Estimated |
| 3 | GPS position accuracy | m | Not applicable (no GPS); browser accuracy displayed but unbenchmarked | Not available / Estimated |
| 4 | Telemetry update frequency | Hz | 0.5 Hz configured (2.0 s) | Configured |
| 5 | Telemetry packet loss | % | Not measurable; paper target <= 2.5% | Proposed / Estimated (paper) |
| 6 | Sensor data acquisition time | ms | ~250 ms frame period (4 Hz); read itself unmeasured | Estimated / Proposed |
| 7 | Telemetry communication reliability | % / MTBF | Not measurable; retry scaffolding present, unverified | Proposed |

## 6. AI Evaluation Metrics

### 6.1 What AI is actually implemented

The current prototype AI is `app/ai/human_detection.py`, a wrapper around `analyze_frame()` in `app/sensors/thermal_processing.py`. It is not a neural network. It implements an adaptive threshold blob heuristic:

- Threshold = scene average + `THERMAL_PRESENCE_DELTA_C` (default 4.0 deg C).
- A pixel is "hot" if it is in range and >= threshold.
- `person_detected` is true when `hot_pixels >= THERMAL_PRESENCE_MIN_PIXELS` (default 6 pixels of 768).
- Confidence is a heuristic 0-1 score from hot-pixel count and temperature margin above threshold (capped, e.g., 0.49 when below the pixel-count threshold), not a calibrated probability.
- The code explicitly states: "thermal presence heuristic only; not human identification."

The paper describes a completely different AI stack (YOLOv8 object detection on a Hailo-8L NPU, trained on aerial datasets, late sensor fusion with FLIR Lepton 3.5 at 160 x 120). That stack is not present in this repository (no Hailo driver, no YOLOv8 model, no FLIR driver). Accordingly:

- Metrics tied to a trained model (accuracy vs. labeled ground truth, precision/recall curves, F1) are applicable only if labeled evaluation data is collected; none exists.
- No AI metric in this section has a measured value today.
- The paper's AI success criteria (detection accuracy %, precision/recall, detection latency in seconds, false positive rate %) are quoted as paper targets for the target system, not as AERIS prototype results.

### 6.2 Metric applicability

| Metric | Applicable to current heuristic? | Notes |
|---|---|---|
| Accuracy | Yes, with labeled data | Overall correctness; must be computed against ground truth |
| Precision | Yes, with labeled data | Of positive detections, fraction correct |
| Recall | Yes, with labeled data | Of actual presence events, fraction detected |
| F1-score | Yes, with labeled data | Harmonic mean of precision and recall |
| Inference time | Yes, directly measurable | `analyze_frame` runtime per frame |
| Detection confidence | Yes (heuristic) | 0-1 score; not a calibrated probability |
| False positive rate | Yes, with labeled data | FP / (FP + TN) |
| False negative rate | Yes, with labeled data | FN / (FN + TP) = 1 - recall |
| Processing FPS | Limited by sensor, not AI | Max ~refresh rate (4 Hz configured; ~16 Hz Adafruit practical limit) |
| mAP / IoU | Not applicable (no detector/localizer) | Paper's YOLOv8 target would use these; not implemented here |
| Classification loss / training curves | Not applicable | No training occurs on device |

### 6.3 Accuracy

- Description: Overall correctness of the detection decision against ground truth.
- Unit: % (or fraction 0-1).
- Formula (paper): Accuracy = (TP + TN) / (TP + TN + FP + FN).
- Available value: Not available - no labeled evaluation set exists. Classification: Proposed (measurement with labeled data collection).
- Relevance: Headline metric; can be misleading with imbalanced classes (rare presence events), so pair with precision/recall/F1.
- Suggested method: Collect N labeled frames (presence/absent, verified by a human observer or a co-located visible-light camera in a test range); run heuristic offline on stored frames; build the confusion matrix.

### 6.4 Precision

- Description: Of all frames where the system reports presence, how many are true presence.
- Unit: % (or fraction 0-1).
- Formula (paper): Precision = TP / (TP + FP).
- Available value: Not available. Classification: Proposed.
- Relevance: High precision means few false alarms transmitted as survivor alerts - critical for not squandering rescue resources.
- Suggested method: Same labeled evaluation; precision = TP/(TP+FP).

### 6.5 Recall

- Description: Of all true presence events, how many the system detects.
- Unit: % (or fraction 0-1).
- Formula (paper): Recall = TP / (TP + FN).
- Available value: Not available. Classification: Proposed.
- Relevance: Missed survivors are the worst failure mode for SAR; recall is the safety-critical metric.
- Suggested method: Same labeled evaluation; recall = TP/(TP+FN).

### 6.6 F1-Score

- Description: Harmonic mean of precision and recall; balances both.
- Unit: % (or fraction 0-1).
- Formula (paper): F1 = 2 * (Precision * Recall) / (Precision + Recall).
- Available value: Not available. Classification: Proposed.
- Relevance: Single-number trade-off summary for threshold tuning (e.g., choosing `THERMAL_PRESENCE_DELTA_C` and `THERMAL_PRESENCE_MIN_PIXELS`).
- Suggested method: Compute from the confusion matrix at each candidate threshold; report the PR curve and best-F1 threshold.

### 6.7 Inference Time

- Description: The time to compute the detection result for one frame (input to output).
- Unit: milliseconds (ms) or microseconds (us).
- Formula (paper): t_detect = t_output - t_input.
- Available value: Not measured; expected to be far below 1 ms for the arithmetic involved (768 comparisons, sums) - but this is an engineering expectation, not a measurement. Classification: Proposed (measurement); expected magnitude Estimated.
- Relevance: Determines whether detection keeps pace with the 4 Hz refresh; feeds the end-to-end latency budget.
- Suggested method: `t0 = time.perf_counter()` around `detect_human_presence(frame)`; log p50/p95/max over >= 1,000 frames on the target Pi 4.

### 6.8 Detection Confidence

- Description: The heuristic score attached to each positive detection (0-1).
- Unit: dimensionless (0-1); shown as 0-100% on the dashboard.
- Available value: Available as a heuristic output (`confidence` in `ThermalAnalysis`), but it is not a calibrated probability; a value of 0.7 does not mean 70% chance of a person. Classification: Available (uncalibrated heuristic); calibration Proposed.
- Relevance: The dashboard alerts and LoRa packets carry this value; operators must know its limits. Miscalibration causes over-trust.
- Suggested method: Reliability diagram (bin predicted confidence vs. empirical presence frequency on labeled data); report expected calibration error (ECE).

### 6.9 False Positive Rate

- Description: Fraction of true negatives incorrectly flagged as presence.
- Unit: % (or fraction 0-1).
- Formula (paper): FPR = FP / (FP + TN).
- Available value: Not available. Classification: Proposed.
- Relevance: SOP-3-aligned metric (the paper lists false positive rate explicitly); controls alert fatigue.
- Suggested method: Same labeled evaluation; FPR = FP/(FP+TN). Also report false positives per hour of operation, which operators understand better.

### 6.10 False Negative Rate

- Description: Fraction of true presence events missed.
- Unit: % (or fraction 0-1).
- Formula: FNR = FN / (FN + TP) = 1 - recall.
- Available value: Not available. Classification: Proposed.
- Relevance: The symmetric counterpart of recall; central to SAR risk assessment. Note the paper quotes FPR explicitly and uses FN in the accuracy/recall formulas; FNR as a standalone figure is a natural completion.
- Suggested method: Same labeled evaluation; FNR = FN/(FN+TP).

### 6.11 Processing FPS

- Description: Effective end-to-end processing throughput of the detection pipeline.
- Unit: FPS.
- Available value: Capped by the sensor refresh rate: configured 4 Hz (`MLX90640_REFRESH_HZ = 4`); the Adafruit documentation advises ~16 FPS as a practical maximum for the MLX90640 over I2C on typical hosts (theoretical 32/64 Hz exists but image quality collapses and I2C becomes the bottleneck). CPU is not the bottleneck. Classification: Configured (4 Hz) / Estimated (manufacturer-adjacent documentation for practical ceiling).
- Relevance: Sets the maximum age of information reported to the operator.
- Suggested method: Count `analyze_frame` invocations per second logged with timestamps; compare against configured refresh; report sustained detection throughput.

### 6.12 What must NOT be claimed

- No claim that the heuristic "achieves X% accuracy" can be made; no labeled evaluation exists.
- No claim about YOLOv8/Hailo-8L performance applies to this codebase; those results belong to the paper's target system and only after its implementation and evaluation.
- The paper's FP rate / detection latency targets are requirements for the target detection subsystem, not measured properties of the current heuristic.

### 6.13 Summary table - AI parameters

| # | Parameter | Unit | Value status | Classification |
|---|---|---|---|---|
| 1 | Accuracy | % | Not available (no labeled set) | Proposed |
| 2 | Precision | % | Not available | Proposed |
| 3 | Recall | % | Not available | Proposed |
| 4 | F1-score | % | Not available | Proposed |
| 5 | Inference time | ms | Not measured (expected << 1 ms, unverified) | Proposed / Estimated |
| 6 | Detection confidence | 0-1 | Available (uncalibrated heuristic) | Configured (heuristic) / calibration Proposed |
| 7 | False positive rate | % | Not available | Proposed |
| 8 | False negative rate | % | Not available | Proposed |
| 9 | Processing FPS | FPS | <= 4 FPS (configured); ~16 FPS practical ceiling (vendor docs) | Configured / Estimated |

## 7. Power Consumption Analysis

Formula used throughout: Power (W) = Voltage (V) x Current (A). Battery runtime: t = C_battery x DoD / I_total, or in energy terms: runtime (h) = usable energy (Wh) / load power (W). Efficiency of the regulator must be applied for real systems.

### 7.1 Raspberry Pi 4 Model B

| State | Voltage | Current | Power | Classification |
|---|---|---|---|---|
| Idle | 5 V | ~540 mA (literature) | ~2.7 W | Estimated (literature [12]) |
| Idle (alt) | 5 V | ~580 mA | ~2.85-2.9 W | Estimated (literature [13][14]) |
| Light web load (`ab -n 100 -c 10`) | 5 V | ~1010 mA | ~5.1 W | Estimated (literature [12]) |
| Full 4-core load (`stress --cpu 4`) | 5 V | ~1280 mA | ~6.4 W | Estimated (literature [12]) |
| Heavy load range reported | 5 V | 1.2-1.6 A | ~6-8 W | Estimated (literature [13][15]) |
| Manufacturer supply spec | 5 V | min 3 A (15 W) recommended | headroom for USB peripherals | Estimated (manufacturer documentation [11]) |

Do not treat the 3 A supply rating as typical consumption. Typical operating consumption is roughly 2.7-3.5 W idle/light and 5-7 W under sustained load. The AERIS workload (FastAPI server, WebSocket broadcast, sensor polling, occasional LoRa TX) sits near the light-to-moderate end, roughly 3-5 W. Classification: Estimated (literature + workload judgment; never measured on this unit).

### 7.2 MLX90640 Thermal Camera

| State | Voltage | Current | Power | Classification |
|---|---|---|---|---|
| Operating (any refresh rate) | 3.3 V | < 23 mA (datasheet maximum) | < 0.076 W | Calculated from datasheet [25] |

The datasheet gives a single figure (current consumption less than 23 mA); no separate idle mode is documented for the sensor element in continuous mode. Breakout boards with on-board regulators still draw from the Pi's 3.3 V rail effectively the same amount.

### 7.3 LoRa Ra-02 Module

| State | Voltage | Current | Power | Classification |
|---|---|---|---|---|
| Transmit @ 433 MHz | 3.3 V | 93 mA | 0.307 W | Calculated from module spec [22] |
| Transmit @ 470 MHz | 3.3 V | 97 mA | 0.320 W | Calculated from module spec [22] |
| Receive | 3.3 V | 12.15 mA | 0.040 W | Calculated from module spec [22] |
| Standby | 3.3 V | 1.6 mA (433 MHz) | 0.0053 W | Calculated from module spec [22] |
| Sleep | 3.3 V | module-level sleep current not stated in inspected Ra-02 spec; SX1278 chip sleep is sub-uA with 200 nA register retention | ~0 W (chip) / unverified (module) | Estimated / Not verified |

Average radio power at the project's duty cycle (287 ms air time every 2.0 s, all failures aside): 0.307 W x 0.1435 = 0.044 W average, plus RX/standby remainder. Classification: Calculated (from specs and configured interval).

### 7.4 GPS Module

Not present. A typical u-blox-class GPS module draws 20-50 mA at 3.3 V (0.066-0.165 W); listed only so the absence is explicit. Classification: Not applicable (absent); Estimated (typical market modules, not inspected in this project).

### 7.5 Other peripherals

| Peripheral | Power | Classification |
|---|---|---|
| On-board Wi-Fi (AP mode, idle client) | ~0.3-0.8 W incremental (part of SoC/board measurement; not separately metered) | Estimated |
| MicroSD card (active) | ~0.1-0.25 W incremental | Estimated |
| Laptop (not on Pi power budget) | n/a | Not applicable |
| External 433 MHz antenna | passive, 0 W | n/a |

### 7.6 Estimated total system power

| Scenario | Pi 4B | MLX90640 | LoRa Ra-02 | Wi-Fi/SD (est.) | Total (est.) |
|---|---|---|---|---|---|
| Idle, LoRa standby | 2.7-2.9 W | 0.076 W | 0.005 W | 0.4-1.0 W | ~3.2-4.0 W |
| Typical AERIS operation (light load, periodic TX) | 3.0-4.0 W | 0.076 W | 0.044 W avg | 0.4-1.0 W | ~3.5-5.1 W |
| Worst case (full CPU load, radio in TX every 2 s) | 5.0-6.4 W | 0.076 W | 0.307 W burst / 0.044 W avg | 0.4-1.0 W | ~6.0-7.5 W (burst peak) |

Classification: Estimated (literature values combined with calculated radio averages; never measured on the AERIS unit).

### 7.7 Battery operating time estimate

No battery specification exists in this project. The paper documents the intended calculation method for a LiPo UAV battery:

- Paper total power demand: P_total = V x I_total.
- Paper runtime: t = C_battery / I_total; with Depth of Discharge: t_actual = C_battery x DoD / I_total, where DoD is typically 0.7-0.8 for LiPo.

Illustrative calculation only (not a project battery, not a measurement). Assumptions: 5,000 mAh, 7.4 V (2S) LiPo; usable DoD 0.8; 5 V regulator efficiency 85%; system load from Section 7.6.

- Battery energy: 7.4 V x 5.0 Ah = 37 Wh.
- Usable energy: 37 Wh x 0.8 = 29.6 Wh at the battery.
- At the 5 V rail after 85% conversion: 29.6 x 0.85 = 25.2 Wh deliverable.
- Runtime at 3.5 W (typical): 25.2 / 3.5 = 7.2 h.
- Runtime at 5.1 W (heavy): 25.2 / 5.1 = 4.9 h.
- Runtime at 6.4 W (stress): 25.2 / 6.4 = 3.9 h.

Alternative illustrative example: a 10,000 mAh USB power bank at 5 V (50 Wh nameplate, assume 85% conversion = 42.5 Wh; no DoD derate needed for a power bank since it is rated as output energy-ish; keep 100% usable for the example): at 3.5 W -> 12.1 h; at 6.4 W -> 6.6 h.

Classification: Estimated (illustrative examples; the AERIS prototype battery is unspecified; real runtime depends on actual cells, regulator efficiency, temperature, and duty cycle).

### 7.8 Power measurement checklist for the real build

1. Meter 5 V input at the USB-C (or GPIO) rail with a USB power meter or INA226.
2. Log idle, boot, polling, TX-burst, and stress states.
3. Measure 3.3 V rail current to the MLX90640 and Ra-02 separately with shunt meters.
4. Integrate energy over one hour for an "energy per hour" figure (Wh).
5. Repeat at 0 deg C and 50 deg C (operating range) if field deployment is expected.

## 8. Additional Possible Measurement Parameters

Only parameters relevant to the actual AERIS system are listed. Required parameters from Sections 3-7 are not repeated here. Parameters marked GPS require a GPS module that does not currently exist; they are listed because the map/browser path and the paper make them relevant to the project.

| # | Parameter | Description | Unit | Relevance to AERIS | Suggested measurement method |
|---|---|---|---|---|---|
| A1 | CPU utilization | Percentage of CPU time used by all tasks | % | Detects overload before latency suffers | `top`/`mpstat`/`psutil`; log per polling loop iteration |
| A2 | RAM utilization | Percentage of memory in use | % | Website build + FastAPI + browser clients share RAM | `free -m`, `psutil.virtual_memory()`; log peak |
| A3 | CPU temperature | SoC junction temperature | deg C | Pi 4 throttles when hot; affects sustained load | `vcgencmd measure_temp`; log vs. throttle events |
| A4 | System boot time | Power-on to dashboard-ready | s | Field readiness; paper emphasizes rapid deployment | `systemd-analyze`; timestamp first HTTP 200 on `/api/status` |
| A5 | Thermal camera frame rate | Effective capture rate of MLX90640 | FPS | Caps detection throughput | Instrument `read_frame()` rate; compare to configured 4 Hz |
| A6 | Thermal sensor accuracy | Error vs. reference thermometer | deg C | Detection threshold validity | Co-located reference source (blackbody/known target); log delta |
| A7 | Sensor response time | Step-change time to 90% of final value | ms | Confirms a person entering FOV is seen promptly | Move target into FOV; timestamp frame delta |
| A8 | GPS fix acquisition time | Cold/warm/hot start time to 3D fix | s | Deployment latency; paper requires "precise GPS lock" before GUIDED mode | With a GPS module: log time-to-first-fix per mode |
| A9 | GPS signal quality | C/N0 (carrier-to-noise) or hAcc | dB-Hz / m | Predicts fix stability in obstructed disaster zones | u-blox NAV-CNO or NMEA C/N0; log distribution |
| A10 | Network availability | Fraction of time dashboard/AP is reachable | % | Core ground-station requirement | Ping/HTTP probe from client laptop each minute; log success rate |
| A11 | System uptime | Time since boot without crash | h / days | Mission reliability | `uptime -p`; systemd watchdog logs |
| A12 | Battery voltage stability | Rail sag under load | V | Prevents brownouts (paper: UBEC 5 V/5 A rail must hold) | Log 5 V rail via INA226 during TX bursts and NPU-class load |
| A13 | Energy consumption per hour | Integrated Wh per operating hour | Wh | Sizing battery for mission duration | Meter input energy over 1 h; report Wh/h per scenario |
| A14 | Communication reliability (long-term) | Delivery success over 24 h soak | % | Mission-grade link assurance | 24 h soak; count success/failure; PDR per hour |
| A15 | End-to-end data latency (full stack) | Sensor capture -> LoRa TX -> receiver display | ms | The true operator-facing delay | Fuse A6 capture timestamp with receiver display timestamp; synchronized clocks |
| A16 | I2C bus error count | NACKs/retries on the sensor bus | count/hour | Early fault detection for the only sensor path | Count driver exceptions/NACKs in `read_frame()` |
| A17 | WebSocket client count / broadcast latency | Dashboard fan-out health | count, ms | Operator experience; matters when many clients join | Log subscriber queue depth and enqueue-to-send time |
| A18 | Detection threshold margin (hot-pixel delta) | Avg hot-pixel temperature minus threshold | deg C | Tuning guide for false alarm rate | Log `threshold_c` and hot pixel margins from `analyze_frame` |
| A19 | Regulatory duty-cycle utilization | Fraction of allowed TX airtime used | % | 433 MHz ISM legality | Compute air time / hour from Sections 4.9 and 4.6; compare to local limit |
| A20 | SD card write endurance pressure | MB written per day | MB/day | `thermal_readings` logs every poll (1983+ rows in 14 min); card wear | `iostat -x` cumulative writes; rotate database |

## 9. Summary of Identified Parameters

Counts: 7 video + 8 LoRa + 7 telemetry + 9 AI + 5 power-domain entries + 20 additional = 56 parameter entries. Required parameters from the brief: all present.

| Section | # | Parameter | Unit | Classification (best available) |
|---|---|---|---|---|
| 3.1 | 1 | Video latency | ms | Proposed; paper target Estimated |
| 3.2 | 2 | Video frame rate | FPS | Estimated / Configured |
| 3.3 | 3 | Video resolution | pixels | Estimated (paper) / Configured (thermal) |
| 3.4 | 4 | Video transmission stability | qualitative | Proposed |
| 3.5 | 5 | Video processing delay | ms | Proposed |
| 3.6 | 6 | Frame drop rate | % | Proposed |
| 3.7 | 7 | Video bandwidth consumption | Mbps | Estimated (paper) / Calculated (thermal) |
| 4.1 | 8 | RSSI | dBm | Proposed / Estimated (module) |
| 4.2 | 9 | SNR | dB | Proposed / Estimated (module) |
| 4.3 | 10 | PLR | % | Proposed / Estimated (paper) |
| 4.4 | 11 | PDR | % | Proposed / Estimated (paper) |
| 4.5 | 12 | Communication range | m/km | Proposed / Estimated |
| 4.6 | 13 | Packet transmission interval | s | Configured |
| 4.7 | 14 | Packet reception latency | ms | Proposed / Estimated (paper) / Calculated |
| 4.8 | 15 | LoRa TX/RX power | W/mA | Calculated |
| 5.1 | 16 | Telemetry latency | ms | Proposed / Estimated / Calculated |
| 5.2 | 17 | GPS update rate | Hz | Not available |
| 5.3 | 18 | GPS position accuracy | m | Not available |
| 5.4 | 19 | Telemetry update frequency | Hz | Configured |
| 5.5 | 20 | Telemetry packet loss | % | Proposed / Estimated (paper) |
| 5.6 | 21 | Sensor data acquisition time | ms | Estimated / Proposed |
| 5.7 | 22 | Telemetry communication reliability | %/MTBF | Proposed |
| 6.3 | 23 | AI accuracy | % | Proposed |
| 6.4 | 24 | AI precision | % | Proposed |
| 6.5 | 25 | AI recall | % | Proposed |
| 6.6 | 26 | AI F1-score | % | Proposed |
| 6.7 | 27 | AI inference time | ms | Proposed / Estimated |
| 6.8 | 28 | Detection confidence | 0-1 | Configured (uncalibrated) / calibration Proposed |
| 6.9 | 29 | False positive rate | % | Proposed |
| 6.10 | 30 | False negative rate | % | Proposed |
| 6.11 | 31 | AI processing FPS | FPS | Configured / Estimated |
| 7.1 | 32 | Pi 4B power (idle/load) | W | Estimated (literature) |
| 7.2 | 33 | MLX90640 power | W | Calculated |
| 7.3 | 34 | LoRa Ra-02 power (TX/RX/standby) | W | Calculated |
| 7.4 | 35 | GPS power | W | Not applicable |
| 7.6 | 36 | Total system power | W | Estimated |
| 7.7 | 37 | Battery runtime | h | Estimated (illustrative; no battery spec exists) |
| A1-A20 | 38-57 | Additional parameters (CPU, RAM, temperature, boot, duty cycle, etc.) | various | Proposed |

Verdict on measurability today: zero of the RF/latency/AI-accuracy/power parameters have been measured on the AERIS prototype; the only Measured-class artifact is the failure log in `data/aeris.db` (which itself is a finding: no hardware was ever attached in this environment).

## 10. References

Project sources (inspected):

1. AERIS project repository root README — system architecture, hardware notes, test-status table ("MLX90640 / LoRa 02 / offline reboot-auto-start on RPi | NOT TESTED"; "Recorded measurements ... NOT TESTED"). `/home/blezlyy/Documents/projects/aeris-project/README.md`
2. `AERIS PAPER v3.docx` — research paper containing the Statement of the Problem (SOP), System Validation Framework, target engineering specifications, detection/communication/power performance formulas, and research methodology. `/home/blezlyy/Documents/projects/aeris-project/AERIS PAPER v3.docx`
3. `app/config.py` — AERIS_MLX90640_REFRESH_HZ=4, I2C bus 1 address 0x33; LORA 433.0 MHz, SF7, BW 125000 Hz, CR 4/5, 17 dBm, 2.0 s TX interval, ACK disabled, retries 2; THERMAL_PRESENCE_DELTA_C 4.0; THERMAL_PRESENCE_MIN_PIXELS 6; THERMAL_MIN/MAX_VALID_C -40/300.
4. `app/sensors/mlx90640.py`, `app/sensors/thermal_processing.py` — frame read path, 400 kHz I2C, adaptive threshold heuristic, 0.25-2.0 s clamp on poll interval.
5. `app/ai/human_detection.py` — thermal presence wrapper (not human identification).
6. `app/communication/lora_transmitter.py`, `app/communication/lora_receiver.py` — register-level SX127x SPI driver; DIO0 TX-done confirmation; receiver placeholder; no RSSI/SNR readout implemented.
7. `app/services/data_manager.py` — polling loop, Wi-Fi probing, LoRa packet builder (`_build_lora_payload`), 2.0 s LoRa scheduling.
8. `app/storage/database.py` and `data/aeris.db` — schemas and recorded rows; all 1,995 thermal rows disconnected; all 369+ LoRa rows `ok = 0` with `spidev` import errors; 2026-11-15 16:13-16:27 UTC.
9. `website/src/components/CommLinkHealth.tsx`, `website/src/pages/SettingsPage.tsx`, `website/src/types/index.ts`, `website/src/stores/appStore.ts`, `website/src/components/LiveFeed.tsx` — dashboard LoRa/Wi-Fi/latency/RSSI/PLR/battery fields, all sourced from backend state with explicit null/unavailable fallbacks (no fabricated values).
10. `website/src/hooks/useWebSocket.ts`, `website/src/hooks/useTelemetrySimulation.ts` (disabled), `website/src/components/MissionMap.tsx`, `website/src/pages/MapPage.tsx` — WebSocket-driven dashboard; browser geolocation map; no on-device GPS.

External sources (inspected):

11. Raspberry Pi Ltd, Raspberry Pi 4 Model B product page — BCM2711, Cortex-A72, RAM options, 802.11ac, Gigabit Ethernet, 5 V/3 A USB-C, 0-50 deg C, H.265/H.264 codec support, 40-pin GPIO, MIPI CSI. https://www.raspberrypi.com/products/raspberry-pi-4-model-b
12. pidramble — "Power Consumption Benchmarks", Pi 4B: idle 540 mA (2.7 W), web load 1010 mA (5.1 W), 4-core load 1280 mA (6.4 W). https://pidramble.com/wiki/benchmarks/power-consumption
13. raspberry.tips — "Raspberry Pi Power Consumption 2026 ... Pi 4 (4GB): ~2.9 W idle, ~6-8 W load; 5 V/3 A (15 W) supply". https://raspberry.tips/en/raspberrypi-tutorials/raspberry-pi-power-consumption-update-2026-all-models-compared
14. raspi.tv — "How much power does the Pi4B use?", 575 mA (2.85 W) idle. https://raspi.tv/2019/how-much-power-does-the-pi4b-use-power-measurements
15. picockpit — "How much does power usage cost for the Pi 4", 2.93 W idle, 4.51 W LXDE load. https://picockpit.com/raspberry-pi/how-much-does-power-usage-cost-for-the-pi-4
16. Adafruit Industries, MLX90640 IR Thermal Camera learn guide (PDF) — -40 to 300 deg C, +/- 2 deg C (0-100 deg C range), ~16 Hz practical max frame rate, 0x33 address, I2C. https://cdn-learn.adafruit.com/downloads/pdf/adafruit-mlx90640-ir-thermal-camera.pdf
17. Waveshare, MLX90640-D55 Thermal Camera wiki — 32 x 24, -40 to 300 deg C, 0.5-64 Hz refresh, NETD 0.1 K @ 1 Hz, < 23 mA, 3.3/5 V, 0x33, I2C 1 MHz. https://www.waveshare.com/wiki/MLX90640-D55_Thermal_Camera
18. Ultra Librarian, "Thermal Sensor Array Parameters and the MLX90640 Datasheet" — accuracy +/- 1.5 deg C, supply 3.3 V (5 V abs max), current < 23 mA, I2C 0.4 MHz (1 MHz enhanced), NETD 0.1 K @ 1 Hz, -40 to 85 deg C ambient, -40 to 300 deg C target. https://www.ultralibrarian.com/2021/01/12/thermal-sensor-array-parameters-and-the-mlx90640-datasheet-ulc
19. Seengreat, MLX90640-D55 wiki — accuracy +/- 2 deg C, refresh rates 0.5-64 Hz, I2C up to 1 MHz, address 0x33. https://seengreat.com/wiki/88/thermal-camera-mlx90640-d55
20. JLCPCB part detail, Ai-Thinker Ra-02 (C90039) — SX1278-based, 410-525 MHz, 2.5-3.7 V, TX 18 dBm max, sensitivity -141 dBm, TX current 93/97 mA, RX 12.15 mA, SPI. https://jlcpcb.com/partdetail/aithinker-Ra02/C90039
21. LCSC product page, Ra-02 — same electrical ratings as [20]. https://www.lcsc.com/product-detail/Wireless-Modules_SX1278LoRaWireless-Modules-Long10KM-433_C90039.html
22. DigiKey-hosted Ai-Thinker Ra-02 LoRa Product Specification V1.1 (2017) — frequency 410-525 MHz, 18 +/- 1 dBm max TX power, 2.5-3.7 V (3.3 typ), TX 93 mA / RX 12.15 mA / standby 1.6 mA @ 433 MHz; sensitivity SF7 -125 dBm, SF10 -134 dBm, SF12 -141 dBm; SPI, up to 256-byte packets with CRC; IPEX antenna; -30 to +85 deg C. https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/8827/RA-02.pdf
23. Semtech Corporation, SX1276 product page — SX1276/77/78/79 LoRa transceivers; 168 dB link budget, +20 dBm PA, -148 dBm sensitivity class, 137-1020 MHz; official datasheet "SX1276-7-8-9 Datasheet (2020-05-26)" listed on the page. https://www.semtech.com/products/wireless-rf/lora-transceivers/sx1276
24. Semtech SX1276/77/78/79 datasheet Rev. 4 (March 2015), section 5.5.5 LoRa RSSI formula — RSSI = -157 + Rssi (HF port), RSSI = -164 + Rssi (LF port); packet strength with PacketSnr x 0.25 for SNR < 0; mirror copy: https://datasheet4u.com/datasheet-pdf/SemtechCorporation/SX1276/pdf.php?id=923296
25. Melexis, MLX90640 32x24 IR array datasheet, Revision 12 (December 3, 2019) — 32 x 24, I2C, 0.5-64 Hz, NETD 0.1 K @ 1 Hz, < 23 mA, 3.3 V, -40 to +85 deg C ambient, -40 to +300 deg C target, zone-based frame accuracy (+/- 1 to +/- 5 deg C by zone/device), startup time refresh-rate dependent. https://www.melexis.com/-/media/files/documents/datasheets/mlx90640-datasheet-melexis.pdf
26. Evelta, MLX90640 110 deg FOV breakout user manual — typical object accuracy +/- 1 deg C, -40 to 300 deg C range. https://evelta.com/content/datasheets/011-MLX90640-Breakout-User-Manual.pdf
