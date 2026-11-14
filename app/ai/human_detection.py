"""Thermal human-presence detection wrapper.

Uses real MLX90640 thermal frame analysis. This does not claim biometric human
identification; it reports thermal presence based on configured heuristics.
"""
from __future__ import annotations

from typing import Optional

from app.sensors.mlx90640 import ThermalFrame
from app.sensors.thermal_processing import ThermalAnalysis, analyze_frame


def detect_human_presence(frame: Optional[ThermalFrame]) -> dict:
    if frame is None:
        return {
            "available": False,
            "person_detected": False,
            "detection_type": "unavailable",
            "confidence": 0.0,
            "reason": "No thermal frame available (sensor disconnected or read failed)",
        }
    analysis: ThermalAnalysis = analyze_frame(frame)
    result = analysis.to_dict()
    result["available"] = True
    return result
