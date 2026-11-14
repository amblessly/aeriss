"""Thermal frame processing and simple presence detection.

This module derives summary statistics and a thermal-presence indication from
actual MLX90640 frames. It does NOT perform human identification/classification
beyond reporting that a warm region consistent with presence was detected by a
threshold/blob heuristic.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Optional

from app.config import (
    THERMAL_MAX_VALID_C,
    THERMAL_MIN_VALID_C,
    THERMAL_PRESENCE_DELTA_C,
    THERMAL_PRESENCE_MIN_PIXELS,
)
from app.sensors.mlx90640 import ThermalFrame


@dataclass
class ThermalAnalysis:
    person_detected: bool
    detection_type: str  # "thermal_presence" | "none"
    confidence: float    # heuristic score 0..1 (not ML classification confidence)
    hot_pixels: int
    threshold_c: float
    min_c: float
    max_c: float
    avg_c: float
    warmest_centroid: Optional[dict[str, float]] = None
    note: str = "Thermal presence heuristic only; not human identification."

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def analyze_frame(frame: ThermalFrame) -> ThermalAnalysis:
    pixels = frame.pixels_c
    valid = [v for v in pixels if THERMAL_MIN_VALID_C <= v <= THERMAL_MAX_VALID_C]
    if not valid:
        return ThermalAnalysis(
            person_detected=False,
            detection_type="none",
            confidence=0.0,
            hot_pixels=0,
            threshold_c=0.0,
            min_c=frame.min_c,
            max_c=frame.max_c,
            avg_c=frame.avg_c,
            note="No valid thermal readings in frame.",
        )

    avg_c = sum(valid) / len(valid)
    # Adaptive threshold: presence if significantly warmer than ambient/scene avg
    threshold_c = avg_c + THERMAL_PRESENCE_DELTA_C

    hot_indices = [i for i, v in enumerate(pixels) if THERMAL_MIN_VALID_C <= v <= THERMAL_MAX_VALID_C and v >= threshold_c]
    hot_pixels = len(hot_indices)
    person_detected = hot_pixels >= THERMAL_PRESENCE_MIN_PIXELS

    confidence = 0.0
    centroid = None
    if hot_pixels > 0:
        # Heuristic score based on count and temperature margin (capped)
        margin = max(0.0, (max(pixels[i] for i in hot_indices) - threshold_c))
        count_score = min(1.0, hot_pixels / float(max(THERMAL_PRESENCE_MIN_PIXELS * 3, 1)))
        margin_score = min(1.0, margin / 6.0)
        confidence = round(max(0.0, min(1.0, 0.5 * count_score + 0.5 * margin_score)), 3)
        # centroid in image coordinates (x right, y down)
        sx = 0.0
        sy = 0.0
        for i in hot_indices:
            sx += (i % frame.width)
            sy += (i // frame.width)
        centroid = {
            "x": round(sx / hot_pixels, 2),
            "y": round(sy / hot_pixels, 2),
            "x_norm": round((sx / hot_pixels) / max(frame.width - 1, 1), 4),
            "y_norm": round((sy / hot_pixels) / max(frame.height - 1, 1), 4),
        }
        if not person_detected:
            confidence = min(confidence, 0.49)

    return ThermalAnalysis(
        person_detected=person_detected,
        detection_type="thermal_presence" if person_detected else "none",
        confidence=confidence if person_detected else 0.0,
        hot_pixels=hot_pixels,
        threshold_c=round(threshold_c, 2),
        min_c=round(min(valid), 2),
        max_c=round(max(valid), 2),
        avg_c=round(avg_c, 2),
        warmest_centroid=centroid,
    )


def frame_to_heatmap_values(frame: ThermalFrame) -> list[list[float]]:
    """Return 2D [height][width] temperature grid for visualization."""
    grid = []
    for y in range(frame.height):
        row = []
        base = y * frame.width
        for x in range(frame.width):
            row.append(round(float(frame.pixels_c[base + x]), 2))
        grid.append(row)
    return grid
