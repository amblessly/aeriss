"""Real LoRa transmitter implementation for SX127x-compatible modules (e.g. LoRa 02).

This module performs actual SPI register configuration and packet transmission
when supported hardware libraries and wiring are available on Raspberry Pi.
No UDP simulation, random RSSI/SNR fabrication, or fake success reporting is
used. If hardware is unavailable, operations fail with explicit errors/status.

NOTE: LoRa 02 module variants differ (chipset/frequency/pins). Configuration in
app/config.py must match the actual module and wiring and be verified on-device.
"""
from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, asdict
from typing import Any, Optional

from app.config import (
    LORA_BANDWIDTH_HZ,
    LORA_CODING_RATE,
    LORA_ENABLE_CRC,
    LORA_ENABLED,
    LORA_FREQUENCY_MHZ,
    LORA_PIN_DIO0,
    LORA_PIN_NSS,
    LORA_PIN_RESET,
    LORA_PREAMBLE_LENGTH,
    LORA_SPREADING_FACTOR,
    LORA_SPI_BUS,
    LORA_SPI_DEVICE,
    LORA_SPI_SPEED_HZ,
    LORA_SYNC_WORD,
    LORA_TX_POWER_DBM,
)

# SX127x register map (common subset)
REG_FIFO = 0x00
REG_OP_MODE = 0x01
REG_FRF_MSB = 0x06
REG_FRF_MID = 0x07
REG_FRF_LSB = 0x08
REG_PA_CONFIG = 0x09
REG_FIFO_ADDR_PTR = 0x0D
REG_FIFO_TX_BASE_ADDR = 0x0E
REG_FIFO_RX_BASE_ADDR = 0x0F
REG_IRQ_FLAGS = 0x12
REG_RX_NB_BYTES = 0x13
REG_PKT_SNR_VALUE = 0x19
REG_PKT_RSSI_VALUE = 0x1A
REG_MODEM_CONFIG_1 = 0x1D
REG_MODEM_CONFIG_2 = 0x1E
REG_PREAMBLE_MSB = 0x20
REG_PREAMBLE_LSB = 0x21
REG_PAYLOAD_LENGTH = 0x22
REG_MODEM_CONFIG_3 = 0x26
REG_SYNC_WORD = 0x39
REG_DIO_MAPPING_1 = 0x40
REG_VERSION = 0x42
REG_PA_DAC = 0x4D

MODE_LONG_RANGE_MODE = 0x80
MODE_SLEEP = 0x00
MODE_STDBY = 0x01
MODE_TX = 0x03
MODE_RX_CONTINUOUS = 0x05

IRQ_TX_DONE_MASK = 0x08
IRQ_RX_DONE_MASK = 0x40
IRQ_PAYLOAD_CRC_ERROR_MASK = 0x20

BW_MAP = {
    7800: 0b0000, 10400: 0b0001, 15600: 0b0010, 20800: 0b0011,
    31250: 0b0100, 41700: 0b0101, 62500: 0b0110, 125000: 0b0111,
    250000: 0b1000, 500000: 0b1001,
}


@dataclass
class LoRaStatus:
    enabled: bool
    initialized: bool
    chipset_version: Optional[int] = None
    frequency_mhz: float = LORA_FREQUENCY_MHZ
    last_tx_ts: Optional[float] = None
    last_tx_ok: Optional[bool] = None
    last_error: Optional[str] = None
    packets_sent_ok: int = 0
    packets_sent_failed: int = 0
    last_rssi_dbm: Optional[float] = None  # only from actual RX/IRQ-derived reads when available
    last_snr_db: Optional[float] = None
    # Configured parameters (from system/app config; require hardware verification)
    mode: str = "transmitter"
    spreading_factor: int = LORA_SPREADING_FACTOR
    bandwidth_hz: int = LORA_BANDWIDTH_HZ
    coding_rate: int = LORA_CODING_RATE
    tx_power_dbm: Optional[int] = LORA_TX_POWER_DBM

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if d.get("chipset_version") is not None:
            d["chipset_version_hex"] = hex(d["chipset_version"])
        cr = d.get("coding_rate")
        if isinstance(cr, int):
            d["coding_rate_str"] = f"4/{cr}" if 5 <= cr <= 8 else str(cr)
        bw = d.get("bandwidth_hz")
        if isinstance(bw, int):
            d["bandwidth_khz"] = bw / 1000.0
        return d


