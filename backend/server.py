# backend/server.py - SurgiTrack FastAPI Backend
import asyncio
import time
import threading
import cv2
import cv2.aruco as aruco
import numpy as np
import mediapipe as mp
from collections import deque
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn
import sys, os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

# Auto-load .env file if present
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✓ .env file loaded")
except ImportError:
    pass

sys.path.insert(0, os.path.dirname(__file__))

app = FastAPI(title="SurgiTrack Backend")
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
camera_active = threading.Event()   # not set = camera off


# ══════════════════════════════════════════════════════════════════════════════
#  DETECTOR THREAD  —  exact detector.py logic, no changes
# ══════════════════════════════════════════════════════════════════════════════
def detector_thread():
    global latest_frame, latest_data

    # ==================== CONFIGURATION ====================
    ARUCO_DICT_ID    = aruco.DICT_4X4_50
    HAND_ROI_PADDING = 120

    TOOL_MARKERS = {
        20: 'scalpel',          21: 'artery_forceps',
        22: 'iris_scissors',    23: 'operating_scissors',
        24: 'tweezers',         25: 'aspirator',
        26: 'bending_shear',    27: 'circular_spoon',
        28: 'core_needle',      29: 'fine_needle',
        30: 'rongeur_forceps_1',31: 'rongeur_forceps_2',
        32: 'stripping',        33: 'wire_grabbing_pliers',
    }

    # ==================== ANTI-FLICKER SETTINGS ====================
    DETECTION_HISTORY_SIZE   = 10
    MIN_CONFIDENCE_THRESHOLD = 0.4
    MAX_LOST_FRAMES          = 25
    POSITION_SMOOTHING       = 0.3
    MIN_MARKER_PERIMETER     = 15

    # ==================== PERFORMANCE TUNING ====================
    UPSCALE_TARGET  = 380
    HAND_EVERY_N    = 3
    ARUCO_EVERY_N   = 2
    MEDIAPIPE_SCALE = 0.5

    # ==================== INITIALIZE ====================
    print("Initializing max-performance ArUco detector...")
    mp_hands   = mp.solutions.hands
    mp_drawing = mp.solutions.drawing_utils
    hands      = mp_hands.Hands(
        static_image_mode=False, max_num_hands=2,
        min_detection_confidence=0.5, min_tracking_confidence=0.5)

    aruco_dict   = aruco.getPredefinedDictionary(ARUCO_DICT_ID)
    aruco_params = aruco.DetectorParameters()

    # Fewer threshold passes = much faster ArUco
    aruco_params.adaptiveThreshWinSizeMin    = 3
    aruco_params.adaptiveThreshWinSizeMax    = 35
    aruco_params.adaptiveThreshWinSizeStep   = 8
    aruco_params.minMarkerPerimeterRate      = 0.005
    aruco_params.maxMarkerPerimeterRate      = 4.0
    aruco_params.polygonalApproxAccuracyRate = 0.1
    aruco_params.minCornerDistanceRate       = 0.02
    aruco_params.minDistanceToBorder         = 1
    aruco_params.cornerRefinementMethod      = aruco.CORNER_REFINE_NONE
    aruco_params.errorCorrectionRate         = 0.6

    try:
        aruco_detector = aruco.ArucoDetector(aruco_dict, aruco_params)
        use_new_api = True
        print("✓ Using new ArUco API (OpenCV 4.7+)")
    except AttributeError:
        aruco_detector = None
        use_new_api = False
        print("✓ Using old ArUco API (OpenCV < 4.7)")

    # Pre-create CLAHE once
    CLAHE = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))

    # ==================== TRACKING CLASSES ====================
    class TrackedTool:
        def __init__(self, tool_id, tool_name, center, corners):
            self.id              = tool_id
            self.name            = tool_name
            self.center          = np.array(center, dtype=float)
            self.corners         = corners
            self.last_seen_frame = 0
            self.frames_lost     = 0
            self.detection_history = deque(maxlen=DETECTION_HISTORY_SIZE)
            self.detection_history.append(1)
            self.smoothed_center = np.array(center, dtype=float)
            self.confidence      = 1.0

        def update(self, center, corners, current_frame):
            self.smoothed_center = (
                POSITION_SMOOTHING * self.smoothed_center +
                (1 - POSITION_SMOOTHING) * np.array(center)
            )
            self.center          = np.array(center, dtype=float)
            self.corners         = corners
            self.last_seen_frame = current_frame
            self.frames_lost     = 0
            self.detection_history.append(1)
            self.confidence = sum(self.detection_history) / len(self.detection_history)

        def predict(self, current_frame):
            self.frames_lost = current_frame - self.last_seen_frame
            self.detection_history.append(0)
            self.confidence = sum(self.detection_history) / len(self.detection_history)

        def is_valid(self):
            return (self.frames_lost <= MAX_LOST_FRAMES and
                    self.confidence  >= MIN_CONFIDENCE_THRESHOLD)

        def get_display_center(self):
            return tuple(self.smoothed_center.astype(int))

    class ToolTracker:
        def __init__(self):
            self.tracked_tools = {}
            self.frame_count   = 0

        def update(self, detected_tools):
            self.frame_count += 1
            seen_ids = set()
            for tool in detected_tools:
                tool_id = tool['id']
                seen_ids.add(tool_id)
                if tool_id in self.tracked_tools:
                    self.tracked_tools[tool_id].update(
                        tool['center'], tool['corners'], self.frame_count)
                else:
                    self.tracked_tools[tool_id] = TrackedTool(
                        tool_id, tool['name'], tool['center'], tool['corners'])
            for tool_id in list(self.tracked_tools.keys()):
                if tool_id not in seen_ids:
                    self.tracked_tools[tool_id].predict(self.frame_count)
                    if not self.tracked_tools[tool_id].is_valid():
                        del self.tracked_tools[tool_id]

        def get_stable_tools(self):
            return [t for t in self.tracked_tools.values() if t.is_valid()]

    # ==================== DETECTION ====================
    def run_aruco(image):
        if use_new_api:
            corners, ids, _ = aruco_detector.detectMarkers(image)
        else:
            corners, ids, _ = aruco.detectMarkers(image, aruco_dict, parameters=aruco_params)
        return corners, ids

    def detect_aruco_in_hand_roi(frame, hand_bbox):
        x, y, w, h = hand_bbox
        hand_roi = frame[y:y+h, x:x+w]
        if hand_roi.size == 0:
            return []
        gray = cv2.cvtColor(hand_roi, cv2.COLOR_BGR2GRAY)
        h_roi, w_roi = gray.shape
        base_scale = 1.0
        if w_roi < UPSCALE_TARGET or h_roi < UPSCALE_TARGET:
            base_scale = max(UPSCALE_TARGET / w_roi, UPSCALE_TARGET / h_roi)
            gray = cv2.resize(gray, None, fx=base_scale, fy=base_scale,
                              interpolation=cv2.INTER_LINEAR)
        blurred   = cv2.GaussianBlur(gray, (3, 3), 0)
        processed = CLAHE.apply(blurred)
        corners, ids = run_aruco(processed)
        detected_tools = []
        if ids is not None:
            for i, marker_id in enumerate(ids.flatten()):
                mid = int(marker_id)
                if mid not in TOOL_MARKERS:
                    continue
                marker_corners = corners[i][0]
                if cv2.arcLength(marker_corners, True) < MIN_MARKER_PERIMETER:
                    continue
                full_frame_corners = (marker_corners / base_scale) + [x, y]
                detected_tools.append({
                    'id':      mid,
                    'name':    TOOL_MARKERS[mid],
                    'corners': full_frame_corners,
                    'center':  (
                        int(np.mean(full_frame_corners[:, 0])),
                        int(np.mean(full_frame_corners[:, 1]))
                    ),
                })
        return detected_tools

    def get_hand_bounding_boxes(frame_shape, hand_landmarks_list):
        H, W = frame_shape[:2]
        hand_boxes = []
        for hand_landmarks in hand_landmarks_list:
            x_coords = [lm.x * W for lm in hand_landmarks.landmark]
            y_coords = [lm.y * H for lm in hand_landmarks.landmark]
            x_min = max(0, int(min(x_coords)) - HAND_ROI_PADDING)
            y_min = max(0, int(min(y_coords)) - HAND_ROI_PADDING)
            x_max = min(W, int(max(x_coords)) + HAND_ROI_PADDING)
            y_max = min(H, int(max(y_coords)) + HAND_ROI_PADDING)
            hand_boxes.append({
                'bbox':      [x_min, y_min, x_max - x_min, y_max - y_min],
                'landmarks': hand_landmarks,
            })
        return hand_boxes

    # ==================== DRAWING ====================
    def draw_stable_tool(frame, tracked_tool):
        center     = tracked_tool.get_display_center()
        confidence = tracked_tool.confidence
        color = (0, 255, 0)   if confidence >= 0.9 else \
                (0, 255, 255) if confidence >= 0.7 else \
                (0, 165, 255)
        cv2.circle(frame, center, 10, color, -1)
        cv2.circle(frame, center, 15, color, 2)
        if tracked_tool.frames_lost == 0:
            cv2.polylines(frame, [tracked_tool.corners.astype(int)], True, color, 3)
        conf_percent = int(confidence * 100)
        label  = tracked_tool.name
        status = f"Tracking ({conf_percent}%)" if tracked_tool.frames_lost > 0 \
                 else f"Detected ({conf_percent}%)"
        (lw, lh), _ = cv2.getTextSize(label,  cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        (sw, sh), _ = cv2.getTextSize(status, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(frame,
                     (center[0] - 5,               center[1] - lh - sh - 30),
                     (center[0] + max(lw, sw) + 10, center[1] - 10),
                     color, -1)
        cv2.putText(frame, label,  (center[0], center[1] - sh - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
        cv2.putText(frame, status, (center[0], center[1] - 15),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

    # ==================== MAIN LOOP ====================
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Could not open webcam")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS,          30)
    cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)   # no frame queuing

    tracker = ToolTracker()

    print("\n" + "="*60)
    print("ArUco Tool Detection - Maximum Performance")
    print("="*60)
    print("  ✓ MediaPipe on downscaled frame (0.5x)")
    print("  ✓ MediaPipe every 3 frames")
    print("  ✓ ArUco every 2 frames (tracker fills gaps)")
    print("  ✓ 3x3 GaussianBlur (faster than 5x5)")
    print("  ✓ Fewer ArUco threshold passes (step=8)")
    print("  ✓ Corner refinement disabled")
    print("  ✓ Camera buffer = 1 (no frame queuing)")
    print("="*60 + "\n")

    fps_history = deque(maxlen=30)
    last_time   = time.time()
    frame_count = 0
    cached_hand_boxes   = []
    cached_hand_results = None

    # ---- CONSOLE LOGGING STATE ----
    last_printed   = {}   # tool_id -> timestamp when last printed
    last_seen_time = {}   # tool_id -> timestamp when last detected
    REPRINT_AFTER  = 10   # seconds of absence before reprinting
    pending_events = []   # new-appearance events for WebSocket

    while True:
        # Wait until camera is started via /api/camera/start
        if not camera_active.is_set():
            with frame_lock:
                latest_frame = None
            with data_lock:
                latest_data = {}
            time.sleep(0.2)
            continue

        ret, frame = cap.read()
        if not ret:
            time.sleep(0.05)
            continue

        H, W = frame.shape[:2]
        frame_count += 1

        current_time = time.time()
        fps = 1.0 / max(current_time - last_time, 1e-5)
        last_time = current_time
        fps_history.append(fps)
        avg_fps = float(np.mean(fps_history))

        # ---- HAND DETECTION every N frames ----
        if frame_count % HAND_EVERY_N == 0:
            small     = cv2.resize(frame, None, fx=MEDIAPIPE_SCALE, fy=MEDIAPIPE_SCALE,
                                   interpolation=cv2.INTER_LINEAR)
            rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            cached_hand_results = hands.process(rgb_small)
            if cached_hand_results.multi_hand_landmarks:
                cached_hand_boxes = get_hand_bounding_boxes(
                    frame.shape, cached_hand_results.multi_hand_landmarks)
            else:
                cached_hand_boxes = []

        hand_boxes = cached_hand_boxes

        # ---- ARUCO DETECTION every N frames ----
        if frame_count % ARUCO_EVERY_N == 0:
            all_detected_tools = []
            for hand_info in hand_boxes:
                tools = detect_aruco_in_hand_roi(frame, hand_info['bbox'])
                all_detected_tools.extend(tools)
            tracker.update(all_detected_tools)

        stable_tools = tracker.get_stable_tools()

        # ---- DRAW HANDS ----
        for hand_info in hand_boxes:
            x, y, w, h = hand_info['bbox']
            cv2.rectangle(frame, (x, y), (x+w, y+h), (255, 0, 255), 2)

        if cached_hand_results and cached_hand_results.multi_hand_landmarks:
            for lm in cached_hand_results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(
                    frame, lm, mp_hands.HAND_CONNECTIONS,
                    mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                    mp_drawing.DrawingSpec(color=(255, 255, 255), thickness=2))

        # ---- DRAW TOOLS ----
        for tool in stable_tools:
            draw_stable_tool(frame, tool)

        # ---- CONSOLE LOGGING ----
        now         = time.time()
        current_ids = {tool.id for tool in stable_tools}

        for tool in stable_tools:
            tid = tool.id
            last_seen_time[tid] = now
            # Print only if not already printed (or was absent > REPRINT_AFTER seconds)
            if tid not in last_printed:
                ts = time.strftime("%Y-%m-%d %H:%M:%S")
                print(f"[{ts}] ✅ DETECTED  | ID: {tid:>2} | {tool.name}")
                last_printed[tid] = now
                pending_events.append({
                    'id':         tool.id,
                    'name':       tool.name,
                    'confidence': round(tool.confidence, 3),
                    'status':     'tracking' if tool.frames_lost > 0 else 'detected',
                })

        # If tool disappears for > REPRINT_AFTER seconds, reset so it prints again on return
        for tid in list(last_printed.keys()):
            if tid not in current_ids:
                if tid in last_seen_time and (now - last_seen_time[tid]) > REPRINT_AFTER:
                    del last_printed[tid]
                    del last_seen_time[tid]

        # ---- STATUS BAR ----
        cv2.rectangle(frame, (0, 0), (W, 100), (0, 0, 0), -1)
        cv2.rectangle(frame, (0, 0), (W, 100), (255, 255, 255), 2)
        fps_color = (0, 255, 0)   if avg_fps >= 20 else \
                    (0, 165, 255) if avg_fps >= 10 else (0, 0, 255)
        cv2.putText(frame, f"FPS: {avg_fps:.1f}", (W - 150, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, fps_color, 2)
        cv2.putText(frame, f"Hands: {len(hand_boxes)}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    (0, 255, 0) if hand_boxes else (0, 0, 255), 2)
        cv2.putText(frame, f"Stable Tools: {len(stable_tools)}", (10, 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                    (0, 255, 0) if stable_tools else (200, 200, 200), 2)

        # ---- ENCODE + WRITE SHARED STATE ----
        _, jpeg = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        with frame_lock:
            latest_frame = jpeg.tobytes()

        active_tools_json = [{
            'id':         t.id,
            'name':       t.name,
            'confidence': round(t.confidence, 3),
            'status':     'tracking' if t.frames_lost > 0 else 'detected',
        } for t in stable_tools]

        with data_lock:
            latest_data = {
                'fps':       round(avg_fps, 1),
                'hands':     len(hand_boxes),
                'tools':     active_tools_json,
                'events':    pending_events.copy(),
                'timestamp': time.strftime('%Y-%m-%dT%H:%M:%S'),
            }
            pending_events.clear()

    cap.release()
    hands.close()


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
    t = threading.Thread(target=detector_thread, daemon=True)
    t.start()
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
    return StreamingResponse(mjpeg_generator(),
                             media_type="multipart/x-mixed-replace; boundary=frame")


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/detection")
async def ws_detection(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    print(f"[WS] Client connected. Total: {len(ws_clients)}")
    last_tool_ids = set()
    try:
        while True:
            with data_lock:
                data = dict(latest_data)
            if data:
                current_ids = {t['id'] for t in data.get('tools', [])}
                has_events  = bool(data.get('events'))
                if has_events or current_ids != last_tool_ids:
                    await ws.send_json(data)
                    last_tool_ids = current_ids
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


# ── Procedures API ────────────────────────────────────────────────────────────
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
        cur.execute(
            "SELECT id, procedure_id, name, required_tool, stage_order "
            "FROM stages WHERE procedure_id=%s ORDER BY stage_order",
            (proc_id,))
        rows = cur.fetchall()
    if not rows:
        return JSONResponse({"message": "No stages found"}, status_code=404)
    return [{
        "id":           r["id"],
        "procedureId":  r["procedure_id"],
        "name":         r["name"],
        "requiredTool": r["required_tool"],
        "order":        r["stage_order"],
    } for r in rows]


@app.post("/api/tests/results")
async def save_test_result(body: dict):
    proc_id = body.get("procedureId")
    marks   = body.get("marks")
    total   = body.get("totalStages")
    if proc_id is None or marks is None or total is None:
        return JSONResponse({"message": "Missing fields: procedureId, marks, totalStages"}, status_code=400)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO test_results (procedure_id, marks, total_stages) VALUES (%s,%s,%s) RETURNING *",
            (proc_id, marks, total))
        row = cur.fetchone()
    return JSONResponse({
        "id":          row["id"],
        "procedureId": row["procedure_id"],
        "marks":       row["marks"],
        "totalStages": row["total_stages"],
        "completedAt": str(row["completed_at"]),
    }, status_code=201)


@app.get("/api/tests/results")
def get_test_results():
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT tr.*, p.name AS procedure_name
            FROM test_results tr
            JOIN procedures p ON tr.procedure_id = p.id
            ORDER BY tr.id DESC LIMIT 50
        """)
        rows = cur.fetchall()
    return [{
        "id":            r["id"],
        "procedureId":   r["procedure_id"],
        "marks":         r["marks"],
        "totalStages":   r["total_stages"],
        "completedAt":   str(r["completed_at"]),
        "procedureName": r["procedure_name"],
    } for r in rows]


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


# ── Gemini chat ───────────────────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(body: dict):
    import urllib.request, json as _json
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return JSONResponse({"response": (
            "⚠️ No Gemini API key found.\n\n"
            "Add GEMINI_API_KEY=your-key to backend/.env\n"
            "Get a FREE key at: aistudio.google.com")})
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
    payload = _json.dumps({
        "system_instruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": {"maxOutputTokens": 512, "temperature": 0.7}
    }).encode("utf-8")
    MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"]
    last_error = ""
    for model_name in MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        try:
            req = urllib.request.Request(url, data=payload,
                                         headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = _json.loads(resp.read().decode())
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            return JSONResponse({"response": text})
        except urllib.error.HTTPError as e:
            try: last_error = _json.loads(e.read().decode()).get("error", {}).get("message", "")
            except: last_error = str(e)
        except Exception as e:
            last_error = str(e)
    return JSONResponse({"response": f"All models failed. Last error: {last_error}"})


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    with data_lock:
        d = dict(latest_data)
    return {"status": "ok", "fps": d.get("fps", 0), "tools": len(d.get("tools", []))}


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)