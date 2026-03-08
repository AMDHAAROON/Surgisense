# backend/server.py - SurgiSense Backend (Groq Vision + Inventory Reconciliation)
import asyncio
import time
import threading
import base64
import json
import urllib.request
import urllib.error
import cv2
import numpy as np
from collections import deque
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn
import sys, os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✓ .env file loaded")
except ImportError:
    pass

sys.path.insert(0, os.path.dirname(__file__))

app = FastAPI(title="SurgiSense Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Shared state ──────────────────────────────────────────────────────────────
latest_frame: bytes | None = None
latest_data:  dict         = {}
frame_lock  = threading.Lock()
data_lock   = threading.Lock()
ws_clients: list[WebSocket] = []
camera_active = threading.Event()


# ══════════════════════════════════════════════════════════════════════════════
#  GROQ VISION
# ══════════════════════════════════════════════════════════════════════════════
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GROQ_MODEL   = "meta-llama/llama-4-scout-17b-16e-instruct"
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"

SURGICAL_TOOLS = [
    "scalpel", "artery_forceps", "iris_scissors", "operating_scissors",
    "tweezers", "aspirator", "bending_shear", "circular_spoon",
    "core_needle", "fine_needle", "rongeur_forceps_1", "rongeur_forceps_2",
    "stripping", "wire_grabbing_pliers", "knife",
    "senn_retractor", "atilis_clamp", "kelly_forceps", "needle_holder",
    "tissue_forceps", "retractor", "clamp", "dissector",
]

GROQ_PROMPT = f"""You are a surgical tool detection system.
Look at the image and identify any surgical instrument visible.
Known tools: {", ".join(SURGICAL_TOOLS)}.

Respond ONLY in this exact format:
TOOL: <tool_name or none>
CONFIDENCE: <high, medium, or low>

Use exact tool names from the list. If no tool visible:
TOOL: none
CONFIDENCE: low"""


def _groq_post(payload_bytes: bytes) -> dict:
    """Shared Groq HTTP call using httpx (with urllib fallback)."""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
        "User-Agent":    "Mozilla/5.0",
        "Accept":        "application/json",
    }
    try:
        import httpx
        with httpx.Client(timeout=15) as client:
            resp = client.post(GROQ_URL, content=payload_bytes, headers=headers)
            resp.raise_for_status()
            return resp.json()
    except ImportError:
        req = urllib.request.Request(GROQ_URL, data=payload_bytes, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())


