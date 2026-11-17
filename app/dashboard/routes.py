"""FastAPI server: serves existing AERIS website and provides real-time APIs."""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app.config import (
    DASHBOARD_URL,
    DEVICE_ID,
    DEVICE_NAME,
    HOST,
    HOTSPOT_IP,
    HOTSPOT_SSID,
    MAP_ATTRIBUTION,
    MAP_DEFAULT_LAT,
    MAP_DEFAULT_LNG,
    MAP_DEFAULT_ZOOM,
    MAP_FONTS_DIR,
    MAP_MAX_ZOOM,
    MAP_MIN_ZOOM,
    MAP_PMTILES_HQ_PATH,
    MAP_PMTILES_PATH,
    PORT,
    SSL_CERTFILE,
    SSL_KEYFILE,
    WEBSITE_DIR,
)
from app.services.data_manager import DataManager
from app.services.gps_source import gps_status, start_gps_source

manager = DataManager()

app = FastAPI(title="AERIS Local Server", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _map_detection_event(ev: dict[str, Any]) -> dict[str, Any] | None:
    details = ev.get("details") or {}
    if not ev.get("person_detected"):
        return None
    ts = ev.get("ts") or time.time()
    return {
        "id": f"DET-{int(ev.get('id', 0))}-{int(ts)}",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts)),
        "confidence": round(float(ev.get("confidence") or 0.0) * 100.0, 1),
        "lat": None,
        "lng": None,
        "altitude": None,
        "distance": None,
        "status": "new",
        "detection_type": ev.get("detection_type") or details.get("detection_type"),
        "hot_pixels": ev.get("hot_pixels") or details.get("hot_pixels"),
        "thermal": {
            "min_c": ev.get("min_c"),
            "max_c": ev.get("max_c"),
            "avg_c": ev.get("avg_c"),
        },
        "source": "mlx90640",
    }


def _legacy_compat_messages(state: dict[str, Any]) -> list[dict[str, Any]]:
    msgs: list[dict[str, Any]] = []
    # Telemetry-like message: only real/known values; unavailable hardware fields are null
    msgs.append({
        "type": "telemetry",
        "source": "aeris-local",
        "timestamp": state.get("timestamp"),
        "altitude": None,
        "speed": None,
        "heading": None,
        "battery": None,
        "lat": None,
        "lng": None,
        "sensor_connected": bool((state.get("sensor") or {}).get("connected")),
        "thermal": state.get("thermal"),
        "detection": state.get("detection"),
        "lora": state.get("lora"),
        "network": state.get("network"),
        "device": state.get("device"),
    })
    # Latest detection event as legacy detection message if present
    det = state.get("detection") or {}
    if det.get("available") and det.get("person_detected"):
        msgs.append({
            "type": "detection",
            "id": f"THERM-{int(time.time())}",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(state.get("timestamp", time.time()))),
            "confidence": round(float(det.get("confidence") or 0.0) * 100.0, 1),
            "lat": None,
            "lng": None,
            "altitude": None,
            "distance": None,
            "detection_type": det.get("detection_type"),
            "thermal": {
                "min_c": det.get("min_c"),
                "max_c": det.get("max_c"),
                "avg_c": det.get("avg_c"),
            },
            "source": "mlx90640",
            "status": "new",
        })
    return msgs


@app.on_event("startup")
async def on_startup() -> None:
    loop = asyncio.get_running_loop()
    manager.set_loop(loop)
    manager.start()
    # Bring up the local serial GNSS reader (no-op unless a receiver is attached).
    start_gps_source()


@app.on_event("shutdown")
async def on_shutdown() -> None:
    manager.stop()


@app.get("/api/status")
async def api_status() -> dict[str, Any]:
    return manager.get_state()


@app.get("/api/location/local")
async def api_location_local() -> dict[str, Any]:
    """Latest fix from the local serial GNSS receiver (USB GPS/gnss dongle, NMEA 0183).

    Fully offline: coordinates come from satellite fixes computed by the receiver,
    never from internet/IP geolocation or cloud APIs. `fix` is null until a real,
    valid fix has been received; `fresh` is false once the fix is older than the
    configured freshness window. Use the coordinates only as a live position when
    `fresh` is true; otherwise they are a clearly-labeled last-known position.
    """
    return gps_status()


