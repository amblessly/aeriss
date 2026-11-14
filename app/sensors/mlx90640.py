"""MLX90640 thermal sensor interface (real hardware).

Reads actual 32x24 thermal frames from an MLX90640 over I2C. No simulated or
random values are produced. If the sensor or required drivers are unavailable,
the module reports a disconnected/unavailable status with a clear error.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, asdict
from typing import Any, Optional

from app.config import (
    MLX90640_ENABLED,
    MLX90640_I2C_ADDRESS,
    MLX90640_I2C_BUS,
    MLX90640_REFRESH_HZ,
    THERMAL_FRAME_HEIGHT,
    THERMAL_FRAME_WIDTH,
)


@dataclass
class SensorStatus:
    connected: bool
    sensor: str = "MLX90640"
    bus: int = MLX90640_I2C_BUS
    address: int = MLX90640_I2C_ADDRESS
    refresh_hz: Optional[int] = None
    last_read_ts: Optional[float] = None
    frames_read: int = 0
    error: Optional[str] = None
    driver: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["address_hex"] = hex(self.address)
        return d


@dataclass
class ThermalFrame:
    width: int
    height: int
    pixels_c: list[float]  # row-major, length width*height
    min_c: float
    max_c: float
    avg_c: float
    timestamp: float


class MLX90640Sensor:
    CONNECT_RETRY_INTERVAL_S = 5.0
    READ_FAILURES_BEFORE_DISCONNECT = 3

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._mlx = None
        self._frame_buf = [0.0] * (THERMAL_FRAME_WIDTH * THERMAL_FRAME_HEIGHT)
        self._status = SensorStatus(connected=False, refresh_hz=MLX90640_REFRESH_HZ if MLX90640_ENABLED else None)
        self._last_frame: Optional[ThermalFrame] = None
        self._state: str = "initializing"  # initializing | connected | disconnected
        self._last_connect_attempt_ts: float = 0.0
        self._consecutive_read_failures: int = 0
        self._last_error_stable: Optional[str] = None

    @property
    def status(self) -> SensorStatus:
        with self._lock:
            return SensorStatus(**asdict(self._status))

    @property
    def sensor_state(self) -> str:
        with self._lock:
            return self._state

    @property
    def last_frame(self) -> Optional[ThermalFrame]:
        with self._lock:
            return self._last_frame

    def connect(self, force: bool = False) -> SensorStatus:
        with self._lock:
            now = time.time()
            if not force and (now - self._last_connect_attempt_ts) < self.CONNECT_RETRY_INTERVAL_S and self._mlx is None:
                return self.status
            self._last_connect_attempt_ts = now

            if not MLX90640_ENABLED:
                self._mlx = None
                self._status.connected = False
                self._status.error = "MLX90640 disabled by configuration"
                self._state = "disconnected"
                return self.status

            # Try CircuitPython/blinka driver first (common on Raspberry Pi)
            try:
                import board  # type: ignore
                import busio  # type: ignore
                import adafruit_mlx90640  # type: ignore

                i2c = busio.I2C(board.SCL, board.SDA, frequency=400000)
                mlx = adafruit_mlx90640.MLX90640(i2c, address=MLX90640_I2C_ADDRESS)
                refresh = self._coerce_refresh_rate(adafruit_mlx90640, MLX90640_REFRESH_HZ)
                if refresh is not None:
                    mlx.refresh_rate = refresh
                self._mlx = mlx
                self._status.connected = True
                self._status.error = None
                self._status.driver = "adafruit-circuitpython-mlx90640"
                self._status.refresh_hz = MLX90640_REFRESH_HZ
                self._state = "connected"
                self._consecutive_read_failures = 0
                return self.status
            except Exception as e1:
                err1 = f"adafruit_mlx90640 unavailable/failed: {e1}"

            # Try mlx90640/smbus-style driver fallback
            try:
                import mlx90640  # type: ignore

                mlx = mlx90640.Mlx90640(MLX90640_I2C_BUS, MLX90640_I2C_ADDRESS, MLX90640_REFRESH_HZ)
                try:
                    mlx.init()
                except Exception:
                    pass
                self._mlx = mlx
                self._status.connected = True
                self._status.error = None
                self._status.driver = "mlx90640"
                self._status.refresh_hz = MLX90640_REFRESH_HZ
                self._state = "connected"
                self._consecutive_read_failures = 0
                return self.status
            except Exception as e2:
                self._mlx = None
                self._status.connected = False
                self._status.driver = None
                self._status.error = f"{err1}; mlx90640 unavailable/failed: {e2}"
                # Remain initializing during early/retry phase until clearly unavailable over time
                if self._status.frames_read == 0 and self._state != "disconnected":
                    self._state = "initializing"
                else:
                    self._state = "disconnected"
                return self.status

    @staticmethod
    def _coerce_refresh_rate(module: Any, hz: int):
        name = f"REFRESH_{hz}_HZ"
        return getattr(module, name, None)

    def read_frame(self) -> Optional[ThermalFrame]:
        with self._lock:
            if self._mlx is None or not self._status.connected:
                # Attempt reconnect with cooldown; keep state stable between attempts
                self.connect(force=False)
                if self._mlx is None or not self._status.connected:
                    # If we have never successfully read a frame, treat as initializing/disconnected per connect()
                    if self._status.frames_read == 0 and self._state != "disconnected":
                        self._state = "initializing"
                    return None

            buf = list(self._frame_buf)
            try:
                # adafruit_mlx90640: getFrame(frame)
                if hasattr(self._mlx, "getFrame"):
                    self._mlx.getFrame(buf)
                # some drivers use get_frame / read_frame
                elif hasattr(self._mlx, "get_frame"):
                    data = self._mlx.get_frame()
                    if data:
                        buf = list(data)
                elif hasattr(self._mlx, "read_frame"):
                    data = self._mlx.read_frame()
                    if data:
                        buf = list(data)
                else:
                    raise RuntimeError("No supported frame read method on MLX90640 driver object")

                if len(buf) != THERMAL_FRAME_WIDTH * THERMAL_FRAME_HEIGHT:
                    raise ValueError(f"Unexpected frame length: {len(buf)}")

                pixels = [float(v) for v in buf]
                valid = [v for v in pixels if -40.0 <= v <= 300.0]
                if not valid:
                    raise ValueError("Frame contains no valid temperature values")

                frame = ThermalFrame(
                    width=THERMAL_FRAME_WIDTH,
                    height=THERMAL_FRAME_HEIGHT,
                    pixels_c=pixels,
                    min_c=min(valid),
                    max_c=max(valid),
                    avg_c=sum(valid) / len(valid),
                    timestamp=time.time(),
                )
                self._frame_buf = buf
                self._last_frame = frame
                self._status.last_read_ts = frame.timestamp
                self._status.frames_read += 1
                self._status.connected = True
                self._status.error = None
                self._state = "connected"
                self._consecutive_read_failures = 0
                return frame
            except Exception as e:
                self._consecutive_read_failures += 1
                # Avoid flapping on transient read errors: keep connected state/frame briefly
                if self._last_frame is not None and self._consecutive_read_failures < self.READ_FAILURES_BEFORE_DISCONNECT:
                    self._status.connected = True
                    self._state = "connected"
                    self._status.error = "Temporary read issue; showing last valid frame"
                    return None
                self._mlx = None
                self._status.connected = False
                self._status.error = f"Read failed: {e}"
                self._state = "disconnected" if self._status.frames_read > 0 else "initializing"
                return None

    def disconnect(self) -> None:
        with self._lock:
            self._mlx = None
            self._status.connected = False
            self._state = "disconnected"
            if not self._status.error:
                self._status.error = "Disconnected"