def call_groq_vision(frame: np.ndarray) -> dict | None:
    """Detect a single tool from a live frame."""
    if not GROQ_API_KEY:
        return None
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    image_b64 = base64.b64encode(buffer).decode("utf-8")
    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            {"type": "text",      "text": GROQ_PROMPT}
        ]}],
        "max_tokens": 60,
        "temperature": 0.1,
    }).encode("utf-8")
    try:
        result = _groq_post(payload)
        text = result["choices"][0]["message"]["content"].strip()
        tool_name = "none"
        confidence = "low"
        for line in text.splitlines():
            if line.startswith("TOOL:"):
                tool_name  = line.split(":", 1)[1].strip().lower().replace(" ", "_")
            if line.startswith("CONFIDENCE:"):
                confidence = line.split(":", 1)[1].strip().lower()
        if tool_name == "none" or tool_name not in SURGICAL_TOOLS:
            return None
        conf_score = {"high": 0.9, "medium": 0.65, "low": 0.4}.get(confidence, 0.5)
        return {"name": tool_name, "confidence": conf_score, "status": "detected"}
    except Exception as e:
        print(f"[Groq] Error: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  INVENTORY: Claude Vision for accurate bounding boxes + tool names
# ══════════════════════════════════════════════════════════════════════════════

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
CLAUDE_MODEL      = "claude-opus-4-5"

INVENTORY_CLAUDE_PROMPT = f"""You are a surgical instrument detection system.
Look at this image carefully and identify every surgical instrument visible.

For each instrument, provide a tight bounding box as normalized coordinates (0.0 to 1.0).
x1,y1 = top-left corner of the instrument, x2,y2 = bottom-right corner.
The box should tightly wrap just the instrument itself.

Known instruments: {", ".join(SURGICAL_TOOLS)}.

Respond ONLY as a JSON array, no other text:
[
  {{"name": "scalpel", "confidence": 0.9, "box": {{"x1": 0.1, "y1": 0.2, "x2": 0.25, "y2": 0.8}}}},
  ...
]

Use exact names from the known list. If no instruments visible, return empty array: []"""


def call_groq_inventory(image_b64: str) -> list:
    """
    Use Claude Vision for accurate bounding boxes + tool identification.
    Falls back to Groq if no Anthropic key is set.
    """
    if ANTHROPIC_API_KEY:
        return _claude_inventory(image_b64)
    elif GROQ_API_KEY:
        return _groq_inventory_fallback(image_b64)
    else:
        print("[Inventory] No API key found (ANTHROPIC_API_KEY or GROQ_API_KEY)")
        return []


def _claude_inventory(image_b64: str) -> list:
    """Use Claude claude-opus-4-5 to detect tools with accurate bounding boxes."""
    import urllib.request, urllib.error

    payload = json.dumps({
        "model": CLAUDE_MODEL,
        "max_tokens": 1024,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image_b64,
                    }
                },
                {
                    "type": "text",
                    "text": INVENTORY_CLAUDE_PROMPT
                }
            ]
        }]
    }).encode("utf-8")

    headers = {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type":      "application/json",
    }

    try:
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload, headers=headers, method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())

        raw = result["content"][0]["text"].strip()
        print(f"[Claude Inventory] Raw response: {raw[:300]}")

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        tools = json.loads(raw)
        if not isinstance(tools, list):
            print("[Claude Inventory] Response was not a list")
            return []

        # Validate and normalise each entry
        valid = []
        for t in tools:
            name = t.get("name", "").lower().replace(" ", "_")
            conf = float(t.get("confidence", 0.7))
            box  = t.get("box", {})
            if not box:
                continue
            x1, y1 = float(box.get("x1", 0)), float(box.get("y1", 0))
            x2, y2 = float(box.get("x2", 1)), float(box.get("y2", 1))
            # Clamp to [0,1]
            x1,y1,x2,y2 = max(0,x1), max(0,y1), min(1,x2), min(1,y2)
            if x2 <= x1 or y2 <= y1:
                continue
            valid.append({
                "name":       name,
                "confidence": conf,
                "box":        {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
            })
            print(f"[Claude Inventory] {name} ({conf:.0%}) → box({x1:.2f},{y1:.2f},{x2:.2f},{y2:.2f})")

        print(f"[Claude Inventory] {len(valid)} tools detected")
        return valid

    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[Claude Inventory] HTTP error {e.code}: {body[:300]}")
        return []
    except Exception as e:
        print(f"[Claude Inventory] Error: {e}")
        return []


def _groq_inventory_fallback(image_b64: str) -> list:
    """Fallback: Groq identifies tools (no reliable boxes)."""
    PROMPT = f"""You are a surgical instrument inventory system.
List every surgical instrument visible in this image.
Known instruments: {", ".join(SURGICAL_TOOLS)}.

Respond ONLY as a JSON array:
[{{"name": "scalpel", "confidence": 0.9, "box": {{"x1": 0.1, "y1": 0.2, "x2": 0.3, "y2": 0.8}}}}]

Estimate bounding boxes as best you can. Return [] if nothing visible."""

    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            {"type": "text", "text": PROMPT}
        ]}],
        "max_tokens": 800,
        "temperature": 0.1,
    }).encode("utf-8")

    try:
        result = _groq_post(payload)
        raw    = result["choices"][0]["message"]["content"].strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        tools = json.loads(raw.strip())
        return tools if isinstance(tools, list) else []
    except Exception as e:
        print(f"[Groq Inventory Fallback] Error: {e}")
        return []
    """
    Use OpenCV to find precise bounding boxes of surgical instruments on a tray.
    Tries multiple threshold strategies and picks the best result.
    Returns list of {"x1","y1","x2","y2"} in normalized 0-1 coords.
    """
    img_bytes = base64.b64decode(image_b64)
    arr       = np.frombuffer(img_bytes, dtype=np.uint8)
    img       = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        print("[OpenCV] ERROR: could not decode image")
        return []

    H, W = img.shape[:2]
    print(f"[OpenCV] Image size: {W}x{H}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    print(f"[OpenCV] Gray stats — min:{gray.min()} max:{gray.max()} mean:{gray.mean():.1f}")

    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    candidates = []

    # Strategy 1: Otsu global threshold
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    candidates.append(("Otsu", otsu))

    # Strategy 2: Adaptive small block
    adap_small = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, blockSize=21, C=6
    )
    candidates.append(("Adaptive-small", adap_small))

    # Strategy 3: Adaptive large block
    adap_large = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, blockSize=51, C=8
    )
    candidates.append(("Adaptive-large", adap_large))

    # Strategy 4: Canny edges dilated (catches shiny metallic tools)
    edges  = cv2.Canny(blur, 30, 100)
    kernel_e = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    canny  = cv2.dilate(edges, kernel_e, iterations=3)
    candidates.append(("Canny", canny))

    # Very permissive area: just exclude single-pixel noise and full-image blobs
    min_area = 200                  # at least 200px² (not noise)
    max_area = (W * H) * 0.90      # less than 90% of image

    # Proximity merge distance: only join fragments that are very close (same tool parts)
    prox_px  = int(min(W, H) * 0.015)   # ~1.5% — tight enough to not bridge separate tools

    best_boxes = []
    best_count = 0
    best_strat = "none"

    for strat_name, thresh in candidates:
        # Large kernel close to reconnect nearby fragments of the same tool
        kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        closed  = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel_close, iterations=3)
        dilated = cv2.dilate(closed, kernel_close, iterations=2)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        print(f"[OpenCV] {strat_name}: {len(contours)} raw contours")

        # Collect all boxes that pass the very permissive area filter
        boxes = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if not (min_area < area < max_area):
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            boxes.append({
                "x1": round(x / W, 4),
                "y1": round(y / H, 4),
                "x2": round((x + w) / W, 4),
                "y2": round((y + h) / H, 4),
            })

        print(f"[OpenCV] {strat_name}: {len(boxes)} boxes passed area filter")

        # First merge overlapping, then merge nearby (proximity)
        boxes = _merge_overlapping(boxes, iou_thresh=0.1)
        boxes = _merge_by_proximity(boxes, prox_px, W, H)
        boxes = _merge_overlapping(boxes, iou_thresh=0.1)  # second pass

        # Final filter: remove boxes too small to be a real tool
        final_min = (W * H) * 0.001
        boxes = [b for b in boxes
                 if (b["x2"]-b["x1"]) * W * (b["y2"]-b["y1"]) * H > final_min]

        print(f"[OpenCV] {strat_name}: {len(boxes)} boxes after merge+filter")

        if len(boxes) > best_count:
            best_count = len(boxes)
            best_boxes = boxes
            best_strat = strat_name

    if best_boxes:
        print(f"[OpenCV] Best strategy: {best_strat} → {len(best_boxes)} tools")
        for i, b in enumerate(best_boxes):
            w = round((b['x2']-b['x1'])*100, 1)
            h = round((b['y2']-b['y1'])*100, 1)
            print(f"  Box {i+1}: x1={b['x1']:.3f} y1={b['y1']:.3f} x2={b['x2']:.3f} y2={b['y2']:.3f}  ({w}% wide, {h}% tall)")
    else:
        print("[OpenCV] All strategies found 0 boxes — check image quality/lighting")

    return best_boxes