@app.get("/api/system")
async def api_system() -> dict[str, Any]:
    state = manager.get_state()
    return {
        "device": state.get("device"),
        "network": state.get("network"),
        "wifi": state.get("wifi"),
        "sensor": state.get("sensor"),
        "lora": state.get("lora"),
        "timestamp": state.get("timestamp"),
    }


@app.get("/api/connection/info")
async def api_connection_info() -> dict[str, Any]:
    """Local dashboard connection/config info. Password is never included in public/system state APIs."""
    state = manager.get_state()
    wifi = state.get("wifi") or {}
    return {
        "wifi": {
            "ssid": wifi.get("ssid"),
            "target_ssid": wifi.get("target_ssid") or HOTSPOT_SSID,
            "ip": wifi.get("ip"),
            "target_ip": wifi.get("target_ip") or HOTSPOT_IP,
            "state": wifi.get("state"),
            "active": wifi.get("active"),
            "interface": wifi.get("interface"),
            "mode": wifi.get("mode"),
            "connected_clients": wifi.get("connected_clients"),
            "clients_count_available": wifi.get("clients_count_available"),
            "laptop_connection_state": wifi.get("laptop_connection_state"),
            "operation_mode": wifi.get("operation_mode"),
            "hosting_ap": wifi.get("hosting_ap"),
            "verified": wifi.get("verified"),
            "stale": wifi.get("stale"),
            "details": wifi.get("details"),
        },
        "lora": state.get("lora"),
        "timestamp": state.get("timestamp"),
    }


@app.get("/api/connection/wifi-secret")
async def api_connection_wifi_secret() -> JSONResponse:
    """Wi-Fi credentials are never exposed via frontend/public API responses."""
    return JSONResponse({"error": "not_available", "message": "Wi-Fi credentials are not exposed via API"}, status_code=404)


@app.get("/api/thermal/latest")
async def api_thermal_latest() -> dict[str, Any]:
    state = manager.get_state()
    return {
        "sensor": state.get("sensor"),
        "thermal": state.get("thermal"),
        "detection": state.get("detection"),
        "timestamp": state.get("timestamp"),
    }


@app.get("/api/detections")
async def api_detections() -> dict[str, Any]:
    state = manager.get_state()
    events = state.get("recent_detections") or []
    mapped = []
    for ev in events:
        m = _map_detection_event(ev)
        if m:
            mapped.append(m)
    return {"detections": mapped, "count": len(mapped), "source": "local_storage"}


@app.get("/api/mission")
async def api_mission() -> dict[str, Any]:
    state = manager.get_state()
    sensor = state.get("sensor") or {}
    return {
        "id": "local-mission",
        "name": f"{DEVICE_NAME} Local Monitoring",
        "status": "active" if sensor.get("connected") else "degraded",
        "startedAt": None,
        "device": DEVICE_ID,
        "hotspot": {"ssid": HOTSPOT_SSID, "ip": HOTSPOT_IP},
    }


@app.post("/api/detection")
async def api_post_detection(_: dict[str, Any]) -> JSONResponse:
    # External injection disabled in hardware-data-only mode
    return JSONResponse({"status": "rejected", "reason": "External/simulated detections are not accepted in production mode"}, status_code=403)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    q = await manager.subscribe()
    try:
        # send immediate snapshot
        state = manager.get_state()
        await websocket.send_text(json.dumps(state))
        for msg in _legacy_compat_messages(state):
            await websocket.send_text(json.dumps(msg))
        while True:
            # also drain any client messages (ignore) without blocking broadcasts
            recv_task = asyncio.create_task(websocket.receive_text())
            queue_task = asyncio.create_task(q.get())
            done, pending = await asyncio.wait({recv_task, queue_task}, return_when=asyncio.FIRST_COMPLETED)
            for p in pending:
                p.cancel()
            if recv_task in done:
                try:
                    _ = recv_task.result()
                except Exception:
                    pass
                # continue waiting for state
            if queue_task in done:
                state = queue_task.result()
                await websocket.send_text(json.dumps(state))
                for msg in _legacy_compat_messages(state):
                    await websocket.send_text(json.dumps(msg))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await manager.unsubscribe(q)


