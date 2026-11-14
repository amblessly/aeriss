"""Central runtime state and hardware polling loop.

Collects real thermal frames from MLX90640, runs thermal presence detection,
stores events, and transmits selected telemetry over LoRa when available.
No simulated sensor or radio data is generated.
"""
from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
import threading
import time
from typing import Any, Optional

from app.ai.human_detection import detect_human_presence
from app.communication.lora_receiver import LoRaReceiver
from app.communication.lora_transmitter import LoRaTransmitter
from app.config import (
    DEVICE_ID,
    DEVICE_NAME,
    HOTSPOT_IP,
    HOTSPOT_SSID,
    LORA_TX_INTERVAL_S,
    MLX90640_REFRESH_HZ,
)
from app.sensors.mlx90640 import MLX90640Sensor
from app.sensors.thermal_processing import frame_to_heatmap_values
from app.storage.database import Database


def _run_cmd(cmd: list[str], timeout: float = 1.5) -> tuple[int, str, str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except Exception as e:
        return 1, "", str(e)



class DataManager:
    WIFI_STABLE_CHECKS = 2

    def __init__(self) -> None:
        self.sensor = MLX90640Sensor()
        self.lora_tx = LoRaTransmitter()
        self.lora_rx = LoRaReceiver()
        self.db = Database()
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._state: dict[str, Any] = self._initial_state()
        self._subscribers: set[asyncio.Queue] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._last_lora_tx = 0.0
        self._wifi_cache: dict[str, Any] | None = None
        self._wifi_cache_ts: float = 0.0
        self._wifi_verified: dict[str, Any] | None = None
        self._wifi_ap_ok_streak: int = 0
        self._wifi_ap_fail_streak: int = 0

    def _initial_state(self) -> dict[str, Any]:
        return {
            "type": "system_state",
            "timestamp": time.time(),
            "device": {"id": DEVICE_ID, "name": DEVICE_NAME},
            "network": {
                "hotspot_ssid": HOTSPOT_SSID,
                "hotspot_ip": HOTSPOT_IP,
                "dashboard_url": f"http://{HOTSPOT_IP}:5000",
            },
            "wifi": {
                "name": "AERIS Local Wi-Fi",
                "active": False,
                "state": "unknown",
                "target_ssid": HOTSPOT_SSID,
                "target_ip": HOTSPOT_IP,
                "ssid": None,
                "ip": None,
                "interface": None,
                "mode": None,
                "details": "Not checked yet",
            },
            "sensor": {"connected": False, "sensor": "MLX90640", "error": "Not initialized"},
            "thermal": {
                "available": False,
                "frame": None,
                "heatmap": None,
                "min_c": None,
                "max_c": None,
                "avg_c": None,
            },
            "detection": {
                "available": False,
                "person_detected": False,
                "detection_type": "unavailable",
                "confidence": 0.0,
            },
            "lora": {
                "transmitter": {"enabled": False, "initialized": False},
                "receiver": {"available": False, "initialized": False},
            },
            "recent_detections": [],
        }

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def get_state(self) -> dict[str, Any]:
        with self._lock:
            # shallow copy with nested copies for safety
            import copy
            return copy.deepcopy(self._state)

    async def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        with self._lock:
            self._subscribers.add(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue) -> None:
        with self._lock:
            self._subscribers.discard(q)

    def _publish(self, state: dict[str, Any]) -> None:
        if not self._loop:
            return
        with self._lock:
            subs = list(self._subscribers)
        for q in subs:
            try:
                self._loop.call_soon_threadsafe(q.put_nowait, state)
            except Exception:
                pass

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="aeris-data-manager", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3.0)
        try:
            self.sensor.disconnect()
        except Exception:
            pass
        try:
            self.lora_tx.close()
        except Exception:
            pass
        try:
            self.db.close()
        except Exception:
            pass

    def _run(self) -> None:
        self.sensor.connect()
        self.lora_tx.init()
        self.lora_rx.start()
        # Polling interval based on sensor refresh where possible
        interval = 1.0 / float(MLX90640_REFRESH_HZ) if MLX90640_REFRESH_HZ > 0 else 0.5
        interval = max(0.25, min(2.0, interval))
        while not self._stop.is_set():
            ts = time.time()
            frame = self.sensor.read_frame()
            sensor_status = self.sensor.status.to_dict()
            sensor_status["state"] = getattr(self.sensor, "sensor_state", "initializing" if sensor_status.get("frames_read", 0) == 0 else ("connected" if sensor_status.get("connected") else "disconnected"))

            prev_state = self.get_state() if hasattr(self, "_state") else {}
            prev_thermal = (prev_state.get("thermal") or {}) if isinstance(prev_state, dict) else {}

            if frame is not None:
                detection = detect_human_presence(frame)
                thermal = {
                    "available": True,
                    "frame": {
                        "width": frame.width,
                        "height": frame.height,
                        "min_c": round(frame.min_c, 2),
                        "max_c": round(frame.max_c, 2),
                        "avg_c": round(frame.avg_c, 2),
                        "timestamp": frame.timestamp,
                    },
                    "heatmap": frame_to_heatmap_values(frame),
                    "min_c": round(frame.min_c, 2),
                    "max_c": round(frame.max_c, 2),
                    "avg_c": round(frame.avg_c, 2),
                }
                try:
                    self.db.log_thermal_reading(ts, True, thermal["frame"], sensor_status)
                except Exception:
                    pass
            else:
                # Keep last valid thermal frame visible during brief transient issues when sensor still considered connected
                if sensor_status.get("state") == "connected" and prev_thermal.get("available") and prev_thermal.get("heatmap"):
                    detection = detect_human_presence(self.sensor.last_frame) if self.sensor.last_frame else (prev_state.get("detection") or detect_human_presence(None))
                    thermal = dict(prev_thermal)
                    thermal["stale"] = True
                else:
                    detection = detect_human_presence(None)
                    thermal = {
                        "available": False,
                        "frame": None,
                        "heatmap": None,
                        "min_c": None,
                        "max_c": None,
                        "avg_c": None,
                    }
                try:
                    self.db.log_thermal_reading(ts, bool(thermal.get("available") and sensor_status.get("connected")), thermal.get("frame"), sensor_status)
                except Exception:
                    pass

            # Log detection events on presence or state changes; keep simple: log when detected
            if detection.get("available") and detection.get("person_detected"):
                try:
                    self.db.log_detection_event(ts, detection)
                except Exception:
                    pass

            # LoRa telemetry transmission (selected, real)
            lora_tx_status = self.lora_tx.status.to_dict()
            now = time.time()
            # Attempt init only occasionally when not initialized to avoid flapping/errors spam
            if not lora_tx_status.get("initialized") and (now - self._last_lora_tx) >= max(LORA_TX_INTERVAL_S, 5.0):
                try:
                    self.lora_tx.init()
                except Exception:
                    pass
                lora_tx_status = self.lora_tx.status.to_dict()
            if (now - self._last_lora_tx) >= LORA_TX_INTERVAL_S:
                payload = self._build_lora_payload(ts, sensor_status, thermal, detection)
                ok, meta = self.lora_tx.send_packet(payload)
                lora_tx_status = self.lora_tx.status.to_dict()
                try:
                    self.db.log_lora_transmission(meta.get("timestamp", now), meta.get("seq"), ok, meta.get("bytes", 0), payload, meta)
                except Exception:
                    pass
                self._last_lora_tx = now

            try:
                recent = self.db.recent_detections(limit=20)
            except Exception:
                recent = []

            wifi_status = self._get_stable_wifi_status()
            state = {
                "type": "system_state",
                "timestamp": ts,
                "device": {"id": DEVICE_ID, "name": DEVICE_NAME},
                "network": {
                    "hotspot_ssid": HOTSPOT_SSID,
                    "hotspot_ip": HOTSPOT_IP,
                    "dashboard_url": f"http://{HOTSPOT_IP}:5000",
                    "internet_required": False,
                },
                "wifi": wifi_status,
                "sensor": sensor_status,
                "thermal": thermal,
                "detection": detection,
                "lora": {
                    "transmitter": lora_tx_status,
                    "receiver": self.lora_rx.status.to_dict(),
                },
                "recent_detections": recent,
            }

            with self._lock:
                self._state = state
            self._publish(state)
            self._stop.wait(interval)

    def _get_client_ip_for_station(self, iface: str | None, station_mac: str | None) -> str | None:
        """Best-effort lookup of a connected client's IP from local DHCP lease info.

        Only used for verified AP clients. Returns None if unavailable (never fabricated).
        """
        if not station_mac:
            return None
        mac = station_mac.strip().lower()
        try:
            import glob
            lease_paths = [
                "/var/lib/misc/dnsmasq.leases",
                "/var/lib/NetworkManager/dnsmasq-*.leases",
                "/var/lib/NetworkManager/dnsmasq-shared.leases",
                "/run/NetworkManager/dnsmasq-*.leases",
            ]
            for pattern in lease_paths:
                for path in glob.glob(pattern):
                    try:
                        with open(path, "r", encoding="utf-8", errors="ignore") as f:
                            for line in f:
                                parts = line.strip().split()
                                # dnsmasq: <expiry> <mac> <ip> <hostname> <clientid>
                                if len(parts) >= 3 and parts[1].lower() == mac:
                                    ip = parts[2]
                                    if ip and ip.count(".") == 3:
                                        return ip
                    except Exception:
                        continue
            # NetworkManager device-specific lease files (best-effort)
            if iface:
                for pattern in [f"/var/lib/NetworkManager/internal-*-{iface}.lease", f"/var/lib/NetworkManager/*{iface}*.lease"]:
                    for path in glob.glob(pattern):
                        try:
                            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                                txt = f.read()
                            # very rough parse
                            m = re.search(r"ADDRESS=(\d+\.\d+\.\d+\.\d+)", txt)
                            if m:
                                return m.group(1)
                        except Exception:
                            continue
        except Exception:
            return None
        return None

    def _probe_wifi_status(self) -> tuple[dict[str, Any], bool]:
        """Raw Wi-Fi/AP probe. Returns (status, reliable).

        Detects whether this device is hosting the AERIS hotspot (RPi hotspot mode)
        or running without hosting it (development/client mode). In hotspot mode,
        "connected" means an actual Wi-Fi client is associated to the AP (verified
        via station/client info when available). In development mode, status remains
        "connecting" while waiting for a real AERIS client connection to the hosted AP.

        Connection display fields (ssid/ip/signal) are exposed ONLY for a verified
        connected AERIS hotspot client; otherwise they are null.
        """
        now = time.time()
        status: dict[str, Any] = {
            "name": "AERIS Local Wi-Fi",
            "active": False,
            "state": "unknown",  # active | inactive | connecting | unknown | not_tested
            "target_ssid": HOTSPOT_SSID,
            "target_ip": HOTSPOT_IP,
            "ssid": None,
            "ip": None,
            "interface": None,
            "mode": None,
            "details": None,
            "connected_clients": None,
            "clients_count_available": False,
            "signal_percent": None,
            "signal_dbm": None,
            "last_checked_ts": now,
            "stale": False,
            "wifi_interface_state": "unknown",  # up | down | unknown
            "ap_state": "inactive",  # active | inactive | unknown
            "laptop_connection_state": "unknown",  # connected | not_connected | unknown
            "operation_mode": "development",  # development | hotspot
            "hosting_ap": False,
            "verified": False,
        }

        try:
            if not shutil.which("nmcli") and not shutil.which("iw"):
                status["state"] = "not_tested"
                status["ap_state"] = "inactive"
                status["operation_mode"] = "development"
                status["details"] = "Development mode: Wi-Fi status tools (nmcli/iw) not available; cannot detect AERIS hotspot/clients"
                return status, True

            nmcli_ok = False
            iw_ok = False
            had_wifi_device = False
            wifi_devs: list[dict[str, str]] = []

            if shutil.which("nmcli"):
                code, out, _ = _run_cmd(["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "dev", "status"])
                if code == 0:
                    nmcli_ok = True
                    for line in out.splitlines():
                        parts = line.split(":")
                        if len(parts) >= 4 and parts[1] == "wifi":
                            had_wifi_device = True
                            wifi_devs.append({
                                "device": parts[0],
                                "state": parts[2],
                                "connection": parts[3] if len(parts) == 4 else ":".join(parts[3:]),
                            })

            # Collect iw interface info (authoritative for AP/managed type and SSID)
            iw_blocks: list[dict[str, Any]] = []
            if shutil.which("iw"):
                code, out, _ = _run_cmd(["iw", "dev"])
                if code == 0 and out:
                    iw_ok = True
                    cur_if = None
                    cur_type = None
                    cur_ssid = None
                    for line in out.splitlines():
                        line = line.rstrip()
                        m = re.match(r"\s*Interface\s+(\S+)", line)
                        if m:
                            if cur_if:
                                iw_blocks.append({"interface": cur_if, "type": cur_type, "ssid": cur_ssid})
                            cur_if = m.group(1); cur_type = None; cur_ssid = None
                            continue
                        m = re.match(r"\s*type\s+(\S+)", line)
                        if m and cur_if:
                            cur_type = m.group(1)
                        m = re.match(r"\s*ssid\s+(.+)", line)
                        if m and cur_if:
                            cur_ssid = m.group(1).strip()
                    if cur_if:
                        iw_blocks.append({"interface": cur_if, "type": cur_type, "ssid": cur_ssid})
                elif not nmcli_ok:
                    iw_ok = False

            # Pick best interface context: prefer AERIS AP-hosting interface, else first wifi device
            ap_blk = None
            for b in iw_blocks:
                b_ssid = (b.get("ssid") or "").lower()
                if b.get("type") == "AP" or (HOTSPOT_SSID.lower() and HOTSPOT_SSID.lower() in b_ssid):
                    ap_blk = b
                    break

            chosen_dev = None
            if ap_blk:
                for d in wifi_devs:
                    if d.get("device") == ap_blk.get("interface"):
                        chosen_dev = d
                        break
            if chosen_dev is None and wifi_devs:
                for d in wifi_devs:
                    conn = (d.get("connection") or "").lower()
                    if HOTSPOT_SSID.lower() in conn or "hotspot" in conn or conn.endswith("ap") or " ap" in f" {conn} ":
                        chosen_dev = d
                        break
                if chosen_dev is None:
                    for d in wifi_devs:
                        if "connected" in (d.get("state") or "").lower():
                            chosen_dev = d
                            break
                if chosen_dev is None:
                    chosen_dev = wifi_devs[0]

            iface = (ap_blk or {}).get("interface") or (chosen_dev or {}).get("device")
            if iface:
                status["interface"] = iface
            conn_name = (chosen_dev or {}).get("connection")
            dev_state = ((chosen_dev or {}).get("state") or "").lower()

            # Interface up/down
            if iface:
                lcode, lout, _ = _run_cmd(["ip", "-o", "link", "show", "dev", iface])
                if lcode == 0 and lout:
                    flags = ""
                    if "<" in lout and ">" in lout:
                        flags = lout.split("<", 1)[1].split(">", 1)[0]
                    status["wifi_interface_state"] = "up" if ("UP" in flags or "state UP" in lout) else "down"
                else:
                    status["wifi_interface_state"] = "unknown"
            elif nmcli_ok and not had_wifi_device:
                status["wifi_interface_state"] = "down"

            # Resolve SSID/mode from nmcli connection when available (internal context only)
            ap_ssid = None
            if iface and conn_name and conn_name not in ("--", ""):
                ccode, cout, _ = _run_cmd(["nmcli", "-t", "-f", "802-11-wireless.mode,802-11-wireless.ssid", "con", "show", conn_name])
                if ccode == 0 and cout:
                    for line in cout.splitlines():
                        if ":" not in line:
                            continue
                        k, v = line.split(":", 1)
                        if k.endswith("mode"):
                            status["mode"] = (v or "").strip() or None
                        if k.endswith("ssid"):
                            ap_ssid = (v or conn_name).strip() or conn_name
                if ap_ssid is None:
                    ap_ssid = conn_name

            # Apply iw block info for selected interface
            sel_blk = None
            if iface:
                for b in iw_blocks:
                    if b.get("interface") == iface:
                        sel_blk = b
                        break
            if sel_blk is None and ap_blk:
                sel_blk = ap_blk
            if sel_blk:
                if sel_blk.get("ssid"):
                    ap_ssid = sel_blk.get("ssid")
                if sel_blk.get("type"):
                    status["mode"] = "ap" if sel_blk.get("type") == "AP" else str(sel_blk.get("type")).lower()

            # Determine if this device is hosting the AERIS AP (hotspot mode)
            ssid_l = (ap_ssid or "").lower()
            is_target_ssid = bool(HOTSPOT_SSID and HOTSPOT_SSID.lower() == ssid_l)
            is_ap_type = (status.get("mode") == "ap") or ((sel_blk or {}).get("type") == "AP")
            ap_hosting = bool(is_ap_type and (is_target_ssid or HOTSPOT_SSID.lower() in ssid_l or "hotspot" in (conn_name or "").lower()))
            if not ap_hosting and dev_state.startswith("connected") and ("hotspot" in (conn_name or "").lower() or (status.get("mode") == "ap" and is_target_ssid)):
                ap_hosting = True

            status["hosting_ap"] = ap_hosting
            status["operation_mode"] = "hotspot" if ap_hosting else "development"
            status["ap_state"] = "active" if ap_hosting and status.get("wifi_interface_state") != "down" else "inactive"

            # Detect actual connected clients when hosting AP
            client_count: int | None = None
            clients_reliable = False
            client_signal_dbm: int | None = None
            station_mac: str | None = None
            if ap_hosting and iface and shutil.which("iw") and status.get("wifi_interface_state") == "up":
                ccode, cout, _ = _run_cmd(["iw", "dev", iface, "station", "dump"])
                if ccode == 0:
                    stations = 0
                    for line in cout.splitlines():
                        ls = line.strip()
                        if line.startswith("Station "):
                            stations += 1
                            if station_mac is None:
                                station_mac = line.split("Station ", 1)[1].strip()
                        if ls.startswith("signal:") and client_signal_dbm is None:
                            try:
                                client_signal_dbm = int(float(ls.split()[1]))
                            except Exception:
                                pass
                    client_count = stations
                    clients_reliable = True
                    status["clients_count_available"] = True
                    status["connected_clients"] = stations
                    status["laptop_connection_state"] = "connected" if stations > 0 else "not_connected"
                else:
                    status["clients_count_available"] = False
                    status["laptop_connection_state"] = "unknown"

            if ap_hosting:
                ap_name = ap_ssid or HOTSPOT_SSID
                if dev_state in ("connecting", "activating") or status.get("wifi_interface_state") == "down":
                    status["state"] = "connecting"
                    status["active"] = False
                    status["details"] = f"Hotspot mode: starting AERIS access point ({ap_name})..."
                elif client_count is not None and client_count > 0:
                    # Verified actual client connected to AERIS hotspot
                    status["state"] = "active"
                    status["active"] = True
                    status["details"] = f"Hotspot mode: client connected to {ap_name}"
                    status["ssid"] = ap_name
                    status["ip"] = self._get_client_ip_for_station(iface, station_mac)  # actual client IP if available
                    status["signal_dbm"] = client_signal_dbm
                elif clients_reliable:
                    status["state"] = "connecting"
                    status["active"] = False
                    status["details"] = f"Hotspot mode: waiting for a laptop/client to connect to {ap_name}"
                else:
                    status["state"] = "connecting"
                    status["active"] = False
                    status["details"] = f"Hotspot mode: AERIS access point active, verifying client connection..."
                # When no verified client connected, do not expose AP/gateway/local network info as client info
                if not (client_count is not None and client_count > 0):
                    status["ssid"] = None
                    status["ip"] = None
                    status["signal_dbm"] = None
                    status["signal_percent"] = None
            else:
                # Development/client mode (e.g. running on laptop now): never report Connected or local network info
                status["operation_mode"] = "development"
                status["ap_state"] = "inactive"
                status["active"] = False
                status["clients_count_available"] = False
                status["connected_clients"] = None
                status["laptop_connection_state"] = "unknown"
                status["state"] = "connecting"
                status["ssid"] = None
                status["ip"] = None
                status["signal_dbm"] = None
                status["signal_percent"] = None
                if nmcli_ok or iw_ok:
                    status["details"] = "Development mode: waiting for actual AERIS client/hotspot connection"
                else:
                    status["details"] = "Development mode: waiting for actual AERIS client/hotspot connection"

            reliable = nmcli_ok or iw_ok
            return status, reliable
        except Exception as e:
            status["details"] = f"Wi-Fi status check error: {e}"
            status["state"] = "unknown"
            status["ap_state"] = "unknown"
            status["wifi_interface_state"] = "unknown"
            status["operation_mode"] = "development"
            status["ssid"] = None
            status["ip"] = None
            status["signal_dbm"] = None
            status["signal_percent"] = None
            return status, False

    def _get_stable_wifi_status(self) -> dict[str, Any]:
        """Return a stability-filtered Wi-Fi/AP status.

        - Development mode (not hosting AERIS AP): stays "connecting" while waiting
          for an actual AERIS hotspot/client context; never reports Connected due to
          a local/client Wi-Fi connection. Clearly marked as development mode.
        - Hotspot mode (hosting AERIS AP): "connecting" while AP is up but waiting
          for an actual connected client; "active/connected" only when client(s)
          are actually detected. Client presence transitions require consecutive
          reliable checks to avoid flapping.
        - Temporary unreliable checks keep the last verified state but mark it
          stale/unverified (never reported as currently verified).
        """
        now = time.time()
        probe, reliable = self._probe_wifi_status()
        probe["last_checked_ts"] = now

        # First observation
        if self._wifi_verified is None:
            if reliable:
                probe["verified"] = True
                # initialize streaks based on initial observed state
                if probe.get("operation_mode") == "hotspot":
                    if probe.get("state") == "active":
                        self._wifi_ap_ok_streak = self.WIFI_STABLE_CHECKS
                        self._wifi_ap_fail_streak = 0
                    elif probe.get("state") == "connecting":
                        self._wifi_ap_ok_streak = 0
                        self._wifi_ap_fail_streak = 0
                    else:
                        self._wifi_ap_ok_streak = 0
                        self._wifi_ap_fail_streak = self.WIFI_STABLE_CHECKS
                else:
                    self._wifi_ap_ok_streak = 0
                    self._wifi_ap_fail_streak = 0
                self._wifi_verified = dict(probe)
                self._wifi_cache = self._wifi_verified
                self._wifi_cache_ts = now
                return dict(probe)
            # unreliable and no history
            probe["stale"] = True
            probe["verified"] = False
            return probe

        verified = dict(self._wifi_verified)

        # Unreliable/temporary check failure: keep last verified state, do not claim current verification
        if not reliable:
            out = dict(verified)
            out["last_checked_ts"] = now
            out["stale"] = True
            out["verified"] = False
            out["details"] = (verified.get("details") or "Wi-Fi status unavailable") + " (last verified state; current check unavailable)"
            out["target_ssid"] = HOTSPOT_SSID
            out["target_ip"] = HOTSPOT_IP
            return out

        op_mode = probe.get("operation_mode", "development")

        # Development mode: stable "connecting" while waiting for actual AERIS hotspot/client context.
        # Never falsely report Connected due to an active local/client Wi-Fi interface.
        # Do not display detected/local network SSID/IP or gateway as client info.
        if op_mode == "development":
            self._wifi_ap_ok_streak = 0
            self._wifi_ap_fail_streak = 0
            out = dict(probe)
            out["operation_mode"] = "development"
            out["hosting_ap"] = False
            out["ap_state"] = "inactive"
            out["active"] = False
            out["state"] = "connecting" if probe.get("state") != "not_tested" else "not_tested"
            out["verified"] = True
            out["stale"] = False
            out["target_ssid"] = HOTSPOT_SSID
            out["target_ip"] = HOTSPOT_IP
            out["ssid"] = None
            out["ip"] = None
            out["signal_dbm"] = None
            out["signal_percent"] = None
            out["laptop_connection_state"] = "unknown"
            out["connected_clients"] = None
            out["clients_count_available"] = False
            self._wifi_verified = dict(out)
            self._wifi_cache = out
            self._wifi_cache_ts = now
            return out

        # Hotspot mode: require consecutive reliable checks for client connected/disconnected transitions
        probe_state = probe.get("state")
        if probe_state == "active" and probe.get("laptop_connection_state") == "connected":
            self._wifi_ap_ok_streak += 1
            self._wifi_ap_fail_streak = 0
        elif probe_state in ("connecting", "inactive") and probe.get("laptop_connection_state") in ("not_connected", "unknown", None):
            self._wifi_ap_fail_streak += 1
            self._wifi_ap_ok_streak = 0
        else:
            # ambiguous observation; don't force a flip
            # decay opposite streak softly by not incrementing, but keep some inertia
            pass

        out = dict(probe)
        out["operation_mode"] = "hotspot"
        out["hosting_ap"] = True
        out["stale"] = False
        out["target_ssid"] = HOTSPOT_SSID
        out["target_ip"] = HOTSPOT_IP

        verified_state = verified.get("state")
        # Transition to Connected only after consecutive verified observations of an actual client
        if self._wifi_ap_ok_streak >= self.WIFI_STABLE_CHECKS:
            out["state"] = "active"
            out["active"] = True
            out["ap_state"] = "active"
            out["verified"] = True
        # Transition away from Connected only after consecutive verified observations without a client / not active
        elif self._wifi_ap_fail_streak >= self.WIFI_STABLE_CHECKS:
            # AP hosting but waiting for client -> Connecting (stable)
            out["state"] = "connecting" if probe.get("ap_state") == "active" or probe.get("hosting_ap") else "inactive"
            out["active"] = False
            out["ap_state"] = "active" if probe.get("ap_state") == "active" or probe.get("hosting_ap") else "inactive"
            out["verified"] = True
        else:
            # In-between: keep last verified state to avoid flapping
            if verified.get("operation_mode") == "hotspot" and verified_state in ("active", "connecting", "inactive"):
                out["state"] = verified_state
                out["active"] = bool(verified_state == "active")
                out["ap_state"] = verified.get("ap_state", out.get("ap_state", "active"))
                out["verified"] = True
                # refresh live details/metrics from probe where available
                if probe.get("details"):
                    out["details"] = probe.get("details")
            else:
                out["state"] = "connecting"
                out["active"] = False
                out["verified"] = True

        # Preserve interface context only; never carry over unrelated/local/AP-gateway/client info when not connected
        if not out.get("interface") and verified.get("interface"):
            out["interface"] = verified.get("interface")
        if not out.get("mode") and verified.get("mode"):
            out["mode"] = verified.get("mode")
        if out.get("wifi_interface_state") == "unknown" and verified.get("wifi_interface_state") in ("up", "down"):
            out["wifi_interface_state"] = verified.get("wifi_interface_state")

        # Only expose SSID/IP/signal for a verified connected AERIS hotspot client
        if not (out.get("state") == "active" and out.get("operation_mode") == "hotspot" and out.get("laptop_connection_state") == "connected"):
            out["ssid"] = None
            out["ip"] = None
            out["signal_dbm"] = None
            out["signal_percent"] = None
        else:
            # Connected: ensure SSID is AERIS hotspot; keep client IP/signal only if actually known
            if not out.get("ssid"):
                out["ssid"] = HOTSPOT_SSID
            # Do not use Pi gateway IP as laptop client IP; leave null if unavailable
            if out.get("ip") == HOTSPOT_IP:
                out["ip"] = None

        self._wifi_verified = dict(out)
        self._wifi_cache = out
        self._wifi_cache_ts = now
        return out

    def _build_lora_payload(self, ts: float, sensor_status: dict, thermal: dict, detection: dict) -> dict[str, Any]:
        # Selected telemetry only (no continuous thermal image over LoRa)
        payload: dict[str, Any] = {
            "device": DEVICE_ID,
            "ts": round(ts, 3),
            "sensor_connected": bool(sensor_status.get("connected")),
            "detection": bool(detection.get("person_detected")),
            "detection_type": detection.get("detection_type"),
            "confidence": detection.get("confidence"),
            "status": "ok" if sensor_status.get("connected") else "sensor_disconnected",
        }
        if thermal.get("available"):
            payload["temp"] = {
                "min": thermal.get("min_c"),
                "max": thermal.get("max_c"),
                "avg": thermal.get("avg_c"),
            }
        if sensor_status.get("error"):
            payload["sensor_error"] = str(sensor_status.get("error"))[:80]
        return payload