def _iou(a: dict, b: dict) -> float:
    """Intersection over Union for two normalized boxes."""
    ix1 = max(a["x1"], b["x1"]); iy1 = max(a["y1"], b["y1"])
    ix2 = min(a["x2"], b["x2"]); iy2 = min(a["y2"], b["y2"])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    area_a = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"])
    area_b = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
    return inter / (area_a + area_b - inter)


def _merge_overlapping(boxes: list[dict], iou_thresh: float = 0.3) -> list[dict]:
    """Greedy merge: if two boxes overlap > iou_thresh, combine into one."""
    merged = []
    used   = [False] * len(boxes)
    for i, a in enumerate(boxes):
        if used[i]:
            continue
        group = [a]
        for j, b in enumerate(boxes):
            if i != j and not used[j] and _iou(a, b) > iou_thresh:
                group.append(b)
                used[j] = True
        merged.append({
            "x1": min(g["x1"] for g in group),
            "y1": min(g["y1"] for g in group),
            "x2": max(g["x2"] for g in group),
            "y2": max(g["y2"] for g in group),
        })
        used[i] = True
    return merged


def _merge_by_proximity(boxes: list[dict], prox_px: int, W: int, H: int) -> list[dict]:
    """Merge boxes whose edges are within prox_px pixels — but never exceed 25% image width per box."""
    if not boxes:
        return boxes
    prox_x = prox_px / W
    prox_y = prox_px / H
    max_box_w = 0.30   # merged box must not exceed 30% of image width
    max_box_h = 0.90   # merged box must not exceed 90% of image height

    def are_close(a, b):
        h_close = a["x1"] - prox_x <= b["x2"] and b["x1"] - prox_x <= a["x2"]
        v_close = a["y1"] - prox_y <= b["y2"] and b["y1"] - prox_y <= a["y2"]
        return h_close and v_close

    def merged_box(group):
        return {
            "x1": min(g["x1"] for g in group),
            "y1": min(g["y1"] for g in group),
            "x2": max(g["x2"] for g in group),
            "y2": max(g["y2"] for g in group),
        }

    merged = []
    used   = [False] * len(boxes)
    for i, a in enumerate(boxes):
        if used[i]:
            continue
        group = [a]
        changed = True
        while changed:
            changed = False
            for j, b in enumerate(boxes):
                if used[j] or j == i:
                    continue
                for g in group:
                    if are_close(g, b):
                        candidate = merged_box(group + [b])
                        # Only merge if result doesn't become too wide/tall
                        if (candidate["x2"] - candidate["x1"]) <= max_box_w and \
                           (candidate["y2"] - candidate["y1"]) <= max_box_h:
                            group.append(b)
                            used[j] = True
                            changed  = True
                        break
        merged.append(merged_box(group))
        used[i] = True
    return merged


# ── Groq naming only (no box coords needed) ───────────────────────────────────
INVENTORY_NAMING_PROMPT = f"""You are a surgical instrument identification system.
You will be given a cropped image of a single surgical instrument.
Identify it from the known list below.

Known instruments: {", ".join(SURGICAL_TOOLS)}.

Respond ONLY in this exact format:
TOOL: <exact_name_from_list or unknown>
CONFIDENCE: <high, medium, or low>"""


def _crop_b64(image_b64: str, box: dict) -> str:
    """Crop a region from a base64 image and return as base64 JPEG."""
    img_bytes = base64.b64decode(image_b64)
    arr       = np.frombuffer(img_bytes, dtype=np.uint8)
    img       = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    H, W      = img.shape[:2]

    x1 = max(0, int(box["x1"] * W) - 10)
    y1 = max(0, int(box["y1"] * H) - 10)
    x2 = min(W, int(box["x2"] * W) + 10)
    y2 = min(H, int(box["y2"] * H) + 10)

    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        return image_b64   # fallback: send full image

    _, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf).decode("utf-8")


def _name_crop(crop_b64: str) -> tuple[str, float]:
    """Ask Groq to name a single cropped tool. Returns (name, confidence)."""
    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{crop_b64}"}},
            {"type": "text",      "text": INVENTORY_NAMING_PROMPT}
        ]}],
        "max_tokens": 40,
        "temperature": 0.1,
    }).encode("utf-8")
    try:
        result = _groq_post(payload)
        text   = result["choices"][0]["message"]["content"].strip()
        name, conf_str = "unknown", "low"
        for line in text.splitlines():
            if line.startswith("TOOL:"):
                name     = line.split(":", 1)[1].strip().lower().replace(" ", "_")
            if line.startswith("CONFIDENCE:"):
                conf_str = line.split(":", 1)[1].strip().lower()
        conf = {"high": 0.9, "medium": 0.65, "low": 0.4}.get(conf_str, 0.5)
        return name, conf
    except Exception as e:
        print(f"[Groq naming] Error: {e}")
        return "unknown", 0.4


