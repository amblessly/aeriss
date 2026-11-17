"""Minimal, dependency-free NMEA 0183 parser for GNSS receivers.

Parses the sentences a standalone USB/serial GNSS receiver emits without any
network access:
  - $xxGGA / $xxGLL : position fix quality, HDOP, satellite count, altitude
  - $xxRMC          : fix validity (A/V), UTC timestamp, speed, course
  - $xxGSA          : fix mode (no fix / 2D / 3D), DOP values
  - $xxGSV          : satellites in view

This module performs *parsing only*. It never fabricates a position: a fix is
reported only after a valid RMC (status A) or a GGA with fix quality > 0 with
parseable coordinates has been seen. Callers must additionally check fix age.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional


def _checksum_ok(sentence: str) -> bool:
    """Validate the *CS checksum if present. Tolerates missing checksums."""
    sentence = sentence.strip()
    if not sentence.startswith("$"):
        return False
    if "*" not in sentence:
        return True  # some receivers omit checksums; accept, flagged in parse
    body, _, cs = sentence[1:].partition("*")
    try:
        expected = int(cs.strip()[:2], 16)
    except ValueError:
        return False
    calc = 0
    for ch in body:
        calc ^= ord(ch)
    return calc == expected


def _dm_to_deg(raw: str, hemi: str) -> Optional[float]:
    """Convert NMEA ddmm.mmmm / dddmm.mmmm to decimal degrees."""
    raw = raw.strip()
    if not raw:
        return None
    try:
        dot = raw.index(".")
        deg_len = dot - 2  # degrees are 2 (lat) or 3 (lon) digits; minutes are dddmm.mmmm
        deg = int(raw[:deg_len])
        minutes = float(raw[deg_len:])
        val = deg + minutes / 60.0
    except (ValueError, IndexError):
        return None
    hemi = (hemi or "").strip().upper()
    if hemi in ("S", "W"):
        val = -val
    elif hemi not in ("N", "E"):
        return None
    return val


def _to_float(s: str) -> Optional[float]:
    try:
        return float(s.strip())
    except (ValueError, AttributeError):
        return None


def _to_int(s: str) -> Optional[int]:
    try:
        return int(s.strip())
    except (ValueError, AttributeError):
        return None


@dataclass
class FixSnapshot:
    """Timestamped, fully-assembled fix view."""
    lat: float
    lng: float
    altitude_m: Optional[float]
    hdop: Optional[float]
    satellites: Optional[int]
    fix_quality: Optional[int]      # GGA fix quality indicator (0 = no fix)
    fix_mode: Optional[int]         # GSA mode: 1 none, 2 2D, 3 3D
    speed_mps: Optional[float]      # RMC speed over ground
    course_deg: Optional[float]     # RMC course over ground
    nmea_utc: Optional[float]       # NMEA UTC time as unix epoch (when date known)
    received_monotonic: float       # monotonic() at last updating sentence
    received_wallclock: float       # time.time() at last updating sentence

    @property
    def accuracy_m(self) -> Optional[float]:
        """Rough accuracy estimate from HDOP (~5 m per HDOP unit). Estimate only."""
        if self.hdop is None or self.hdop <= 0:
            return None
        return round(self.hdop * 5.0, 1)

    def age_s(self, now_monotonic: Optional[float] = None) -> float:
        now = now_monotonic if now_monotonic is not None else time.monotonic()
        return max(0.0, now - self.received_monotonic)


@dataclass
class NmeaTracker:
    """Incrementally assembles GGA/RMC/GSA/GSV into a FixSnapshot."""

    _gga_lat: Optional[float] = None
    _gga_lng: Optional[float] = None
    _gga_alt: Optional[float] = None
    _gga_quality: Optional[int] = None
    _gga_hdop: Optional[float] = None
    _gga_sats: Optional[int] = None
    _gga_mono: Optional[float] = None
    _gga_wall: Optional[float] = None

    _rmc_valid: Optional[bool] = None  # True when RMC status == 'A'
    _rmc_speed: Optional[float] = None
    _rmc_course: Optional[float] = None
    _rmc_mono: Optional[float] = None
    _rmc_wall: Optional[float] = None
    _rmc_utc: Optional[float] = None

    _gsa_mode: Optional[int] = None
    _gsa_hdop: Optional[float] = None

    _gsv_in_view: Optional[int] = None

    sentences_seen: int = 0
    checksum_failures: int = 0

    def feed_line(self, line: str, now_mono: Optional[float] = None,
                  now_wall: Optional[float] = None) -> None:
        now_mono = time.monotonic() if now_mono is None else now_mono
        now_wall = time.time() if now_wall is None else now_wall
        line = line.strip()
        if not line or not line.startswith("$"):
            return
        if not _checksum_ok(line):
            self.checksum_failures += 1
            return
        body = line[1:].split("*", 1)[0]
        parts = body.split(",")
        talker_type = parts[0]
        # sentence type is the last 3 chars of the talker field (GP|GN|GL|GA...|GGA)
        stype = talker_type[-3:].upper()
        fields = parts[1:]
        self.sentences_seen += 1
        handler = getattr(self, f"_on_{stype}", None)
        if handler is not None:
            handler(fields, now_mono, now_wall)

    def feed(self, data: bytes) -> None:
        for raw in data.split(b"\n"):
            try:
                line = raw.decode("ascii", errors="ignore")
            except Exception:
                continue
            self.feed_line(line)

    # --- sentence handlers ---------------------------------------------------
    def _on_GGA(self, f, mono, wall):
        # $..GGA,time,lat,N/S,lon,E/W,quality,numSV,HDOP,alt,M,geoid,M,age,ref
        if len(f) < 10:
            return
        lat = _dm_to_deg(f[1], f[2])
        lng = _dm_to_deg(f[3], f[4])
        quality = _to_int(f[5]) or 0
        sats = _to_int(f[6])
        hdop = _to_float(f[7])
        alt = _to_float(f[8])
        if quality == 0:
            # explicit "no fix": clear position so we never serve a stale lock
            self._gga_quality = 0
            self._gga_lat = None
            self._gga_lng = None
            self._gga_mono = mono
            self._gga_wall = wall
            return
        if lat is None or lng is None:
            return
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
            return
        if lat == 0.0 and lng == 0.0:
            return  # classic null-island sentinel
        self._gga_lat, self._gga_lng = lat, lng
        self._gga_alt = alt
        self._gga_quality = quality
        self._gga_hdop = hdop
        self._gga_sats = sats
        self._gga_mono = mono
        self._gga_wall = wall

    def _on_RMC(self, f, mono, wall):
        # $..RMC,time,status,lat,N/S,lon,E/W,speed(knots),course,date,...
        if len(f) < 7:
            return
        status = (f[1] or "").strip().upper()
        speed_kn = _to_float(f[6])
        course = _to_float(f[7]) if len(f) > 7 else None
        self._rmc_valid = status == "A"
        self._rmc_speed = speed_kn * 0.514444 if speed_kn is not None else None
        self._rmc_course = course
        self._rmc_mono = mono
        self._rmc_wall = wall
        # date is field index 8 (ddmmyy); combine with time f[0] hhmmss(.s)
        try:
            t = f[0].strip()
            d = f[8].strip() if len(f) > 8 else ""
            if len(t) >= 6 and len(d) >= 6 and status == "A":
                import calendar
                hh, mm, ss = int(t[0:2]), int(t[2:4]), int(float(t[4:]))
                day, mon, yr = int(d[0:2]), int(d[2:4]), int(d[4:6])
                yr += 2000 if yr < 80 else 1900
                self._rmc_utc = calendar.timegm((yr, mon, day, hh, mm, ss, 0, 0, 0))
        except Exception:
            self._rmc_utc = None

    def _on_GSA(self, f, mono, wall):
        # $..GSA,mode1,fixType,sv1..sv12,PDOP,HDOP,VDOP
        # fields: f[0]=auto/manual, f[1]=fix type (1 none, 2 2D, 3 3D),
        #         f[-3]=PDOP, f[-2]=HDOP, f[-1]=VDOP
        if len(f) < 3:
            return
        mode = _to_int(f[1])
        hdop = _to_float(f[-2]) if len(f) >= 3 else None
        if mode in (1, 2, 3):
            self._gsa_mode = mode
        if hdop is not None and hdop > 0:
            self._gsa_hdop = hdop

    def _on_GSV(self, f, mono, wall):
        # $..GSV,numMsg,msgNum,satsInView,...
        n = _to_int(f[2]) if len(f) >= 3 else None
        if n is not None:
            self._gsv_in_view = n

    # --- readout --------------------------------------------------------------
    def snapshot(self) -> Optional[FixSnapshot]:
        """Assemble the current fix, or None if no valid fix has been seen."""
        gga_ok = (
            self._gga_lat is not None and self._gga_lng is not None
            and self._gga_quality is not None and self._gga_quality > 0
            and self._gga_mono is not None
        )
        # RMC alone cannot supply coordinates safely for this use; require GGA position.
        if not gga_ok:
            return None
        # An explicitly invalid RMC marks the receiver as having lost the fix.
        if self._rmc_valid is False:
            return None
        hdop = self._gga_hdop if (self._gga_hdop and self._gga_hdop > 0) else self._gsa_hdop
        sats = self._gga_sats if self._gga_sats is not None else self._gsv_in_view
        return FixSnapshot(
            lat=self._gga_lat,
            lng=self._gga_lng,
            altitude_m=self._gga_alt,
            hdop=hdop,
            satellites=sats,
            fix_quality=self._gga_quality,
            fix_mode=self._gsa_mode,
            speed_mps=self._rmc_speed,
            course_deg=self._rmc_course,
            nmea_utc=self._rmc_utc,
            received_monotonic=self._gga_mono,
            received_wallclock=self._gga_wall or time.time(),
        )
