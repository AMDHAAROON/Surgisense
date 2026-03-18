# backend/server.py - SurgiSense Backend
import asyncio
import time
import base64
import json
import urllib.request
import urllib.error
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
ws_clients: list[WebSocket] = []
latest_detection: dict = {}

# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════
GROQ_API_KEY   = os.environ.get("GROQ_API_KEY",   "").strip()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()

GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"

SURGICAL_TOOLS = [
    "scalpel", "artery_forceps", "iris_scissors", "operating_scissors",
    "tweezers", "aspirator", "bending_shear", "circular_spoon",
    "core_needle", "fine_needle", "rongeur_forceps_1", "rongeur_forceps_2",
    "stripping", "wire_grabbing_pliers", "knife",
    "senn_retractor", "atilis_clamp", "kelly_forceps", "needle_holder",
    "tissue_forceps", "retractor", "clamp", "dissector",
]


# ══════════════════════════════════════════════════════════════════════════════
#  GROQ — Live feed tool detection (accepts base64 from browser)
# ══════════════════════════════════════════════════════════════════════════════
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


def call_groq_vision(image_b64: str) -> dict | None:
    """Detect a single tool from a base64 image sent by the browser."""
    if not GROQ_API_KEY:
        return None
    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            {"type": "text", "text": GROQ_PROMPT}
        ]}],
        "max_tokens": 60,
        "temperature": 0.1,
    }).encode("utf-8")
    try:
        result = _groq_post(payload)
        text = result["choices"][0]["message"]["content"].strip()
        tool_name  = "none"
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
#  GEMINI — Inventory scanning
# ══════════════════════════════════════════════════════════════════════════════
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
[{{"name":"scalpel","confidence":0.9,"x1":0.10,"y1":0.20,"x2":0.25,"y2":0.80}}]

