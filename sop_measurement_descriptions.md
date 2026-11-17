# AERIS SOP Measurement Descriptions

Simple-English descriptions of the measurement parameters and technical indicators explicitly mentioned in the AERIS SOP-related documents, with notes on how each can be obtained or evaluated.

## 1. Introduction

This document describes the measurement parameters found in the SOP-related parts of the AERIS project documentation. It does not repeat the full technical research report, and it does not add new required measurements. Its purpose is narrow:

- State each measurement that the SOP material explicitly mentions.
- Describe what the measurement is, in simple English.
- Explain what the measurement represents, its unit, the component or subsystem it belongs to, why it matters, and how it can be obtained or evaluated.

Measurements useful for the AERIS evaluation that are not explicitly mentioned in the SOP material are listed separately in Section 10, "Additional Suggested Measurements".

## 2. Documents Inspected and Where "SOP" Appears

The project contains no standalone SOP files. The only SOP content in the project is inside the research paper:

- `AERIS PAPER v3.docx` (project root), inspected in full by extracting its text.

The paper uses "SOP" in two different senses:

1. Statement of the Problem (SOP 1 to SOP 5) - the study's research questions, found in Chapter 1 ("Statement of the Problem") and mapped to success criteria in Chapter 3 ("System Validation Framework", "Objective-to-Validation Matrix").
2. Standard Operating Procedure - one occurrence only, "Pre-Deployment Verification and Mission Handshake SOP" in the Phase II simulation section. It describes the pre-flight handshake (1 Hz MAVLink heartbeat, GPS lock check, battery-threshold check before GUIDED mode). It contains no new measurement parameters beyond the validation criteria already listed in Section 8 below.

No other file in the project (source code, README, configs, website, scripts, logs, archives, backups) contains SOP text or SOP-required measurement lists. The codebase itself references dashboard fields such as latency, RSSI, and PLR (for example `website/src/pages/SettingsPage.tsx` and `website/src/types/index.ts`), but those are implementation artifacts, not SOP requirements.

Important context for readers:

- The paper's SOPs target a specific architecture: Raspberry Pi 5 + Hailo-8L NPU, YOLOv8, FLIR Lepton 3.5, Alfa AWUS036ACM 5 GHz Wi-Fi video downlink, Ebyte E220/E32 LoRa at 915/923 MHz, MAVLink telemetry, ArduPilot SITL simulation.
- The current codebase implements a different, smaller build: Raspberry Pi 4 Model B, MLX90640 thermal camera, LoRa Ra-02 (SX1278, 433 MHz), heuristic thermal presence detection, local Wi-Fi dashboard.
- Where this document quotes the paper's thresholds, they are the paper's stated targets, not measured results, and not necessarily achievable with the current build. See Section 11.

## 3. Explicit Measurements in the SOP Statements (Chapter 1)

The Statement of the Problem lists these measurable indicators explicitly:

- SOP 1: no single numeric measurement; it asks how to design the architecture. Its quantitative success criteria live in the validation matrix (Section 8).
- SOP 2: end-to-end transmission latency (ms), Packet Loss Ratio (%), Received Signal Strength Indicator (RSSI in dBm) across varying distances and altitudes.
- SOP 3: detection accuracy (%), precision and recall, detection latency (seconds), false positive rate (%). Also, the prototype must be compliant with Size, Weight, and Power (SWaP) constraints (a payload-capacity, not a performance, indicator).
- SOP 4: power consumption and operational endurance of the integrated system, considering all onboard components under real operating conditions.
- SOP 5: effectiveness under Non-Line-of-Sight (NLOS) conditions, obstructed environments (debris, vegetation), and environmental stress factors. No numeric threshold is stated inside the SOP 5 text itself; the validation matrix assigns it the RSSI fade-margin criterion (Section 8).

Each explicit measurement is described in Sections 4 to 7.

## 4. SOP 2 Measurements: Communication Performance

### 4.1 End-to-End Transmission Latency

