# SurgiTrack - Comprehensive Diagram Analysis

## Project Overview
**SurgiTrack** (SurgiBot) is a surgical training and inventory management system with AI-powered tool detection. It features real-time video analysis, surgical procedure testing, and inventory reconciliation.

---

## 1. ARCHITECTURE DIAGRAM

### System Components

**Client Layer:**
- React UI Components (Vite-based)
- Wouter Router (page navigation)
- React Query (data fetching & caching)
- State Management (useState hooks)

**Page Components:**
- **Home.tsx** - Landing page
- **Test.tsx** - Surgical procedure training/testing
- **Inventory.tsx** - Pre/post-surgery tool reconciliation
- **About.tsx** - Application information

**Feature Components:**
- **SurgiBot** - AI chat assistant (floating widget)
- **VideoFeed** - Real-time camera integration for tool detection
- **TestSummaryDialog** - Results display after procedure test
- **AppShell** - Main layout wrapper

**Client Services:**
- **API Layer** (api.ts) - Type-safe REST endpoints
- **Custom Hooks** - useProcedures(), useProcedureStages(), useContact()
- **Utils** - Theme management, formatting utilities

**Backend Layer (FastAPI):**
- CORS middleware for cross-origin requests
- WebSocket handling
- Vision API integration
- LLM integration for chat

**External APIs:**
- **Groq Vision** - Surgical tool detection from images
- **Gemini Vision** - Confidence scoring & validation
- **LLM Chat** - SurgiBot conversational responses

**Database:**
- PostgreSQL (drizzle-orm)
- Schema tables: Procedures, Stages, TestResults, ContactMessages

### Key Relationships
```
Frontend ←→ Backend (REST/JSON)
Backend ←→ PostgreSQL (queries)
Backend ←→ External APIs (vision detection, LLM)
Frontend ←→ React Query (state management)
```

---

## 2. DATA FLOW DIAGRAM

### Information Movement

**Input Stage:**
1. User captures image via WebUI
2. Image converted to Base64 string
3. Input validation (size, format)

**Detection Pipeline:**
1. Send to `/api/inventory/detect-pre` endpoint
2. Groq Vision processes image
3. Gemini Vision enhances confidence scores
4. Returns detected tools array

**Comparison Pipeline:**
1. Two images compared: PRE and POST
2. Groq detects tools in both
3. Backend compares tool lists
4. Returns: missing, extra, present tools

**Chat Pipeline:**
1. User sends query to `/api/chat`
2. LLM processes with surgical context
3. SurgiBot response returned to UI

**Data Persistence:**
1. Fetch procedures from DB via `/api/procedures`
2. Save test results to `/api/tests/results`
3. Store contact messages in DB

**Key Data Types:**
- `DetectedTool`: {name, confidence, boundingBox}
- `CompareResult`: {allPresent, missing[], extra[], summary}
- `TestResult`: {procedureId, marks, totalStages}

---

## 3. ACTIVITY DIAGRAM

### Surgical Test Procedure Workflow

**Workflow Steps:**

1. **Start Test** → User initiates from home page
2. **Select Procedure** → Choose from available surgical procedures
3. **Load Stages** → Backend fetches procedure stages with required tools
4. **Display Stage** → Show current stage (e.g., "Use Scalpel")
5. **Start Video Feed** → Activate camera & detection engine
6. **Tool Detection Loop:**
   - If correct tool detected → Mark stage complete
   - If wrong tool detected → Alert user, loop back
   - If no tool detected → Wait for detection
7. **Check Progress:**
   - If more stages → Advance to next stage (go to step 4)
   - If all complete → Proceed
8. **Calculate Score** → marks/totalStages * 100
9. **Show Summary Dialog** → Results with percentage & performance
10. **Save Result** → Store in database with timestamp
11. **Test Complete** → Return to home

**Loop Conditions:**
- Tool detection retries until correct tool shown
- Advances through stages sequentially
- Cannot skip stages

---

## 4. SEQUENCE DIAGRAM

### Inventory Reconciliation Interaction Flow

**Actor:** Surgeon/Staff

**Pre-Surgery Phase:**
```
User → UI: Capture PRE image
UI → File System: Convert to Base64
User → UI: Click "Detect Pre-Surgery Tools"
UI → API: POST /api/inventory/detect-pre {preImage}
API → Groq: Process image with vision model
Groq → Gemini: Get confidence validation
Gemini → Groq: Return scored detections
Groq → API: Tool array [{name, confidence, bbox}...]
API → UI: Response {tools: [...], count: n}
UI → User: Display detected tools in panel
```