Return [] if no instruments visible."""


def _iou(a: dict, b: dict) -> float:
    ix1 = max(a["x1"], b["x1"]); iy1 = max(a["y1"], b["y1"])
    ix2 = min(a["x2"], b["x2"]); iy2 = min(a["y2"], b["y2"])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    area_a = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"])
    area_b = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
    return inter / (area_a + area_b - inter)


def _nms_deduplicate(tools: list, iou_thresh: float = 0.4) -> list:
    if not tools:
        return tools
    from collections import defaultdict
    by_name = defaultdict(list)
    for t in tools:
        by_name[t["name"]].append(t)
    result = []
    for name, group in by_name.items():
        group = sorted(group, key=lambda x: x["confidence"], reverse=True)
        kept  = []
        used  = [False] * len(group)
        for i, a in enumerate(group):
            if used[i]:
                continue
            for j, b in enumerate(group):
                if i != j and not used[j] and _iou(a["box"], b["box"]) > iou_thresh:
                    used[j] = True
            kept.append(a)
            used[i] = True
        result.extend(kept)
    return result


def _gemini_inventory(image_b64: str) -> list:
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
        req = urllib.request.Request(url, data=payload,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
        raw = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"): raw = raw[4:]
        raw = raw.strip()
        items = json.loads(raw)
        if not isinstance(items, list):
            return []
        valid = []
        for t in items:
            if "box_2d" in t:
                coords = t["box_2d"]
                y1 = max(0.0, coords[0] / 1000); x1 = max(0.0, coords[1] / 1000)
                y2 = min(1.0, coords[2] / 1000); x2 = min(1.0, coords[3] / 1000)
                name = t.get("label", "unknown").lower().replace(" ", "_")
                conf = float(t.get("confidence", 0.85))
            elif "x1" in t:
                x1 = max(0.0, float(t.get("x1", 0))); y1 = max(0.0, float(t.get("y1", 0)))
                x2 = min(1.0, float(t.get("x2", 1))); y2 = min(1.0, float(t.get("y2", 1)))
                name = t.get("name", "unknown").lower().replace(" ", "_")
                conf = float(t.get("confidence", 0.7))
            elif "box" in t and isinstance(t["box"], dict):
                box  = t["box"]
                x1 = max(0.0, float(box.get("x1", 0))); y1 = max(0.0, float(box.get("y1", 0)))
                x2 = min(1.0, float(box.get("x2", 1))); y2 = min(1.0, float(box.get("y2", 1)))
                name = t.get("name", "unknown").lower().replace(" ", "_")
                conf = float(t.get("confidence", 0.7))
            else:
                continue
            if x2 <= x1 or y2 <= y1:
                continue
            valid.append({"name": name, "confidence": conf,
                          "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2}})
        valid = _nms_deduplicate(valid)
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


def scan_inventory(image_b64: str) -> list:
    if GEMINI_API_KEY:
        return _gemini_inventory(image_b64)
    elif GROQ_API_KEY:
        return _groq_inventory_fallback(image_b64)
    else:
        print("[Inventory] No API key found")
        return []


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


# ══════════════════════════════════════════════════════════════════════════════
#  API
# ══════════════════════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup():
    init_db()
    print("✓ PostgreSQL database ready")
    print("✓ SurgiSense backend ready — camera runs in browser")


# ── Live detection — browser sends frame every 3s ─────────────────────────────
@app.post("/api/detect")
async def detect(body: dict = Body(...)):
    image_b64 = body.get("image", "")
    if not image_b64:
        return JSONResponse({"error": "No image provided"}, status_code=400)
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]

    result = call_groq_vision(image_b64)
    now    = time.strftime("%Y-%m-%dT%H:%M:%S")

    data = {
        "tools":     [result] if result else [],
        "events":    [result] if result else [],
        "timestamp": now,
    }

    # Only broadcast when tool detected
    if result:
        print(f"[Detect] ✅ {result['name']} ({result['confidence']:.0%})")
        dead = []
        for ws in ws_clients:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            ws_clients.remove(ws)

    return JSONResponse(data)


# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/detection")
async def ws_detection(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    print(f"[WS] Client connected. Total: {len(ws_clients)}")
    try:
        while True:
            await asyncio.sleep(30)  # keep alive
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if ws in ws_clients:
            ws_clients.remove(ws)
        print(f"[WS] Client disconnected. Total: {len(ws_clients)}")


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


# ── Chat — Gemini SurgiBot ────────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(body: dict):
    api_key = GEMINI_API_KEY
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


# ── Inventory ─────────────────────────────────────────────────────────────────
@app.post("/api/inventory/scan")
async def inventory_scan(body: dict = Body(...)):
    image_b64 = body.get("image", "")
    if not image_b64:
        return JSONResponse({"error": "No image provided"}, status_code=400)
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    tools = scan_inventory(image_b64)
    return JSONResponse({"tools": tools, "count": len(tools)})

@app.post("/api/inventory/save")
async def inventory_save(body: dict = Body(...)):
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
        return JSONResponse({"error": "No pre-surgery inventory found."}, status_code=404)
    pre_tools = row["tools_json"]
    from collections import Counter
    pre_counts  = Counter(t["name"] for t in pre_tools)
    post_counts = Counter(t["name"] for t in post_tools)
    present, missing, extra = [], [], []
    for name, pre_qty in pre_counts.items():
        post_qty = post_counts.get(name, 0)
        if post_qty >= pre_qty:
            present.extend([t for t in post_tools if t["name"] == name][:pre_qty])
        elif post_qty > 0:
            present.extend([t for t in post_tools if t["name"] == name])
            for _ in range(pre_qty - post_qty):
                missing.append({"name": name, "expected": pre_qty, "found": post_qty})
        else:
            missing.append({"name": name, "expected": pre_qty, "found": 0})
    for name, post_qty in post_counts.items():
        pre_qty = pre_counts.get(name, 0)
        if post_qty > pre_qty:
            extra.extend([t for t in post_tools if t["name"] == name][pre_qty:])
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
    return {"status": "ok", "mode": "browser-camera"}


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)