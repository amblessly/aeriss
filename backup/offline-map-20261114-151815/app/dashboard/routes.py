"""FastAPI server: serves existing AERIS website and provides real-time APIs."""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import (
    DASHBOARD_URL,
    DEVICE_ID,
    DEVICE_NAME,
    HOST,
    HOTSPOT_IP,
    HOTSPOT_PASSWORD_CONFIGURED,
    HOTSPOT_SSID,
    PORT,
    WEBSITE_DIR,
)
from app.services.data_manager import DataManager

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


@app.on_event("shutdown")
async def on_shutdown() -> None:
    manager.stop()


@app.get("/api/status")
async def api_status() -> dict[str, Any]:
    return manager.get_state()


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
    uvicorn.run("app.dashboard.routes:app", host=HOST, port=PORT, reload=False)