def call_groq_inventory(image_b64: str) -> list:
    """
    Hybrid pipeline:
      1. OpenCV finds precise bounding boxes from contours
      2. Each box is cropped and sent to Groq for identification
      3. Returns tools with accurate boxes + correct names
    """
    # Step 1: Get precise boxes via OpenCV
    boxes = detect_contour_boxes(image_b64)
    if not boxes:
        print("[Inventory] No contours found — image may be empty or too noisy")
        return []

    tools = []
    for i, box in enumerate(boxes):
        # Step 2: Crop each detected region
        crop = _crop_b64(image_b64, box)

        # Step 3: Ask Groq to name it
        name, conf = _name_crop(crop)
        print(f"[Inventory] Box {i+1}/{len(boxes)} → {name} ({conf:.0%})")

        if name == "unknown":
            continue   # skip unrecognised regions

        tools.append({
            "name":       name,
            "confidence": conf,
            "box":        box,   # ← these are now real OpenCV pixel boxes
        })

    return tools


# ══════════════════════════════════════════════════════════════════════════════
#  DETECTOR THREAD
# ══════════════════════════════════════════════════════════════════════════════
def detector_thread():
    global latest_frame, latest_data

    GROQ_EVERY_SEC = 3
    TOOL_EXPIRE    = 10
    CAMERA_INDEX   = int(os.environ.get("CAMERA_INDEX", "0"))

    print("\n" + "="*60)
    print("SurgiSense — Groq Vision Detector (full frame)")
    print("="*60)
    if GROQ_API_KEY:
        print(f"  ✓ Groq API key loaded")
        print(f"  ✓ Model: {GROQ_MODEL}")
        print(f"  ✓ Sending full frame every {GROQ_EVERY_SEC}s (non-blocking)")
    else:
        print("  ⚠ No GROQ_API_KEY — add it to backend/.env")
    print("="*60 + "\n")

    fps_history    = deque(maxlen=30)
    last_time      = time.time()
    last_groq_time = 0
    groq_running   = threading.Event()
    current_tools  = {}
    pending_events = []
    last_printed   = {}
    REPRINT_AFTER  = 10

    def groq_worker(frame_copy):
        result = call_groq_vision(frame_copy)
        now = time.time()
        if result:
            name = result["name"]
            current_tools[name] = {**result, "last_seen": now}
            if name not in last_printed or (now - last_printed.get(name, 0)) > REPRINT_AFTER:
                ts = time.strftime("%Y-%m-%d %H:%M:%S")
                print(f"[{ts}] ✅ DETECTED  | {name}  ({result['confidence']:.0%})")
                last_printed[name] = now
                pending_events.append(result.copy())
        else:
            print(f"[{time.strftime('%H:%M:%S')}] No tool detected")
        groq_running.clear()

    cap = None

    while True:
        if not camera_active.is_set():
            if cap is not None:
                cap.release()
                cap = None
                print("[Camera] Hardware released — light off")
            with frame_lock:
                latest_frame = None
            with data_lock:
                latest_data = {}
            time.sleep(0.2)
            continue

        if cap is None:
            cap = cv2.VideoCapture(CAMERA_INDEX)
            if not cap.isOpened():
                print("ERROR: Could not open webcam")
                time.sleep(1)
                continue
            cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            cap.set(cv2.CAP_PROP_FPS,          30)
            cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)
            print("[Camera] Hardware opened — light on")

        ret, frame = cap.read()
        if not ret:
            time.sleep(0.05)
            continue

        H, W = frame.shape[:2]
        now  = time.time()
        fps_history.append(1.0 / max(now - last_time, 1e-5))
        last_time = now
        avg_fps   = float(np.mean(fps_history))

        if GROQ_API_KEY and (now - last_groq_time) >= GROQ_EVERY_SEC and not groq_running.is_set():
            last_groq_time = now
            groq_running.set()
            threading.Thread(target=groq_worker, args=(frame.copy(),), daemon=True).start()

        for name in list(current_tools.keys()):
            if now - current_tools[name]["last_seen"] > TOOL_EXPIRE:
                del current_tools[name]
                last_printed.pop(name, None)

        y_offset = 120
        for tool in current_tools.values():
            label = f"{tool['name'].replace('_', ' ')}  {tool['confidence']:.0%}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            cv2.rectangle(frame, (10, y_offset - th - 8), (10 + tw + 10, y_offset + 8), (0, 200, 0), -1)
            cv2.putText(frame, label, (15, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
            y_offset += 40

        cv2.rectangle(frame, (0, 0), (W, 100), (0, 0, 0), -1)
        cv2.rectangle(frame, (0, 0), (W, 100), (255, 255, 255), 2)
        fps_color = (0, 255, 0) if avg_fps >= 20 else (0, 165, 255) if avg_fps >= 10 else (0, 0, 255)
        cv2.putText(frame, f"FPS: {avg_fps:.1f}", (W - 150, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, fps_color, 2)
        cv2.putText(frame, f"Tools: {len(current_tools)}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    (0, 255, 0) if current_tools else (200, 200, 200), 2)
        next_call = max(0, GROQ_EVERY_SEC - (now - last_groq_time))
        cv2.putText(frame, f"Next scan: {next_call:.1f}s", (10, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

        _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        with frame_lock:
            latest_frame = jpeg.tobytes()

        with data_lock:
            latest_data = {
                "fps":       round(avg_fps, 1),
                "hands":     0,
                "tools":     [{"name": t["name"], "confidence": t["confidence"], "status": t["status"]}
                               for t in current_tools.values()],
                "events":    pending_events.copy(),
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            }
            pending_events.clear()

    cap.release()


# ══════════════════════════════════════════════════════════════════════════════
#  POSTGRESQL DATABASE
# ══════════════════════════════════════════════════════════════════════════════
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://surgitrack_user:surgitrack123@localhost:5432/surgitrack"
)

@contextmanager
def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS procedures (
            id          SERIAL PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS stages (
            id            SERIAL PRIMARY KEY,
            procedure_id  INTEGER NOT NULL REFERENCES procedures(id),
            name          TEXT NOT NULL,
            required_tool TEXT NOT NULL,
            stage_order   INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS contact_messages (
            id         SERIAL PRIMARY KEY,
            name       TEXT NOT NULL,
            email      TEXT NOT NULL,
            message    TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS test_results (
            id           SERIAL PRIMARY KEY,
            procedure_id INTEGER NOT NULL REFERENCES procedures(id),
            marks        INTEGER NOT NULL,
            total_stages INTEGER NOT NULL,
            completed_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS inventory_sessions (
            id           SERIAL PRIMARY KEY,
            session_type TEXT NOT NULL,
            tools_json   JSONB NOT NULL,
            image_b64    TEXT,
            created_at   TIMESTAMPTZ DEFAULT NOW()
        );
        """)
        cur.execute("SELECT COUNT(*) FROM procedures")
        if cur.fetchone()['count'] == 0:
            print("✓ Seeding default procedures...")
            cur.execute("INSERT INTO procedures (name, description) VALUES (%s,%s) RETURNING id",
                ("Craniotomy", "Surgical removal of part of the skull to access the brain."))
            p1 = cur.fetchone()['id']
            cur.executemany("INSERT INTO stages (procedure_id,name,required_tool,stage_order) VALUES (%s,%s,%s,%s)", [
                (p1, "Incision & Scalp Retraction", "scalpel",           1),
                (p1, "Tissue Handling",             "artery_forceps",    2),
                (p1, "Bone Work",                   "rongeur_forceps_1", 3),
                (p1, "Closure",                     "iris_scissors",     4),
            ])
            cur.execute("INSERT INTO procedures (name, description) VALUES (%s,%s) RETURNING id",
                ("Spinal Fusion", "Vertebrae fusion to eliminate motion between spinal segments."))
            p2 = cur.fetchone()['id']
            cur.executemany("INSERT INTO stages (procedure_id,name,required_tool,stage_order) VALUES (%s,%s,%s,%s)", [
                (p2, "Access & Exposure", "scalpel",              1),
                (p2, "Decompression",     "rongeur_forceps_1",    2),
                (p2, "Instrumentation",   "wire_grabbing_pliers", 3),
                (p2, "Fusion & Closure",  "fine_needle",          4),
            ])
            cur.execute("INSERT INTO procedures (name, description) VALUES (%s,%s) RETURNING id",
                ("Appendectomy", "Surgical removal of the appendix."))
            p3 = cur.fetchone()['id']
            cur.executemany("INSERT INTO stages (procedure_id,name,required_tool,stage_order) VALUES (%s,%s,%s,%s)", [
                (p3, "Entry & Exploration",  "scalpel",            1),
                (p3, "Appendix Isolation",   "artery_forceps",     2),
                (p3, "Aspiration",           "aspirator",          3),
                (p3, "Irrigation & Closure", "operating_scissors", 4),
            ])
            cur.execute("INSERT INTO procedures (name, description) VALUES (%s,%s) RETURNING id",
                ("Basic Suturing", "Standard wound closure using scalpel and forceps."))
            p4 = cur.fetchone()['id']
            cur.executemany("INSERT INTO stages (procedure_id,name,required_tool,stage_order) VALUES (%s,%s,%s,%s)", [
                (p4, "Incision",        "scalpel",            1),
                (p4, "Tissue Handling", "tweezers",           2),
                (p4, "Suturing",        "fine_needle",        3),
                (p4, "Cutting Suture",  "operating_scissors", 4),
            ])
            print("✓ Seeding complete.")


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    init_db()
    print("✓ PostgreSQL database ready")
    threading.Thread(target=detector_thread, daemon=True).start()
    print("✓ Detector thread started")


# ── MJPEG stream ──────────────────────────────────────────────────────────────
def mjpeg_generator():
    while True:
        with frame_lock:
            frame = latest_frame
        if frame:
            yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
        time.sleep(0.033)

@app.get("/stream/video")
def video_stream():
    return StreamingResponse(mjpeg_generator(), media_type="multipart/x-mixed-replace; boundary=frame")


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/detection")
async def ws_detection(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    print(f"[WS] Client connected. Total: {len(ws_clients)}")
    last_tool_names = set()
    try:
        while True:
            with data_lock:
                data = dict(latest_data)
            if data:
                current_names = {t['name'] for t in data.get('tools', [])}
                if bool(data.get('events')) or current_names != last_tool_names:
                    await ws.send_json(data)
                    last_tool_names = current_names
            await asyncio.sleep(0.1)
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if ws in ws_clients:
            ws_clients.remove(ws)
        print(f"[WS] Client disconnected. Total: {len(ws_clients)}")


# ── Camera control ────────────────────────────────────────────────────────────
@app.post("/api/camera/start")
def camera_start():
    camera_active.set()
    print("[Camera] Started")
    return {"status": "started"}

@app.post("/api/camera/stop")
def camera_stop():
    camera_active.clear()
    print("[Camera] Stopped")
    return {"status": "stopped"}

@app.get("/api/camera/status")
def camera_status():
    return {"active": camera_active.is_set()}


# ── Procedures ────────────────────────────────────────────────────────────────
@app.get("/api/procedures")
def get_procedures():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, name, description FROM procedures ORDER BY id")
        rows = cur.fetchall()
    return [{"id": r["id"], "name": r["name"], "description": r["description"]} for r in rows]

@app.get("/api/procedures/{proc_id}/stages")
def get_stages(proc_id: int):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, procedure_id, name, required_tool, stage_order "
                    "FROM stages WHERE procedure_id=%s ORDER BY stage_order", (proc_id,))
        rows = cur.fetchall()
    if not rows:
        return JSONResponse({"message": "No stages found"}, status_code=404)
    return [{"id": r["id"], "procedureId": r["procedure_id"], "name": r["name"],
             "requiredTool": r["required_tool"], "order": r["stage_order"]} for r in rows]


# ── Test results ──────────────────────────────────────────────────────────────
@app.post("/api/tests/results")
async def save_test_result(body: dict):
    proc_id = body.get("procedureId")
    marks   = body.get("marks")
    total   = body.get("totalStages")
    if proc_id is None or marks is None or total is None:
        return JSONResponse({"message": "Missing fields"}, status_code=400)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO test_results (procedure_id, marks, total_stages) VALUES (%s,%s,%s) RETURNING *",
                    (proc_id, marks, total))
        row = cur.fetchone()
    return JSONResponse({"id": row["id"], "procedureId": row["procedure_id"],
                         "marks": row["marks"], "totalStages": row["total_stages"],
                         "completedAt": str(row["completed_at"])}, status_code=201)

@app.get("/api/tests/results")
def get_test_results():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""SELECT tr.*, p.name AS procedure_name FROM test_results tr
                       JOIN procedures p ON tr.procedure_id = p.id
                       ORDER BY tr.id DESC LIMIT 50""")
        rows = cur.fetchall()
    return [{"id": r["id"], "procedureId": r["procedure_id"], "marks": r["marks"],
             "totalStages": r["total_stages"], "completedAt": str(r["completed_at"]),
             "procedureName": r["procedure_name"]} for r in rows]


# ── Contact ───────────────────────────────────────────────────────────────────
@app.post("/api/contact")
async def create_contact(body: dict):
    name    = body.get("name",    "").strip()
    email   = body.get("email",   "").strip()
    message = body.get("message", "").strip()
    if not name or not email or not message:
        return JSONResponse({"message": "name, email and message are required"}, status_code=400)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("INSERT INTO contact_messages (name, email, message) VALUES (%s,%s,%s)",
                    (name, email, message))
    return JSONResponse({"success": True}, status_code=201)


# ── Gemini chat (single, de-duplicated) ───────────────────────────────────────
@app.post("/api/chat")
async def chat(body: dict):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return JSONResponse({"response": "⚠️ No Gemini API key. Add GEMINI_API_KEY to backend/.env"})
    messages = body.get("messages", [])
    system   = body.get("system", "You are SurgiBot, a surgical assistant AI.")
    context  = body.get("context", "")
    contents = []
    for m in messages[:-1]:
        contents.append({"role": "user" if m["role"] == "user" else "model",
                         "parts": [{"text": m["content"]}]})
    last_text = messages[-1]["content"] if messages else ""
    final     = f"[Live OR data: {context}]\n\n{last_text}" if context else last_text
    contents.append({"role": "user", "parts": [{"text": final}]})
    payload = json.dumps({
        "system_instruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {"maxOutputTokens": 512, "temperature": 0.7}
    }).encode("utf-8")
    MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"]
    last_error = ""
    for model_name in MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        try:
            req = urllib.request.Request(url, data=payload,
                                         headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read().decode())
            return JSONResponse({"response": result["candidates"][0]["content"]["parts"][0]["text"]})
        except urllib.error.HTTPError as e:
            try: last_error = json.loads(e.read().decode()).get("error", {}).get("message", "")
            except: last_error = str(e)
        except Exception as e:
            last_error = str(e)
    return JSONResponse({"response": f"All models failed. Last error: {last_error}"})

# ══════════════════════════════════════════════════════════════════════════════
#  INVENTORY: Gemini Vision for accurate bounding boxes + tool names
# ══════════════════════════════════════════════════════════════════════════════

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()

INVENTORY_GEMINI_PROMPT = f"""You are a surgical instrument detection system.
Identify every surgical instrument in this image.

Known instruments: {", ".join(SURGICAL_TOOLS)}.

CRITICAL DISTINCTIONS — read before identifying scissors:
- iris_scissors: SMALL, short blades (~2-3cm), delicate pointed tips, fine lightweight handles — used for eye/microsurgery
- operating_scissors: LARGE, long blades (~5-7cm), heavier build, blunt or curved tips, thick handles — general surgical use
When you see scissors, measure the blade length relative to the handle. Short blades = iris_scissors. Long blades = operating_scissors. Do NOT guess.

Return ONLY a valid JSON array. No markdown, no explanation, no extra text.
Each item must have exactly these fields:
- "name": instrument name from the known list
- "confidence": number between 0 and 1
- "x1": left edge (0.0 to 1.0)
- "y1": top edge (0.0 to 1.0)
- "x2": right edge (0.0 to 1.0)
- "y2": bottom edge (0.0 to 1.0)

Example output:
[{{"name":"scalpel","confidence":0.9,"x1":0.10,"y1":0.20,"x2":0.25,"y2":0.80}},{{"name":"iris_scissors","confidence":0.85,"x1":0.30,"y1":0.15,"x2":0.50,"y2":0.75}}]

Return [] if no instruments visible."""


def _nms_deduplicate(tools: list, iou_thresh: float = 0.4) -> list:
    """
    Non-Maximum Suppression per tool name.
    If two detections of the SAME tool overlap > iou_thresh, keep only
    the one with higher confidence.
    """
    if not tools:
        return tools

    from collections import defaultdict
    by_name = defaultdict(list)
    for t in tools:
        by_name[t["name"]].append(t)

    result = []
    for name, group in by_name.items():
        group = sorted(group, key=lambda x: x["confidence"], reverse=True)
        kept = []
        used = [False] * len(group)
        for i, a in enumerate(group):
            if used[i]:
                continue
            for j, b in enumerate(group):
                if i != j and not used[j]:
                    if _iou(a["box"], b["box"]) > iou_thresh:
                        used[j] = True
            kept.append(a)
            used[i] = True
        print(f"[NMS] {name}: {len(group)} detections → {len(kept)} kept")
        result.extend(kept)

    return result


def call_groq_inventory(image_b64: str) -> list:
    """Use Gemini Vision for accurate bounding boxes. Falls back to Groq if no Gemini key."""
    if GEMINI_API_KEY:
        return _gemini_inventory(image_b64)
    elif GROQ_API_KEY:
        return _groq_inventory_fallback(image_b64)
    else:
        print("[Inventory] No API key found — set GEMINI_API_KEY or GROQ_API_KEY in .env")
        return []


def _gemini_inventory(image_b64: str) -> list:
    """Use Gemini 2.5 Flash to detect tools — parses native box_2d format [y1,x1,y2,x2] 0-1000 scale."""

    payload = json.dumps({
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
                {"text": INVENTORY_GEMINI_PROMPT}
            ]
        }],
        "generationConfig": {"maxOutputTokens": 4096, "temperature": 0.1}
    }).encode("utf-8")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    try:
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())

        raw = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        print(f"[Gemini Inventory] Raw: {raw[:600]}")

        # Strip markdown fences
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        items = json.loads(raw)
        if not isinstance(items, list):
            return []

        valid = []
        for t in items:
            # Gemini 2.5 native: {"box_2d": [y1,x1,y2,x2], "label": "name"} 0-1000 scale
            if "box_2d" in t:
                coords = t["box_2d"]
                y1 = max(0.0, coords[0] / 1000)
                x1 = max(0.0, coords[1] / 1000)
                y2 = min(1.0, coords[2] / 1000)
                x2 = min(1.0, coords[3] / 1000)
                name = t.get("label", "unknown").lower().replace(" ", "_")
                conf = float(t.get("confidence", 0.85))

            # Flat format: {"name":..., "x1":..., "y1":..., "x2":..., "y2":...}
            elif "x1" in t:
                x1 = max(0.0, float(t.get("x1", 0)))
                y1 = max(0.0, float(t.get("y1", 0)))
                x2 = min(1.0, float(t.get("x2", 1)))
                y2 = min(1.0, float(t.get("y2", 1)))
                name = t.get("name", "unknown").lower().replace(" ", "_")
                conf = float(t.get("confidence", 0.7))

            # Nested box format: {"name":..., "box":{x1,y1,x2,y2}}
            elif "box" in t and isinstance(t["box"], dict):
                box  = t["box"]
                x1 = max(0.0, float(box.get("x1", 0)))
                y1 = max(0.0, float(box.get("y1", 0)))
                x2 = min(1.0, float(box.get("x2", 1)))
                y2 = min(1.0, float(box.get("y2", 1)))
                name = t.get("name", "unknown").lower().replace(" ", "_")
                conf = float(t.get("confidence", 0.7))
            else:
                print(f"[Gemini Inventory] Skipping unrecognised format: {t}")
                continue

            if x2 <= x1 or y2 <= y1:
                continue

            valid.append({
                "name":       name,
                "confidence": conf,
                "box":        {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
            })
            print(f"[Gemini Inventory] {name} ({conf:.0%}) box=({x1:.3f},{y1:.3f},{x2:.3f},{y2:.3f})")

        print(f"[Gemini Inventory] {len(valid)} tools detected")

        # Remove duplicate detections of the same tool (NMS per tool name)
        valid = _nms_deduplicate(valid)
        print(f"[Gemini Inventory] {len(valid)} tools after deduplication")
        return valid

    except urllib.error.HTTPError as e:
        try: err = json.loads(e.read().decode()).get("error", {}).get("message", str(e))
        except: err = str(e)
        print(f"[Gemini Inventory] HTTP error: {err[:200]}")
        return []
    except Exception as e:
        print(f"[Gemini Inventory] Error: {e}")
        return []


def _groq_inventory_fallback(image_b64: str) -> list:
    """Fallback: Groq identifies tools (approximate boxes only)."""
    PROMPT = f"""You are a surgical instrument inventory system.
List every surgical instrument visible in this image.
Known instruments: {", ".join(SURGICAL_TOOLS)}.
Respond ONLY as a JSON array with no markdown:
[{{"name": "scalpel", "confidence": 0.9, "box": {{"x1": 0.1, "y1": 0.2, "x2": 0.3, "y2": 0.8}}}}]
Return [] if nothing visible."""

    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            {"type": "text", "text": PROMPT}
        ]}],
        "max_tokens": 800, "temperature": 0.1,
    }).encode("utf-8")

    try:
        result = _groq_post(payload)
        raw    = result["choices"][0]["message"]["content"].strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        tools = json.loads(raw.strip())
        return tools if isinstance(tools, list) else []
    except Exception as e:
        print(f"[Groq Inventory Fallback] Error: {e}")
        return []