1. Original measurement name: End-to-end transmission latency (ms); in the paper's target specifications also "Max End-to-End Latency" (split by link); also written "telemetry latency" and "video latency".
2. Simple English description: The total time a piece of data needs to travel from the transmitter to the receiver, from the moment the data is created until it is usable at the destination.
3. What it represents: The freshness of information. It combines processing delay, queueing/buffering delay, transmission (air) time, and propagation delay. The paper defines it as t_total = t_proc + t_queue + t_tx + t_prop (validation framework) and as t_total = t_acq + t_proc + t_queue + t_tx (data pipeline section).
4. Unit: milliseconds (ms).
5. Component or subsystem: Both links. Sub-GHz LoRa telemetry link (915/923 MHz in the paper; 433 MHz Ra-02 in the current build) and the 5 GHz Wi-Fi video downlink; also the onboard processing pipeline (sensor acquisition, inference, serialization).
6. Why it is important: Rescue operators act on the data they receive. High latency means stale survivor positions and poor situational awareness; for the video link it can cause operator disorientation and pilot-induced oscillation. The paper caps the LoRa link at < 131 ms and the video link at <= 105 ms.
7. How it can be obtained or evaluated: The paper uses a custom Python latency logger built on time.perf_counter() embedded in the airborne control loop, plus automatic GCS-side logging of "calculated end-to-end latency (ping)". Practical methods: (a) sender embeds a timestamp in each packet (the current code already sets `ts` in each LoRa payload); the receiver subtracts it from arrival time - requires synchronized clocks (NTP/PTP) or symmetric-path round-trip/2; (b) per-stage instrumentation of capture, inference, encode, TX, decode; (c) SITL simulation timing before flight tests. Report min/avg/p95/p99/max across distance and altitude cells (10-200 m; 10/30/50 m).

### 4.2 Packet Loss Ratio (PLR)

1. Original measurement name: Packet Loss Ratio (%); also "Packet Loss Percentage (%)", "packet loss ratios (%)".
2. Simple English description: The share of transmitted packets that never arrive at the receiver.
3. What it represents: Link reliability. The paper defines it as PLR = (total packets sent - total packets received) / total packets sent x 100, also written PLR = N_lost / N_sent. SOP 2 asks "To what extent can the proposed system maintain communication performance in terms of ... Packet Loss Ratio (%) ...".
4. Unit: percent (%).
5. Component or subsystem: Principally the 915/923 MHz LoRa telemetry link (and any packet-based link). The 5 GHz video downlink is explicitly excluded from PLR evaluation in the paper, because UDP intentionally drops late frames.
6. Why it is important: Survivor coordinates and detection alerts ride on this link. The paper's acceptance threshold is PLR <= 2.5% at the maximum 200 m radial edge (which yields >= 97.5% PDR).
7. How it can be obtained or evaluated: Number every transmitted packet (the current LoRa code already assigns an incrementing `seq` and logs every attempt in the `lora_transmissions` SQLite table). A receiver counts unique received sequence numbers. PLR = (sent - received) / sent x 100. Recompute for each distance/altitude test cell; export to CSV for analysis. The paper also cross-checks airborne microSD sent-side logs against ground-station SQLite received-side logs after each flight.

### 4.3 Received Signal Strength Indicator (RSSI)

1. Original measurement name: Received Signal Strength Indicator (RSSI in dBm); also "RSSI degradation", "RSSI degradation curves".
2. Simple English description: The received power of the radio signal, as read by the receiver's radio chip.
3. What it represents: Signal strength and link margin. It tells how far above (or below) the receiver's sensitivity floor the link is operating, and how the link degrades with distance and altitude. The paper pairs it with the fade margin concept (>= 10 dB above sensitivity floor) and with the Log-Distance Path Loss Model: RSSI = A - 10n log10(d) + X_sigma.
4. Unit: decibel-milliwatts (dBm); negative values, e.g., -50 dBm strong, -95 dBm weak.
5. Component or subsystem: Both RF links (LoRa telemetry and 5 GHz video downlink); measured at the receiver radio. For the LoRa side, the SX1278 (Ra-02) exposes REG_PKT_RSSI_VALUE (0x1A); the current placeholder receiver in `app/communication/lora_receiver.py` does not yet read it.
6. Why it is important: RSSI is the paper's primary indicator of whether the architecture holds up as range and altitude increase. It feeds the link-budget validation (fade margin >= 10 dB) and antenna/polarization design checks.
7. How it can be obtained or evaluated: On a compatible receiver, read the packet RSSI register after each packet and convert with the Semtech formula: RSSI = -164 + Rssi (low-frequency 137-525 MHz port, e.g., 433 MHz) or RSSI = -157 + Rssi (high-frequency 779-1020 MHz port, e.g., 915 MHz). Log per packet vs. distance/altitude; plot degradation curves; compare against the paper's targets (-40 to -50 dBm near-field at 10 m; not worse than -95 dBm at 200 m for LoRa; not worse than -80 dBm at 200 m for 5 GHz). SITL/MATLAB modeling (Friis + log-distance path loss) can project the same curves before field tests.

