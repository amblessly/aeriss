"""Local SQLite storage for real sensor readings and detection events."""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any, Optional

from app.config import DATABASE_PATH


class Database:
    def __init__(self, path: Path = DATABASE_PATH) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS thermal_readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    sensor_connected INTEGER NOT NULL,
                    min_c REAL,
                    max_c REAL,
                    avg_c REAL,
                    frame_json TEXT,
                    status_json TEXT
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS detection_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    person_detected INTEGER NOT NULL,
                    detection_type TEXT,
                    confidence REAL,
                    hot_pixels INTEGER,
                    min_c REAL,
                    max_c REAL,
                    avg_c REAL,
                    details_json TEXT
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS lora_transmissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    seq INTEGER,
                    ok INTEGER NOT NULL,
                    bytes INTEGER,
                    payload_json TEXT,
                    meta_json TEXT
                )
                """
            )

    def log_thermal_reading(self, ts: float, sensor_connected: bool, frame: Optional[dict], status: dict) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """INSERT INTO thermal_readings (ts, sensor_connected, min_c, max_c, avg_c, frame_json, status_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    ts,
                    1 if sensor_connected else 0,
                    frame.get("min_c") if frame else None,
                    frame.get("max_c") if frame else None,
                    frame.get("avg_c") if frame else None,
                    json.dumps(frame) if frame else None,
                    json.dumps(status),
                ),
            )

    def log_detection_event(self, ts: float, detection: dict) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """INSERT INTO detection_events (ts, person_detected, detection_type, confidence, hot_pixels, min_c, max_c, avg_c, details_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    ts,
                    1 if detection.get("person_detected") else 0,
                    detection.get("detection_type"),
                    detection.get("confidence"),
                    detection.get("hot_pixels"),
                    detection.get("min_c"),
                    detection.get("max_c"),
                    detection.get("avg_c"),
                    json.dumps(detection),
                ),
            )

    def log_lora_transmission(self, ts: float, seq: Optional[int], ok: bool, bytes_count: int, payload: dict, meta: dict) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """INSERT INTO lora_transmissions (ts, seq, ok, bytes, payload_json, meta_json)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (ts, seq, 1 if ok else 0, bytes_count, json.dumps(payload), json.dumps(meta)),
            )

    def recent_detections(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            cur = self._conn.execute(
                "SELECT * FROM detection_events ORDER BY id DESC LIMIT ?", (limit,)
            )
            rows = cur.fetchall()
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "ts": r["ts"],
                "person_detected": bool(r["person_detected"]),
                "detection_type": r["detection_type"],
                "confidence": r["confidence"],
                "hot_pixels": r["hot_pixels"],
                "min_c": r["min_c"],
                "max_c": r["max_c"],
                "avg_c": r["avg_c"],
                "details": json.loads(r["details_json"]) if r["details_json"] else None,
            })
        return result

    def close(self) -> None:
        with self._lock:
            self._conn.close()
