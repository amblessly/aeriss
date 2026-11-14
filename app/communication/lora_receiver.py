"""LoRa receiver placeholder/interface.

Real reception requires a compatible LoRa receiver module and wiring. This repo
environment may not have receiver hardware attached; this module provides a
status/reporting surface and can be extended for RX on supported hardware.

No fake packet reception, RSSI, or SNR values are generated.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Optional


@dataclass
class LoRaReceiverStatus:
    available: bool = False
    initialized: bool = False
    reason: str = "No compatible LoRa receiver configured/verified in this environment"
    last_rx_ts: Optional[float] = None
    packets_received: int = 0
    last_rssi_dbm: Optional[float] = None
    last_snr_db: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class LoRaReceiver:
    def __init__(self) -> None:
        self._status = LoRaReceiverStatus()

    @property
    def status(self) -> LoRaReceiverStatus:
        return LoRaReceiverStatus(**asdict(self._status))

    def start(self) -> LoRaReceiverStatus:
        # Real RX implementation depends on available receiver hardware/wiring.
        return self.status

    def stop(self) -> None:
        return None