## 5. SOP 3 Measurements: Detection Performance

SOP 3 asks for a functional prototype compliant with SWaP constraints; the measurable detection indicators listed under it are described below. (The prototype's hardware/SWaP indicators - weight, 5 V/5 A rail, buses - are listed in Section 8.)

### 5.1 Detection Accuracy

1. Original measurement name: Detection accuracy (%).
2. Simple English description: How often the detection system is correct overall, counting both correct detections and correct non-detections.
3. What it represents: Overall correctness of the survivor-detection decision against ground truth.
4. Unit: percent (%).
5. Component or subsystem: The Edge AI detection subsystem (in the paper: YOLOv8 on Hailo-8L with RGB + FLIR Lepton 3.5 late fusion; in the current code: the MLX90640 thermal-presence heuristic).
6. Why it is important: A SAR system that cries "survivor" everywhere, or never, is useless. Accuracy is the paper's headline detection figure, though it must be read with precision, recall, and FPR because class imbalance (few actual survivors) can hide poor detection behind high true-negative counts.
7. How it can be obtained or evaluated: Confusion matrix on labeled test data: Accuracy = (TP + TN) / (TP + TN + FP + FN), where TP/TN/FP/FN are true/false positives/negatives. The paper requires calculating it from flight-test frames with posture-varied human subjects (standing, prone) in the test perimeter. No such labeled data exists yet in this project, so no accuracy figure can be reported.

### 5.2 Precision

1. Original measurement name: Precision (listed in the SOP as "Precision and recall"; the paper defines Precision = TP / (TP + FP)).
2. Simple English description: Out of all alerts the system raises, how many are real survivors.
3. What it represents: Alert correctness. It measures how trustworthy each alarm is.
4. Unit: percent (%) or fraction 0-1.
5. Component or subsystem: Edge AI detection subsystem (see 5.1).
6. Why it is important: Every false alarm consumes scarce rescue resources (teams, drone range, attention). High precision means the ground team can act on each alert.
7. How it can be obtained or evaluated: From the same labeled confusion matrix: Precision = TP / (TP + FP). Report per test cell (distance, altitude, posture, thermal/visual condition). The paper lists precision alongside recall and later fuses them into the F1-score (F1 = 2 * P * R / (P + R); F1-score is defined in the paper but is not separately listed in the SOP text - see Section 9).

### 5.3 Recall

1. Original measurement name: Recall (listed in the SOP as "Precision and recall"; the paper defines Recall = TP / (TP + FN)).
2. Simple English description: Out of all real survivors, how many the system finds.
3. What it represents: Detection completeness. It measures how few survivors are missed.
4. Unit: percent (%) or fraction 0-1.
5. Component or subsystem: Edge AI detection subsystem (see 5.1).
6. Why it is important: A missed survivor may never be found - this is the safety-critical failure mode in search and rescue, and the figure most directly tied to the "Golden Hour" motivation in the paper's introduction.
7. How it can be obtained or evaluated: From the same labeled confusion matrix: Recall = TP / (TP + FN). The paper's multi-modal (RGB + thermal) design is intended precisely to keep recall high in low-visibility or obstructed scenes.

### 5.4 Detection Latency

1. Original measurement name: Detection latency (seconds); also written as detection time t_detect = t_output - t_input.
2. Simple English description: The time from capturing a frame to producing the detection result (target flag, coordinates, confidence).
3. What it represents: How fast the AI pipeline turns sensor data into a decision.
4. Unit: seconds (as written in the SOP); the paper's formulas also allow milliseconds. Note the unit discrepancy: the SOP text says "Detection latency (seconds)" while the rest of the paper measures system timing in milliseconds.
5. Component or subsystem: Edge AI processing chain - capture, pre-processing/tensor conversion, inference (YOLOv8 on Hailo-8L in the paper; `analyze_frame` heuristic in the current code), alert generation, serialization.
6. Why it is important: Survivor alerts expire with the mission timeline. Latency above the paper's per-stage budget feeds directly into end-to-end transmission latency and reduces the value of the alert.
7. How it can be obtained or evaluated: Instrument the pipeline with high-resolution timers (the paper's latency logger uses time.perf_counter()). t_detect = t_output - t_input, where t_input is the frame capture time and t_output is the time the detection result is ready. The paper also constrains it with t_detect <= t_max. No detection latency has been measured in this project.

### 5.5 False Positive Rate

1. Original measurement name: False positive rate (%); also "False Positive Rate (FPR)"; formula: FPR = FP / (FP + TN).
2. Simple English description: How often the system flags a non-survivor as a survivor.
3. What it represents: The rate of false alarms among all true non-targets.
4. Unit: percent (%).
5. Component or subsystem: Edge AI detection subsystem (see 5.1).
6. Why it is important: False positives saturate the human-in-the-loop workflow, send rescue teams to empty rubble, and erode operator trust. The paper treats FPR as a robustness indicator of the detection subsystem.
7. How it can be obtained or evaluated: From the same labeled confusion matrix: FPR = FP / (FP + TN). Report per test cell and per confidence threshold tau (the paper filters detections with P(y_i) >= tau to suppress false alarms; FPR should be quoted at the deployed tau).

## 6. SOP 4 Measurements: Power Consumption and Operational Endurance

### 6.1 Power Consumption and Operational Endurance

1. Original measurement name: "Power consumption and operational endurance of the integrated system, considering all onboard components under real operating conditions" (SOP 4). Related paper formulas: P_total = V x I_total; t = C_battery / I_total; t_actual = C_battery x DoD / I_total (DoD 0.7-0.8 for LiPo). Related SOP-3/validation criterion: "Power Stability: UBEC maintains a continuous 5 V/5 A rail without brownouts during maximum RF transmission and NPU load."
2. Simple English description: How much electrical power the whole system draws, and how long it can run on its battery.
3. What it represents: The energy budget of the airborne (and ground) nodes: whether the battery can sustain the propulsion plus avionics/AI load, and whether the 5 V rail holds steady during peak draws.
4. Unit: watts (W) for power; amperes (A) for current; volts (V) for voltage; hours (h) or minutes for endurance; milliamp-hours (mAh) or amp-hours (Ah) for battery capacity.
5. Component or subsystem: Everything electrical on the UAV/ground node - in the paper: Raspberry Pi 5, Hailo-8L NPU, cameras, LoRa module (E220/E32), Wi-Fi adapter (Alfa AWUS036ACM), UBEC, propulsion; in the current build: Raspberry Pi 4 Model B, MLX90640, LoRa Ra-02, on-board Wi-Fi/SD. The paper also expresses weight compatibility as W_total = sum(W_i) <= W_max (SWaP), and current compatibility as I_total = sum(I_i) with P_total = V x I_total.
6. Why it is important: A SAR drone that browns out or dies mid-mission loses the aircraft, the payload, and the data. Endurance defines the operational radius and mission duration; stable voltage keeps the companion computer out of reset during transmit bursts.
7. How it can be obtained or evaluated: (a) Bench measurement: power meter (e.g., USB-C inline meter at the 5 V input, or INA219/INA226 shunt meters on the 3.3 V sensor rail and on servo/BEC outputs); log idle, boot, polling, TX burst, full load; integrate for Wh per hour. (b) Calculation (paper method): P_total = V x I_total summed over components; endurance t = C_battery / I_total, derated by DoD for LiPo: t_actual = C_battery x DoD / I_total; verify P_supply >= P_total. (c) Flight-representative soak test with UBEC telemetry logging rail voltage; confirm no sag below the 5 V requirement during max RF/NPU load. No power measurement has been performed in this project; no battery specification exists in this project, so endurance cannot be computed without adding assumptions.

## 7. SOP 5 Measurements: Effectiveness in Simulated Disaster Environments

SOP 5 asks: "How effective is the system when deployed under simulated disaster environments, including NLOS conditions, obstructed environments (debris, vegetation), environmental stress factors?" The numeric indicator the validation matrix assigns to SOP 5 is:

### 7.1 RSSI Fade Margin (both frequency bands)

1. Original measurement name: RSSI fade margin >= 10 dB above absolute receiver sensitivity floors across all tested altitudes and distances (validation matrix, SOP 5 row); also phrased in the target specifications as "at least 10 dB above the baseline sensitivity floor" and "acceptable RSSI range -45 dBm to -95 dBm (>= 10 dB fade margin)" for 915 MHz and "-45 dBm to -80 dBm (>= 10 dB fade margin)" for 5 GHz.
2. Simple English description: The safety gap between the actual signal strength and the weakest signal the receiver can decode, kept at 10 dB or more.
3. What it represents: Link robustness under real environmental loss - multipath, obstruction, NLOS, rain fade, vegetation. It is the same RSSI quantity as in Section 4.3, expressed as margin rather than absolute power.
4. Unit: decibels (dB).
5. Component or subsystem: Both RF links (915/923 MHz LoRa telemetry; 5 GHz video downlink) under environmental stress testing.
6. Why it is important: Fade margin is the difference between "works in the lab" and "works over concrete rubble in the rain". The paper forbids testing in rain/dense fog/humidity and above-15 km/h wind precisely so that observed fades reflect environment, not weather noise; the 10 dB margin absorbs real-world losses.
7. How it can be obtained or evaluated: Field test in a controlled open field (paper protocol, Stages A-E): pre-programmed waypoint flights at radial distances 10/50/100/150/200 m and altitudes 10/30/50 m; log RSSI per packet; compute margin = RSSI - sensitivity floor (e.g., -141 dBm at SF12 for Ra-02-class modules, or -125 dBm at SF7); margin >= 10 dB passes. NLOS/vegetation/debris conditions are tested as separate test cells; failure cells identify the point of architectural breakdown for Results and Discussion.

Note: SOP 5 itself (the question text) contains no numbers. The fade-margin criterion comes from the validation matrix's SOP 5 row and the target engineering specifications; it is listed here and in Section 8 because the matrix explicitly maps it to SOP 5.

## 8. Quantitative Criteria in the SOP Validation Matrix (Chapter 3)

The "System Validation Framework" maps each SOP to methodological phases and quantitative success thresholds. These items are part of the SOP framework, not new measurements; they are listed here because evaluators will encounter them alongside the SOP text.

| SOP | Validation phase | Criterion (as written) | Unit/Threshold | Component |
|---|---|---|---|---|
| SOP 1 | Phase I: Network Architecture and Mathematical Modeling | Air-gapped verification: zero reliance on cellular/cloud infrastructure | Pass/fail audit | Whole system architecture |
| SOP 1 | Phase I | Link budget validation: minimum fade margin >= 10 dB for both frequencies | dB | Both RF links |
| SOP 1 | Phase I | Signal segregation: physical decoupling of UDP video (5 GHz) and MAVLink telemetry (915/923 MHz) | Pass/fail inspection | RF design |
| SOP 2 | Phase II: System Simulation and Validation | Telemetry & Handshake Integrity: SITL logs demonstrate zero serial buffer overflows at the 921,600 baud rate while maintaining a persistent 1 Hz MAVLink heartbeat exchange | pass/fail; baud rate; 1 Hz | Flight controller UART / MAVLink path |
| SOP 2 | Phase II | Network Reliability Projection: MATLAB/Simulink confirms the architecture maintains the target 97.5% Packet Delivery Ratio (PDR) across all simulated radial distances | % (>= 97.5%) | LoRa link |
| SOP 2 | Phase II | Video Pipeline Stability: simulated GStreamer routing successfully compresses the raw visual feed into a stable 5-6 Mbps UDP pipeline without inducing cumulative latency | Mbps (5-6), pass/fail | 5 GHz video downlink |
| SOP 2 | Phase II | Mission Authorization: automated pre-flight audit successfully parses GLOBAL_POSITION_INT packets and validates GPS/battery synchronization before permitting autonomous GUIDED mode | pass/fail | Pre-deployment SOP (handshake) |
| SOP 3 | Phase III: Hardware Integration and Embedded System Prototyping | Power Stability: UBEC maintains a continuous 5 V/5 A rail without brownouts during maximum RF transmission and NPU load | V / A (5 V / 5 A), pass/fail | Power subsystem (UBEC) |
| SOP 3 | Phase III | Interface Functionality: I2C, SPI, MIPI CSI-2, and UART buses establish localized handshakes without bottlenecking the data transmission pipeline | pass/fail per bus | Sensor/NPU/radio interfaces |
| SOP 3 | Phase III | Payload Capacity: total structural weight remains below the UAV's maximum lift limit | kg / pass-fail (W_total <= W_max) | Airframe / SWaP |
| SOP 4 | Phase IV: Experimental Deployment and Field Testing | Video latency: the 5 GHz surveillance downlink maintains end-to-end streaming latency <= 105 ms | ms (<= 105) | 5 GHz video downlink |
| SOP 4 | Phase IV | Telemetry latency: the 915 MHz LoRa link maintains end-to-end transmission latency <= 131 ms, accounting for CSS time-on-air | ms (<= 131) | LoRa telemetry link |
| SOP 4 | Phase IV | Telemetry reliability: the 915 MHz LoRa MAVLink routing maintains a strict Packet Loss Ratio (PLR) <= 2.5% at the maximum 200 m radial edge | % (<= 2.5) | LoRa telemetry link |
| SOP 5 | Field testing / environmental evaluation (the matrix row carries no explicit phase label in the visible text) | RSSI fade margin >= 10 dB above absolute receiver sensitivity floors across all tested altitudes and distances | dB (>= 10) | Both RF links |

Also defined in the supporting "Communication Performance" and "Detection Performance", "Power Performance" sections of the same chapter (definitions the SOP criteria rely on, not separate measurements):

- Signal-to-Noise Ratio (SNR): SNR = P_signal / P_noise; monitored as signal quality; must be sufficient for reliable decode. Unit: dB (ratio).
- Packet Delivery Ratio (PDR): PDR = N_received / N_sent. Unit: ratio (paper uses it as >= 97.5%).
- Packet Loss Ratio (PLR): PLR = N_lost / N_sent (field protocol: PLR = (sent - received) / sent x 100).
- Total system latency: t_total = t_proc + t_queue + t_tx + t_prop; system is real-time if t_total <= t_max.
- Detection metrics: Accuracy = (TP+TN)/(TP+TN+FP+FN); Precision = TP/(TP+FP); Recall = TP/(TP+FN); F1 = 2*P*R/(P+R); FPR = FP/(FP+TN); detection latency t_detect = t_output - t_input with t_detect <= t_max.
- Power/endurance: P_total = V x I_total; P_supply >= P_total; t = C_battery / I_total; t_actual = C_battery x DoD / I_total (DoD 0.7-0.8 LiPo).
- Video pipeline: raw ~200 Mbps compressed by hardware H.264 to 5-6 Mbps; UDP chosen to avoid head-of-line blocking; end-to-end target <= 105 ms; capture 1080p30 or 720p60.
- LoRa link: 915/923 MHz, CSS modulation, MAVLink, "transparent mode" via pyserial; UART 921,600 baud between flight controller and companion computer; 1 Hz GLOBAL_POSITION_INT heartbeat; latency cap < 131 ms; PLR <= 2.5%; RSSI targets -40/-50 dBm (near field) to not worse than -95 dBm at 200 m; fade margin >= 10 dB; maximum testing range 200 m; altitudes 10/30/50 m.

Target Engineering Specifications quoted in the paper (Chapter 1), preserved as written in the paper, including its internal inconsistencies:

| Metric | 915 MHz LoRa telemetry | 5 GHz video downlink | Envelope bounds (as written) |
|---|---|---|---|
| Max end-to-end latency | < 131 ms (target; table says <= 131 ms) | <= 105 ms | Distance 10-200 m (one paragraph says 10-500 m); altitude 10/30/50 m |
| Max Packet Loss Ratio | <= 2.5% (>= 97.5% PDR) | N/A (UDP frame skipping intentional) | Distance 10-200 m; altitude 10/30/50 m |
| Acceptable RSSI range | -45 dBm to -95 dBm (>= 10 dB fade margin) | -45 dBm to -80 dBm (>= 10 dB fade margin) | Distance 10-200 m; altitude 10/30/50 m |
| Near-field targets (10 m) | -40 to -50 dBm | -45 to -55 dBm | - |
| 200 m boundary | not worse than -95 dBm | not worse than -80 dBm | - |

Paper-internal inconsistencies the reader should notice (preserved, not corrected): an introductory paragraph quotes RSSI requirements "-85 dB or higher for video data and -80 dB or higher for telemetry", the SOP chapter table quotes -95/-80 dBm, and one scope paragraph quotes distances up to 500 m while the table and validation matrix use 200 m. The 97.5% PDR figure appears in both the hypothesis (Q4) and the statistical treatment ("reported 97.5% PDR benchmark").

## 9. Supporting Metric Definitions in the Paper (Not SOP Statements, Quoted for Context)

These formulas appear in Chapter 3 evaluation sections and are used by the SOP validation criteria to interpret the measurements above.

| Metric | Formula | Role |
|---|---|---|
| Accuracy | (TP + TN) / (TP + TN + FP + FN) | Overall detection correctness |
| Precision | TP / (TP + FP) | Alert trustworthiness |
| Recall | TP / (TP + FN) | Missed-survivor avoidance |
| F1-score | 2 * Precision * Recall / (Precision + Recall) | Balanced detection quality (defined in the paper; not itself a numbered SOP indicator) |
| False Positive Rate (FPR) | FP / (FP + TN) | Alert fatigue / robustness |
| Detection latency | t_detect = t_output - t_input; constraint t_detect <= t_max | Real-time AI responsiveness |
| PLR | N_lost / N_sent (or (sent - received)/sent x 100) | Link reliability |
| PDR | N_received / N_sent | Link reliability (>= 97.5% target) |
| SNR | P_signal / P_noise | Signal quality above fade margin |
| Total latency | t_total = t_proc + t_queue + t_tx + t_prop (framework); t_total = t_acq + t_proc + t_queue + t_tx (pipeline section) | End-to-end delay budget |
| System weight | W_total = sum(W_i) <= W_max | SWaP compliance |
| Total current | I_total = sum(I_i) | Power budget |
| Total power | P_total = V x I_total | Power demand |
| Battery runtime | t = C_battery / I_total; t_actual = C_battery x DoD / I_total | Endurance estimate |

## 10. Additional Suggested Measurements

These measurements would strengthen the AERIS evaluation but are not explicitly required by the SOP statements or the SOP validation matrix. They are listed separately on purpose.

| # | Parameter | Description | Unit | Why it helps | How to obtain |
|---|---|---|---|---|---|
| 1 | Video frame rate (FPS) | Frames rendered per second of the video downlink | FPS | Quantifies real-time quality | Decoder stats or GStreamer fpsdisplaysink; count frames/s |
| 2 | Video resolution | Pixel dimensions of transmitted frames | pixels | Context for bandwidth and detection | Frame width/height at decoder/capture |
| 3 | Frame drop rate | Share of frames lost/skipped (UDP) | % | Explains jitter without PLR of video link | Sequence-number gaps at decoder |
| 4 | Video bandwidth consumption | Actual bitrate of the stream | Mbps | Verifies 5-6 Mbps design target | Byte counters on TX/RX; log Mbps |
| 5 | Video transmission stability | Bitrate/FPS variance, stall count over time | jitter %, stalls/min | Long-mission reliability | Soak test; log stream stats |
| 6 | Packet reception latency | TX-to-receiver-app packet delay | ms | Separates air time from pipeline delay | Sender timestamp vs arrival; synchronized clocks |
| 7 | Packet transmission interval | Time between telemetry packets | s (Hz) | Duty cycle and freshness | Log consecutive TX timestamps |
| 8 | Packet reception count / delivery ratio per test cell | PDR/PLR per distance x altitude | % | Builds the RSSI/PLR/latency curves | Same logs as 4.2/4.3, bucketed |
| 9 | Communication range | Maximum distance with PLR <= 2.5% and fade margin >= 10 dB | m/km | Operational envelope | Radial waypoint flights; step 10-200 m |
| 10 | False negative rate | FN / (FN + TP) = 1 - recall | % | Missed-survivor risk | Labeled evaluation confusion matrix |
| 11 | F1-score | 2 * P * R / (P + R) | % | Balanced AI score for threshold tuning | Confusion matrix at candidate tau |
| 12 | Inference time | t_output - t_input per frame/inference | ms | Feeds the latency budget | perf_counter() instrumentation |
| 13 | AI processing FPS | Detection throughput | FPS | Operator freshness metric | Count inference results per second |
| 14 | Detection confidence distribution | Histogram of confidence scores | 0-1 | Calibration check | Log scores; reliability diagram |
| 15 | GPS update rate / fix quality | Fixes per second; C/N0 or hAcc | Hz, dB-Hz / m | The paper's pre-flight audit depends on GPS lock | u-blox NAV-PVT logging (module needed) |
| 16 | GPS fix acquisition time | Cold/warm/hot TTFF | s | Rapid deployment | Time to first fix per start mode |
| 17 | Battery voltage rail stability | 5 V BEC rail sag under load | V | Paper's UBEC no-brownout criterion needs numbers | INA226 logging during TX/NPU load |
| 18 | Energy consumption per hour | Wh per hour of operation | Wh | Battery sizing | Metered energy over 1 h soak |
| 19 | End-to-end data latency (full stack) | Sensor capture to operator display | ms | Operator-facing performance | Synchronized clocks across TX/RX |
| 20 | System CPU/RAM/temperature | Utilization and SoC temperature | %, deg C | Sustained-load health | psutil / vcgencmd measure_temp |
| 21 | System uptime and watchdog count | Hours since boot; service restarts | h, count | Field reliability | uptime, systemd journal |
| 22 | Network availability | AP/dashboard reachability | % | Ground-station usability | Periodic HTTP/ping probes |
| 23 | Telemetry update frequency effectiveness | Successful packets per minute actual vs configured | Hz | Detects silent TX failure | Count ok=1 rows in lora_transmissions |
| 24 | Thermal frame rate and thermal accuracy | MLX90640 effective FPS; error vs reference | FPS, deg C | Sensor-side freshness and validity | Frame-rate instrumentation; blackbody reference |

## 11. Applicability to the Current AERIS Prototype Build

- The SOP text and validation matrix were written for the Raspberry Pi 5 + Hailo-8L + YOLOv8 + FLIR Lepton 3.5 + Ebyte E220/E32 (915/923 MHz) + Alfa AWUS036ACM 5 GHz architecture in the paper.
- The code in this repository implements Raspberry Pi 4 Model B + MLX90640 + LoRa Ra-02 (SX1278, 433.0 MHz configured) + heuristic thermal presence detection + local Wi-Fi dashboard. There is no NPU, no YOLOv8, no FLIR Lepton, no Ebyte module, no MAVLink/SITL, no GPS module, and no video downlink.
- Consequently: (a) detection accuracy/precision/recall/FPR (Sections 5.1-5.3, 5.5) can only be evaluated after collecting labeled MLX90640 frames with the heuristic; (b) detection latency (5.4) and inference timing can be measured directly; (c) all LoRa receiver-side metrics (4.x) require a working receiver; (d) SOP 4 power endurance cannot be computed without a battery specification; (e) SOP 5 RSSI fade margin can only be tested in a real open-field campaign.
- None of the paper's thresholds (<= 131 ms, <= 105 ms, <= 2.5% PLR, >= 97.5% PDR, >= 10 dB fade margin) is currently verified for this build. They are design targets, not results.
- The current build does implement: packet sequencing, SQLite logging of every transmission attempt, sensor-status reporting, WebSocket dashboard with explicit unavailable-state handling. These support future measurement but are not measurements themselves.

## 12. References

Paper (inspected directly; source of all SOP text quoted here):

1. `AERIS PAPER v3.docx` - Chapter 1 "Statement of the Problem" (SOP 1-5), "Target Engineering Specifications", "Definition of Terms"; Chapter 2 (UAV-LoRa literature); Chapter 3 "System Validation Framework", "Objective-to-Validation Matrix", "Communication Performance", "Detection Performance", "Power Performance", "Research Instrumentation and Field Testing", "Pre-Deployment Verification and Mission Handshake SOP", "Statistical Treatment and Data Analysis". Path: `/home/blezlyy/Documents/projects/aeris-project/AERIS PAPER v3.docx`

Project sources (inspected directly; implementation context cited in Sections 10 and 11):

2. `README.md` - hardware verification status ("MLX90640 / LoRa 02 ... NOT TESTED"; "Recorded measurements ... NOT TESTED").
3. `app/config.py` - MLX90640 4 Hz refresh, I2C 0x33; LoRa 433.0 MHz, SF7, BW 125 kHz, CR 4/5, 17 dBm, 2.0 s TX interval, ACK disabled.
4. `app/communication/lora_transmitter.py`, `app/communication/lora_receiver.py` - register-level SX127x driver; receiver placeholder; `seq` numbering; SQLite logging.
5. `app/services/data_manager.py`, `app/storage/database.py`, `data/aeris.db` - recorded rows; all failed attempts; no valid measurement data.
6. `website/src/pages/SettingsPage.tsx`, `website/src/types/index.ts`, `website/src/stores/appStore.ts` - dashboard latency/RSSI/PLR/battery fields, unavailable-by-default.
7. `app/ai/human_detection.py`, `app/sensors/thermal_processing.py` - thermal presence heuristic (not human identification).