# ══════════════════════════════════════════════════════════════════════════════
#  INVENTORY ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/inventory/scan")
async def inventory_scan(body: dict = Body(...)):
    """Receive a base64 image, detect all tools + bounding boxes via Groq."""
    image_b64 = body.get("image", "")
    if not image_b64:
        return JSONResponse({"error": "No image provided"}, status_code=400)
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    tools = call_groq_inventory(image_b64)
    return JSONResponse({"tools": tools, "count": len(tools)})


@app.post("/api/inventory/save")
async def inventory_save(body: dict = Body(...)):
    """Save a pre or post surgery inventory scan to the database."""
    session_type = body.get("type", "pre")
    tools        = body.get("tools", [])
    image_b64    = body.get("image", None)
    if session_type not in ("pre", "post"):
        return JSONResponse({"error": "type must be 'pre' or 'post'"}, status_code=400)
    if image_b64 and "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO inventory_sessions (session_type, tools_json, image_b64) "
            "VALUES (%s, %s, %s) RETURNING id, created_at",
            (session_type, json.dumps(tools), image_b64)
        )
        row = cur.fetchone()
    return JSONResponse({"id": row["id"], "type": session_type,
                         "toolCount": len(tools), "createdAt": str(row["created_at"])}, status_code=201)


@app.get("/api/inventory/latest/{session_type}")
def inventory_latest(session_type: str):
    """Get the most recent pre or post inventory session."""
    if session_type not in ("pre", "post"):
        return JSONResponse({"error": "type must be 'pre' or 'post'"}, status_code=400)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, session_type, tools_json, image_b64, created_at "
            "FROM inventory_sessions WHERE session_type=%s ORDER BY created_at DESC LIMIT 1",
            (session_type,)
        )
        row = cur.fetchone()
    if not row:
        return JSONResponse({"message": "No inventory found"}, status_code=404)
    return JSONResponse({"id": row["id"], "type": row["session_type"],
                         "tools": row["tools_json"], "image": row["image_b64"],
                         "createdAt": str(row["created_at"])})