**Post-Surgery Phase:**
```
User → UI: Capture POST image
UI → File System: Convert to Base64
User → UI: Click "Compare"
UI → API: POST /api/inventory/compare {postImage, preTools}
API → Groq: Detect POST image tools
Groq → API: POST tool list
API → Algorithm: Compare (PRE vs POST)
API → UI: {allPresent, missing[], extra[], summary}
UI → User: Visual results (✓ present, ✗ missing, ⚠ extra)
User → UI: Click "Save Results"
UI → DB: INSERT test_session
DB → UI: Confirmation
```

**Response Times:**
- Image capture: immediate
- Vision detection: 2-5 seconds
- Comparison: <1 second
- Database save: <500ms

---

## 5. CLASS DIAGRAM

### Data Models & Entity Relationships

**Core Entities:**

```
PROCEDURE
├─ id: int (PK)
├─ name: string (e.g., "Appendectomy")
└─ description: string

STAGE (1:N with Procedure)
├─ id: int (PK)
├─ procedureId: int (FK)
├─ name: string (e.g., "Initial Incision")
├─ requiredTool: string (e.g., "scalpel")
└─ order: int

TEST_RESULT (N:1 with Procedure)
├─ id: int (PK)
├─ procedureId: int (FK)
├─ marks: int (score)
├─ totalStages: int
└─ completedAt: timestamp

CONTACT_MESSAGE
├─ id: int (PK)
├─ name: string
├─ email: string
├─ message: string
└─ createdAt: timestamp

DETECTED_TOOL (value object)
├─ name: string
├─ confidence: number (0-1)
└─ boundingBox: BBox

BBOX (value object)
├─ x1: number
├─ y1: number
├─ x2: number
└─ y2: number

COMPARE_RESULT (value object)
├─ allPresent: boolean
├─ preCount: int
├─ postCount: int
├─ present: DetectedTool[]
├─ missing: string[]
├─ extra: DetectedTool[]
└─ summary: string

CHAT_MESSAGE
├─ role: enum('user' | 'assistant')
└─ content: string
```

**Relationships:**
- Procedure (1) ─→ (*) Stage
- Procedure (1) ─→ (*) TestResult
- TestResult → DetectedTool[]
- CompareResult → (present[], missing[], extra[])
- DetectedTool (1) → (1) BBox

---

## API Endpoints Summary

| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| GET | `/api/procedures` | List all procedures | - | Procedure[] |
| GET | `/api/procedures/:id/stages` | Get stages for procedure | id | Stage[] |
| POST | `/api/inventory/detect-pre` | Detect tools in PRE image | base64 image | Tool[] |
| POST | `/api/inventory/compare` | Compare PRE vs POST | images + tools | CompareResult |
| POST | `/api/chat` | AI chat assistant | messages[] | ChatResponse |
| POST | `/api/contact` | Submit contact form | form data | {success: bool} |
| POST | `/api/tests/results` | Save test score | result data | TestResult |

---

## Technology Stack

**Frontend:**
- React 18.x (TypeScript)
- Vite (build tool)
- TailwindCSS (styling)
- Shadcn/ui (components)
- Wouter (routing)
- React Query (data fetching)
- Zod (validation)

**Backend:**
- FastAPI (Python)
- PostgreSQL + Drizzle ORM
- Groq API (vision model)
- Gemini API (vision enhancement)
- LLM (chat/completion)

**Deployment:**
- Frontend: Vercel
- Backend: Uvicorn server
- Database: PostgreSQL

---

## Key Features Mapped to Diagrams

| Feature | Architecture | Data Flow | Activity | Sequence | Class |
|---------|--------------|-----------|----------|----------|-------|
| Procedure Testing | ✓ Test page | ✓ API calls | ✓ Core flow | ✓ Tool detection | ✓ Procedure, Stage |
| Tool Detection | ✓ VideoFeed | ✓ Vision APIs | ✓ Detection loop | ✓ Groq/Gemini | ✓ DetectedTool |
| Inventory Check | ✓ Inventory page | ✓ Compare pipeline | ✓ Pre/post flow | ✓ Main sequence | ✓ CompareResult |
| AI Chat | ✓ SurgiBot | ✓ Chat pipeline | ✓ Background | ✓ Simple | ✓ ChatMessage |
| Results Storage | ✓ DB layer | ✓ Persistence | ✓ Final step | ✓ Save step | ✓ TestResult |

---

## Diagram Usage Tips

1. **Architecture Diagram** - Use for system overview, presentation to stakeholders
2. **Data Flow Diagram** - Use for understanding data movement, API design
3. **Activity Diagram** - Use for process documentation, user training
4. **Sequence Diagram** - Use for developer onboarding, system interactions
5. **Class Diagram** - Use for database schema review, API contract definition

