"""Offline GNSS (GPS) source backed by a local serial NMEA receiver.

Why this exists
---------------
Browser geolocation on a desktop/laptop has no offline fix source unless the
OS is backed by hardware GNSS. This service reads a physically attached
USB/serial GNSS receiver (e.g. a u-blox USB dongle plugged into the AERIS
Raspberry Pi 4B) and exposes the latest fix over the local API. The receiver
computes its position from GNSS satellites only — no internet, no cloud
location service, no IP geolocation is involved at any point.

Design guarantees
-----------------
- Never fabricates a fix: `fix` in the status payload is None until a valid
  NMEA fix has been received from the hardware.
- Staleness is explicit: every report carries `age_s` (seconds since the
  receiver last reported a valid position) and `fresh` is False once the fix
  is older than GPS_FRESH_S.
- No transmit to the device; the port is opened read-only at GPS_BAUD.
- If pyserial is missing or no candidate port opens, the service reports
  `available: False` with a machine-readable `reason` — it never invents data.

Configuration (env / aeris.env)
-------------------------------
AERIS_GPS_ENABLED   auto (default) | off | on
AERIS_GPS_PORT      explicit device path (e.g. /dev/ttyUSB0). If unset, common
                    candidates are probed: /dev/serial/by-id/*gps*, *gnss*,
                    /dev/ttyUSB0, /dev/ttyACM0, /dev/ttyS0
AERIS_GPS_BAUD      baud rate (default 9600 — the NMEA default on u-blox and
                    most USB GNSS dongles)
AERIS_GPS_FRESH_S   age in seconds beyond which a fix is reported stale (default 10)
"""
from __future__ import annotations

import fnmatch
import glob
import os
import threading
import time
from typing import Any, Optional

from app.services.nmea import NmeaTracker

GPS_ENABLED = os.getenv("AERIS_GPS_ENABLED", "auto").strip().lower()
GPS_PORT_ENV = os.getenv("AERIS_GPS_PORT", "").strip()
GPS_BAUD = int(os.getenv("AERIS_GPS_BAUD", "9600"))
GPS_FRESH_S = float(os.getenv("AERIS_GPS_FRESH_S", "10"))
GPS_STALE_S = float(os.getenv("AERIS_GPS_STALE_S", "60"))  # beyond this we say "no fix"

_CANDIDATE_PATTERNS = (
    "/dev/serial/by-id/*gps*",
    "/dev/serial/by-id/*gnss*",
    "/dev/serial/by-id/*GNSS*",
    "/dev/serial/by-id/*GNSS*",
    "/dev/ttyUSB*",
    "/dev/ttyACM*",
    "/dev/ttyS0",
)


def _candidate_ports() -> list[str]:
    if GPS_PORT_ENV:
        return [GPS_PORT_ENV]
    seen: list[str] = []
    for pat in _CANDIDATE_PATTERNS:
        for p in sorted(glob.glob(pat)):
            if p not in seen:
                seen.append(p)
    return seen


class GpsSource:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tracker = NmeaTracker()
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._started = False
        self._port: Optional[str] = None
        self._open_error: Optional[str] = None
        self._enabled = GPS_ENABLED not in ("off", "0", "false", "no")

    # -- lifecycle -----------------------------------------------------------
    def start(self) -> None:
        with self._lock:
            if self._started or not self._enabled:
                return
            self._started = True
        self._thread = threading.Thread(target=self._run, name="aeris-gnss", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    # -- reader loop -----------------------------------------------------------
    def _run(self) -> None:
        try:
            import serial  # pyserial; optional dependency
        except Exception:
            with self._lock:
                self._open_error = "pyserial_not_installed"
            return
        while not self._stop.is_set():
            candidates = _candidate_ports()
            if not candidates:
                with self._lock:
                    self._port = None
                    self._open_error = "no_candidate_port"
                self._stop.wait(5.0)
                continue
            opened_any = False
            for port in candidates:
                if self._stop.is_set():
                    return
                try:
                    ser = serial.Serial(port, GPS_BAUD, timeout=1.0)
                except Exception as exc:  # busy / no permission / vanished
                    with self._lock:
                        self._open_error = f"open_failed:{port}:{type(exc).__name__}"
                    continue
                opened_any = True
                with self._lock:
                    self._port = port
                    self._open_error = None
                    self._tracker = NmeaTracker()
                try:
                    self._read_loop(ser, port)
                finally:
                    try:
                        ser.close()
                    except Exception:
                        pass
                    with self._lock:
                        self._port = None
            if not opened_any:
                self._stop.wait(5.0)

    def _read_loop(self, ser, port: str) -> None:
        buf = b""
        while not self._stop.is_set():
            try:
                chunk = ser.read(512)
            except Exception:
                return  # device vanished; outer loop re-probes
            if not chunk:
                # 1s timeout tick — nothing to parse
                continue
            buf += chunk
            if len(buf) > 8192:
                buf = buf[-2048:]
            lines = buf.split(b"\n")
            buf = lines.pop()  # keep a partial trailing line
            for line in lines:
                self._tracker.feed_line(line.decode("ascii", errors="ignore"))

    # -- status ------------------------------------------------------------------
    def status(self) -> dict[str, Any]:
        with self._lock:
            enabled = self._enabled
            port = self._port
            open_error = self._open_error
            tracker = self._tracker
        now_mono = time.monotonic()
        snap = tracker.snapshot() if tracker else None

        base: dict[str, Any] = {
            "enabled": enabled,
            "provider": "nmea-serial" if enabled else "disabled",
            "port": port,
            "baud": GPS_BAUD,
            "device": port,
            "available": bool(port),
            "provider_detail": "USB/serial GNSS receiver (NMEA 0183), offline satellite fix" if port else None,
            "sentences_seen": tracker.sentences_seen,
            "checksum_failures": tracker.checksum_failures,
            "fix": None,
            "fresh": False,
            "age_s": None,
            "reason": None,
            "checked_at": time.time(),
        }
        if not enabled:
            base["reason"] = "disabled"
            return base
        if port is None:
            base["reason"] = open_error or "no_serial_gnss_port"
            return base
        if snap is None:
            base["reason"] = "no_fix"  # receiver present, no valid position yet / lost fix
            return base
        age = snap.age_s(now_mono)
        fresh = age <= GPS_FRESH_S
        stale = age > GPS_STALE_S
        if stale:
            base["reason"] = "stale_fix"
            # Still report coordinates as last-known with explicit staleness — never as live.
        fix = {
            "lat": snap.lat,
            "lng": snap.lng,
            "altitude_m": snap.altitude_m,
            "speed_mps": snap.speed_mps,
            "course_deg": snap.course_deg,
            "hdop": snap.hdop,
            # Rough estimate derived from HDOP (~5 m per unit). Estimate, not a guarantee.
            "accuracy_m": snap.accuracy_m,
            "satellites": snap.satellites,
            "fix_quality": snap.fix_quality,
            "fix_mode": snap.fix_mode,
            "nmea_utc": snap.nmea_utc,
            "timestamp": (snap.nmea_utc * 1000.0) if snap.nmea_utc else snap.received_wallclock * 1000.0,
            "age_s": round(age, 1),
            "source": "usb-gnss-nmea",
        }
        base["fix"] = fix
        base["fresh"] = fresh
        base["age_s"] = round(age, 1)
        base["available"] = True
        return base


_source = GpsSource()


def start_gps_source() -> None:
    _source.start()


def gps_status() -> dict[str, Any]:
    return _source.status()