def _pmtiles_header(path: Path | None = None) -> dict[str, Any] | None:
    """Read the PMTiles v3 header for status reporting. Never loads the tile data."""
    import struct

    p = path if path is not None else MAP_PMTILES_PATH
    try:
        size = p.stat().st_size
        with open(p, "rb") as f:
            header = f.read(127)
        if len(header) < 127 or header[:7] != b"PMTiles":
            return None
        version = header[7]
        # v3 header: offsets/sizes are little-endian uint64; zoom bounds are uint8
        min_zoom = header[100]
        max_zoom = header[101]
        min_lon = struct.unpack_from("<i", header, 102)[0] / 1e7
        min_lat = struct.unpack_from("<i", header, 106)[0] / 1e7
        max_lon = struct.unpack_from("<i", header, 110)[0] / 1e7
        max_lat = struct.unpack_from("<i", header, 114)[0] / 1e7
        center_zoom = header[118]
        center_lng = struct.unpack_from("<i", header, 119)[0] / 1e7
        center_lat = struct.unpack_from("<i", header, 123)[0] / 1e7
        bounds = (
            min_lon,
            min_lat,
            max_lon,
            max_lat,
        )  # west, south, east, north
        return {
            "version": version,
            "size_bytes": size,
            "min_zoom": min_zoom,
            "max_zoom": max_zoom,
            "center": {"lat": center_lat, "lng": center_lng, "zoom": center_zoom},
            "bounds": list(bounds),
        }
    except Exception:
        return None


def _effective_pmtiles() -> tuple[Path, dict[str, Any] | None, str]:
    """Pick the archive to serve: the Maragondon high-zoom archive (z0–17) when present and
    valid, otherwise the nationwide z0–15 archive. Never modifies either file."""
    try:
        if MAP_PMTILES_HQ_PATH.is_file() and MAP_PMTILES_HQ_PATH.stat().st_size > 0:
            h = _pmtiles_header(MAP_PMTILES_HQ_PATH)
            if h is not None:
                return MAP_PMTILES_HQ_PATH, h, "highzoom"
    except Exception:
        pass
    return MAP_PMTILES_PATH, _pmtiles_header(MAP_PMTILES_PATH), "nationwide"


def _offline_map_info() -> dict[str, Any]:
    pmtiles_path, header, map_source = _effective_pmtiles()  # HQ preferred, nationwide fallback
    ready = header is not None
    zoom_available = header is not None
    return {
        "ready": ready,
        "format": "pmtiles" if ready else "none",
        "pmtiles_path": str(pmtiles_path),
        "map_source": map_source if zoom_available else "none",
        "highzoom_available": map_source == "highzoom",
        "pmtiles_url": "/api/map/aeris.pmtiles",
        "style_url": "/api/map/style.json",
        "glyphs_url": "/api/map/fonts/{fontstack}/{range}.pbf",
        "attribution": MAP_ATTRIBUTION,
        "min_zoom": header["min_zoom"] if zoom_available else MAP_MIN_ZOOM,
        "max_zoom": header["max_zoom"] if zoom_available else MAP_MAX_ZOOM,
        "default_zoom": MAP_DEFAULT_ZOOM,
        "default_center": {
            "lat": MAP_DEFAULT_LAT,
            "lng": MAP_DEFAULT_LNG,
            "zoom": MAP_DEFAULT_ZOOM,
        },
        "bounds": header["bounds"] if zoom_available else None,  # west,south,east,north
        "size_bytes": header["size_bytes"] if zoom_available else None,
        "name": "AERIS offline vector tile archive (OpenStreetMap)",
        "satellite_available": False,
        "offline_only": True,
    }


@app.get("/api/map/status")
async def api_map_status() -> dict[str, Any]:
    return _offline_map_info()