class LoRaTransmitter:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._spi = None
        self._gpio = None
        self._status = LoRaStatus(enabled=LORA_ENABLED, initialized=False)
        self._seq = 0

    @property
    def status(self) -> LoRaStatus:
        with self._lock:
            return LoRaStatus(**asdict(self._status))

    def _write_reg(self, addr: int, value: int) -> None:
        self._spi.xfer2([addr | 0x80, value & 0xFF])

    def _read_reg(self, addr: int) -> int:
        res = self._spi.xfer2([addr & 0x7F, 0x00])
        return res[1]

    def _reset(self) -> None:
        GPIO = self._gpio
        GPIO.output(LORA_PIN_RESET, GPIO.LOW)
        time.sleep(0.01)
        GPIO.output(LORA_PIN_RESET, GPIO.HIGH)
        time.sleep(0.01)

    def init(self) -> LoRaStatus:
        with self._lock:
            if not LORA_ENABLED:
                self._status.initialized = False
                self._status.last_error = "LoRa disabled by configuration"
                return self.status
            try:
                import spidev  # type: ignore
                import RPi.GPIO as GPIO  # type: ignore

                self._gpio = GPIO
                GPIO.setwarnings(False)
                try:
                    GPIO.setmode(GPIO.BCM)
                except Exception:
                    pass
                GPIO.setup(LORA_PIN_RESET, GPIO.OUT)
                GPIO.setup(LORA_PIN_DIO0, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

                spi = spidev.SpiDev()
                spi.open(LORA_SPI_BUS, LORA_SPI_DEVICE)
                spi.max_speed_hz = LORA_SPI_SPEED_HZ
                spi.mode = 0
                self._spi = spi

                self._reset()
                version = self._read_reg(REG_VERSION)
                self._status.chipset_version = version
                # Common SX127x version is 0x12; reject clearly invalid reads
                if version in (0x00, 0xFF):
                    raise RuntimeError(f"Unexpected LoRa chipset version register value: {hex(version)}. Check wiring/SPI/pins/module.")

                # Sleep -> LoRa mode
                self._write_reg(REG_OP_MODE, MODE_SLEEP)
                time.sleep(0.01)
                self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_SLEEP)
                time.sleep(0.01)

                # Frequency
                frf = int((LORA_FREQUENCY_MHZ * 1_000_000.0) / 61.03515625)
                self._write_reg(REG_FRF_MSB, (frf >> 16) & 0xFF)
                self._write_reg(REG_FRF_MID, (frf >> 8) & 0xFF)
                self._write_reg(REG_FRF_LSB, frf & 0xFF)

                # Power (PA_BOOST)
                pa = 0x80 | max(0, min(15, LORA_TX_POWER_DBM - 2))
                self._write_reg(REG_PA_CONFIG, pa)
                self._write_reg(REG_PA_DAC, 0x84 if LORA_TX_POWER_DBM > 17 else 0x84)

                # FIFO base
                self._write_reg(REG_FIFO_TX_BASE_ADDR, 0x00)
                self._write_reg(REG_FIFO_RX_BASE_ADDR, 0x00)

                bw_bits = BW_MAP.get(LORA_BANDWIDTH_HZ, 0b0111)
                cr_bits = (max(5, min(8, LORA_CODING_RATE)) - 4) & 0x07
                implicit = 0
                config1 = (bw_bits << 4) | (cr_bits << 1) | implicit
                self._write_reg(REG_MODEM_CONFIG_1, config1)

                sf = max(6, min(12, LORA_SPREADING_FACTOR)) & 0x0F
                crc_on = 1 if LORA_ENABLE_CRC else 0
                config2 = (sf << 4) | (crc_on << 2)
                self._write_reg(REG_MODEM_CONFIG_2, config2)
                if sf == 6:
                    self._write_reg(REG_MODEM_CONFIG_3, 0x0C)
                else:
                    self._write_reg(REG_MODEM_CONFIG_3, 0x04)  # AGC auto on

                self._write_reg(REG_PREAMBLE_MSB, (LORA_PREAMBLE_LENGTH >> 8) & 0xFF)
                self._write_reg(REG_PREAMBLE_LSB, LORA_PREAMBLE_LENGTH & 0xFF)
                self._write_reg(REG_SYNC_WORD, LORA_SYNC_WORD & 0xFF)
                self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_STDBY)

                self._status.initialized = True
                self._status.last_error = None
                self._status.frequency_mhz = LORA_FREQUENCY_MHZ
                return self.status
            except Exception as e:
                self._status.initialized = False
                self._status.last_error = f"LoRa init failed (verify chipset/pins/frequency/wiring): {e}"
                try:
                    if self._spi:
                        self._spi.close()
                except Exception:
                    pass
                self._spi = None
                return self.status

    def _next_seq(self) -> int:
        self._seq = (self._seq + 1) & 0xFFFFFFFF
        return self._seq

    def send_packet(self, payload: dict[str, Any], timeout_s: float = 5.0) -> tuple[bool, dict[str, Any]]:
        """Transmit one JSON telemetry packet. Returns (ok, tx_meta). No fake RSSI/SNR."""
        with self._lock:
            meta: dict[str, Any] = {
                "timestamp": time.time(),
                "seq": None,
                "bytes": 0,
                "ok": False,
                "error": None,
            }
            if not LORA_ENABLED:
                meta["error"] = "LoRa disabled by configuration"
                self._status.last_error = meta["error"]
                self._status.last_tx_ok = False
                self._status.packets_sent_failed += 1
                return False, meta
            if not self._status.initialized or self._spi is None or self._gpio is None:
                self.init()
            if not self._status.initialized or self._spi is None:
                meta["error"] = self._status.last_error or "LoRa not initialized"
                self._status.last_tx_ok = False
                self._status.last_tx_ts = meta["timestamp"]
                self._status.packets_sent_failed += 1
                return False, meta

            try:
                seq = self._next_seq()
                meta["seq"] = seq
                body = dict(payload)
                body.setdefault("seq", seq)
                body.setdefault("ts", time.time())
                data = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
                if len(data) > 255:
                    data = data[:255]
                meta["bytes"] = len(data)

                # Standby, set FIFO ptr, write payload
                self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_STDBY)
                self._write_reg(REG_FIFO_ADDR_PTR, 0x00)
                for b in data:
                    self._write_reg(REG_FIFO, b)
                self._write_reg(REG_PAYLOAD_LENGTH, len(data))
                self._write_reg(REG_IRQ_FLAGS, 0xFF)  # clear flags
                self._write_reg(REG_DIO_MAPPING_1, 0x40)  # DIO0=TxDone
                self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_TX)

                start = time.time()
                tx_done = False
                while (time.time() - start) < timeout_s:
                    if self._gpio.input(LORA_PIN_DIO0):
                        irq = self._read_reg(REG_IRQ_FLAGS)
                        if irq & IRQ_TX_DONE_MASK:
                            self._write_reg(REG_IRQ_FLAGS, IRQ_TX_DONE_MASK)
                            tx_done = True
                            break
                    else:
                        # also poll IRQ flags in case DIO0 mapping/wiring differs
                        irq = self._read_reg(REG_IRQ_FLAGS)
                        if irq & IRQ_TX_DONE_MASK:
                            self._write_reg(REG_IRQ_FLAGS, IRQ_TX_DONE_MASK)
                            tx_done = True
                            break
                    time.sleep(0.01)

                self._write_reg(REG_OP_MODE, MODE_LONG_RANGE_MODE | MODE_STDBY)
                if not tx_done:
                    raise TimeoutError("TX done not observed (no confirmed transmission)")

                meta["ok"] = True
                self._status.last_tx_ok = True
                self._status.last_tx_ts = meta["timestamp"]
                self._status.last_error = None
                self._status.packets_sent_ok += 1
                return True, meta
            except Exception as e:
                meta["error"] = str(e)
                meta["ok"] = False
                self._status.last_tx_ok = False
                self._status.last_tx_ts = meta["timestamp"]
                self._status.last_error = str(e)
                self._status.packets_sent_failed += 1
                # mark uninitialized on likely transport/hardware failure
                self._status.initialized = False
                try:
                    if self._spi:
                        self._spi.close()
                except Exception:
                    pass
                self._spi = None
                return False, meta

    def close(self) -> None:
        with self._lock:
            try:
                if self._spi:
                    self._spi.close()
            except Exception:
                pass
            self._spi = None
            self._status.initialized = False