@app.post("/api/inventory/reconcile")
async def inventory_reconcile(body: dict = Body(...)):
    """Compare post-surgery tools against the latest pre-surgery inventory."""
    post_tools     = body.get("postTools", [])
    pre_session_id = body.get("preSessionId", None)
    with get_db() as conn:
        cur = conn.cursor()
        if pre_session_id:
            cur.execute("SELECT tools_json FROM inventory_sessions WHERE id=%s", (pre_session_id,))
        else:
            cur.execute("SELECT tools_json FROM inventory_sessions "
                        "WHERE session_type='pre' ORDER BY created_at DESC LIMIT 1")
        row = cur.fetchone()
    if not row:
        return JSONResponse({"error": "No pre-surgery inventory found. Please scan before surgery first."}, status_code=404)
    pre_tools  = row["tools_json"]

    # Count quantities per tool name
    from collections import Counter
    pre_counts  = Counter(t["name"] for t in pre_tools)
    post_counts = Counter(t["name"] for t in post_tools)

    present, missing, extra = [], [], []

    for name, pre_qty in pre_counts.items():
        post_qty = post_counts.get(name, 0)
        if post_qty >= pre_qty:
            # All accounted for
            matched = [t for t in post_tools if t["name"] == name][:pre_qty]
            present.extend(matched)
        elif post_qty > 0:
            # Partially present
            matched = [t for t in post_tools if t["name"] == name]
            present.extend(matched)
            for _ in range(pre_qty - post_qty):
                missing.append({"name": name, "expected": pre_qty, "found": post_qty})
        else:
            # Completely missing
            missing.append({"name": name, "expected": pre_qty, "found": 0})

    for name, post_qty in post_counts.items():
        pre_qty = pre_counts.get(name, 0)
        if post_qty > pre_qty:
            extra_tools = [t for t in post_tools if t["name"] == name][pre_qty:]
            extra.extend(extra_tools)

    all_ok = len(missing) == 0
    missing_summary = ", ".join(
        f"{m['name']} (need {m['expected']}, found {m['found']})" for m in missing
    )
    return JSONResponse({
        "allPresent": all_ok,
        "preCount":   sum(pre_counts.values()),
        "postCount":  sum(post_counts.values()),
        "present":    present,
        "missing":    missing,
        "extra":      extra,
        "summary":    "All tools accounted for." if all_ok
                      else f"{len(missing)} tool(s) missing: {missing_summary}",
    })


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    with data_lock:
        d = dict(latest_data)
    return {"status": "ok", "fps": d.get("fps", 0), "tools": len(d.get("tools", []))}


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)