@app.get("/api/map/style.json")
async def api_map_style():
    # Single source of truth: the same style file the frontend build ships.
    candidates = [
        WEBSITE_DIR / "public" / "map" / "style.json",
        WEBSITE_DIR / "dist" / "map" / "style.json",
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            return FileResponse(str(p), media_type="application/json", headers={"Cache-Control": "no-cache"})
    return JSONResponse({"error": "style_not_found"}, status_code=404)


_RANGE_RE = __import__("re").compile(r"bytes=(\d*)-(\d*)")


@app.get("/api/map/aeris.pmtiles")
async def api_map_pmtiles(request: Request):
    """Stream the effective PMTiles archive with HTTP Range support (required by the pmtiles protocol)."""
    p = _effective_pmtiles()[0]
    if not p.exists() or not p.is_file() or p.stat().st_size == 0:
        return JSONResponse({"error": "pmtiles_not_found"}, status_code=404)

    size = p.stat().st_size
    base_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
        "Content-Type": "application/vnd.pmtiles",
    }

    range_header = request.headers.get("range")
    start, end = 0, size - 1
    partial = False
    if range_header:
        m = _RANGE_RE.match(range_header.strip())
        if m:
            a, b = m.group(1), m.group(2)
            if a == "" and b != "":  # suffix range: last N bytes
                n = int(b)
                start = max(size - n, 0)
                end = size - 1
            else:
                start = int(a) if a else 0
                end = int(b) if b else size - 1
            start = max(start, 0)
            end = min(end, size - 1)
            if start > end:
                return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
            partial = True

    length = end - start + 1

    def iterfile(chunk: int = 1024 * 512):
        with open(p, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                data = f.read(min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {**base_headers, "Content-Length": str(length)}
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        return StreamingResponse(iterfile(), status_code=206, media_type="application/vnd.pmtiles", headers=headers)
    return StreamingResponse(iterfile(), status_code=200, media_type="application/vnd.pmtiles", headers=headers)


_FONT_RANGE_RE = __import__("re").compile(r"^(\d+)-(\d+)\.pbf$")


@app.get("/api/map/fonts/{fontstack:path}/{range_name}")
async def api_map_font(fontstack: str, range_name: str):
    base = MAP_FONTS_DIR.resolve()
    try:
        stack_dir = (base / fontstack).resolve()
    except Exception:
        return JSONResponse({"error": "invalid_fontstack"}, status_code=400)
    if stack_dir == base or base not in stack_dir.parents:
        # fontstack must stay inside fonts dir; also forbid nested weird paths beyond one level
        return JSONResponse({"error": "invalid_fontstack"}, status_code=400)
    if not _FONT_RANGE_RE.match(range_name):
        return JSONResponse({"error": "invalid_range"}, status_code=400)
    font_file = stack_dir / range_name
    if not font_file.is_file():
        return JSONResponse({"error": "glyph_not_found"}, status_code=404)
    return FileResponse(
        str(font_file),
        media_type="application/x-protobuf",
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )




# Serve existing AERIS website (Vite build output preferred)
DIST_DIR = WEBSITE_DIR / "dist"
ASSETS_DIR = DIST_DIR / "assets"
PUBLIC_DIR = WEBSITE_DIR / "public"

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")
if PUBLIC_DIR.exists():
    app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")

@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    # API/WS handled above; serve static files or SPA index
    if full_path.startswith("api") or full_path.startswith("ws"):
        return JSONResponse({"error": "Not found"}, status_code=404)
    # Try dist file
    if DIST_DIR.exists():
        candidate = (DIST_DIR / full_path).resolve()
        try:
            if str(candidate).startswith(str(DIST_DIR.resolve())) and candidate.is_file():
                return FileResponse(str(candidate))
        except Exception:
            pass
        index = DIST_DIR / "index.html"
        if index.exists():
            return FileResponse(str(index))
    # Fallback to dev index if present (assets won't be bundled)
    dev_index = WEBSITE_DIR / "index.html"
    if dev_index.exists():
        return FileResponse(str(dev_index))
    return JSONResponse({
        "status": "website_not_built",
        "message": "AERIS website build not found. Build website (npm run build in website/) or access dev server.",
        "dashboard_target": DASHBOARD_URL,
    }, status_code=503)


def run() -> None:
    import uvicorn
    kwargs = {"host": HOST, "port": PORT, "reload": False}
    if SSL_CERTFILE and SSL_KEYFILE:
        kwargs["ssl_certfile"] = SSL_CERTFILE
        kwargs["ssl_keyfile"] = SSL_KEYFILE
    uvicorn.run("app.dashboard.routes:app", **kwargs)
