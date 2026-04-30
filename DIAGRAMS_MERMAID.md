# SurgiTrack - All Diagrams (Mermaid Code)

All diagrams below are in Mermaid syntax. Render them using:
- GitHub markdown
- Mermaid.live editor
- VS Code extensions
- Any Mermaid-compatible tool

---

## 1. ARCHITECTURE DIAGRAM

```mermaid
graph TB
    subgraph Client["Client Layer"]
        UI["React UI Components"]
        Router["Wouter Router"]
        QueryClient["React Query Client"]
        StateManagement["State Management"]
    end

    subgraph Pages["Page Components"]
        Home["Home.tsx"]
        Test["Test.tsx"]
        Inventory["Inventory.tsx"]
        About["About.tsx"]
    end

    subgraph Components["Features"]
        SurgiBot["SurgiBot<br/>AI Chat Assistant"]
        VideoFeed["VideoFeed<br/>Real-time Tool Detection"]
        TestSummaryDialog["Test Summary<br/>Dialog"]
        AppShell["AppShell<br/>Layout Shell"]
    end

    subgraph Services["Client Services"]
        APILayer["API Layer<br/>api.ts"]
        Hooks["Custom Hooks<br/>use-procedures, use-contact"]
        Utils["Utils<br/>Theme, Utils"]
    end

    subgraph Backend["Backend Layer"]
        FastAPI["FastAPI Server"]
        Groq["Groq Vision API<br/>Surgical Tool Detection"]
        Gemini["Gemini Vision API<br/>Inventory Detection"]
        AIChat["LLM Chat<br/>SurgiBot"]
    end

    subgraph Database["Data Layer"]
        PostgreSQL["PostgreSQL"]
        Schema["Procedures Table<br/>Stages Table<br/>Test Results Table<br/>Contact Messages Table"]
    end

    UI --> Router
    Router --> Pages
    Pages --> Components
    Components --> QueryClient
    QueryClient --> StateManagement
    StateManagement --> APILayer
    APILayer --> FastAPI
    
    FastAPI --> Groq
    FastAPI --> Gemini
    FastAPI --> AIChat
    FastAPI --> PostgreSQL
    PostgreSQL --> Schema
    
    Hooks --> APILayer
```

---

## 2. DATA FLOW DIAGRAM

```mermaid
graph LR
    User["👤 User"]
    
    subgraph Frontend["Frontend"]
        WebUI["Web UI<br/>Capture Image"]
        Base64["Convert to<br/>Base64"]
        Validate["Validate<br/>Input"]
    end
    
    subgraph APIEndpoints["API Endpoints"]
        DetectPre["/api/inventory/<br/>detect-pre"]
        Compare["/api/inventory/<br/>compare"]
        ChatAPI["/api/chat"]
        ProcList["/api/procedures"]
        TestResult["/api/tests/results"]
    end
    
    subgraph Vision["Vision APIs"]
        Groq["Groq Vision<br/>Tool Detection"]
        Gemini["Gemini Vision<br/>Confidence Scores"]
    end
    
    subgraph DataStore["Data Storage"]
        ProcDB["Procedures &<br/>Stages"]
        TestDB["Test Results"]
        ContactDB["Contact Messages"]
    end
    
    subgraph AIServices["AI Services"]
        LLM["LLM Chat<br/>SurgiBot Response"]
    end
    
    subgraph Response["Response Data"]
        DetectResult["Detected Tools<br/>Tool List + Confidence"]
        CompareResult["Comparison Result<br/>Missing/Extra Tools"]
        ChatResp["Chat Response<br/>Surgical Info"]
    end
    
    User -->|Input Image| WebUI
    WebUI --> Base64
    Base64 --> Validate
    
    Validate -->|Send| DetectPre
    DetectPre --> Groq
    Groq --> Gemini
    Gemini -->|Tool Data| DetectResult
    DetectResult -->|Response| User
    
    Validate -->|Send PRE+POST| Compare
    Compare --> Groq
    Compare -->|Compare| CompareResult
    CompareResult -->|Response| User
    
    User -->|Query| ChatAPI
    ChatAPI --> LLM
    LLM -->|Response| ChatResp
    ChatResp -->|Display| User
    
    WebUI -->|Fetch| ProcList
    ProcList --> ProcDB
    ProcDB -->|Data| WebUI
    
    Validate -->|Save| TestResult
    TestResult --> TestDB
```

---

## 3. ACTIVITY DIAGRAM

```mermaid
graph TD
    Start([User Starts Test]) --> SelectProc["Select Procedure"]
    SelectProc --> LoadStages["Load Procedure Stages"]
    LoadStages --> DisplayStage["Display Current Stage<br/>with Required Tool"]
    DisplayStage --> StartVideo["Start Video Feed"]
    StartVideo --> Detect{Tool Detected?}
    
    Detect -->|No| Wait["Wait for Detection"]
    Wait --> Detect
    
    Detect -->|Yes, Correct Tool| Mark["Mark Stage Complete"]
    Mark --> CheckAll{All Stages<br/>Complete?}
    
    CheckAll -->|No| NextStage["Advance to<br/>Next Stage"]
    NextStage --> DisplayStage
    
    CheckAll -->|Yes| CalcScore["Calculate Score &<br/>Progress %"]
    CalcScore --> ShowSummary["Show Test Summary<br/>Dialog"]
    ShowSummary --> Save["Save Test Result<br/>to Database"]
    Save --> End([Test Complete])
    
    Detect -->|No, Wrong Tool| Alert["Alert User<br/>Wrong Tool Shown"]
    Alert --> Detect
```

---

## 4. SEQUENCE DIAGRAM

```mermaid
sequenceDiagram
    actor User
    participant UI as Inventory.tsx
    participant API as FastAPI Backend
    participant Groq as Groq Vision
    participant Gemini as Gemini Vision
    participant DB as PostgreSQL
    
    User->>UI: 1. Capture PRE-Surgery Image
    UI->>UI: Convert to Base64
    
    User->>UI: 2. Click "Detect Pre-Surgery Tools"
    UI->>API: POST /api/inventory/detect-pre<br/>{preImage: base64}
    API->>Groq: Send image for tool detection
    Groq->>Gemini: Get confidence scores
    Gemini-->>Groq: Tool list + confidence
    Groq-->>API: Detected tools array
    API-->>UI: {tools: [...], count: n}
    UI->>UI: Display detected tools<br/>in panel with badges
    
    User->>UI: 3. Capture POST-Surgery Image
    UI->>UI: Convert to Base64
    
    User->>UI: 4. Click "Compare"
    UI->>API: POST /api/inventory/compare<br/>{postImage: base64, preTools: array}
    API->>Groq: Detect POST tools
    Groq-->>API: POST tools array
    API->>API: Compare PRE vs POST
    API-->>UI: {allPresent, missing[], extra[], summary}
    UI->>UI: Show comparison results<br/>with visual indicators
    
    User->>UI: Save Results
    UI->>DB: Store test session
    DB-->>UI: Confirmation
    UI->>User: Session saved
```

---

## 5. CLASS DIAGRAM

```mermaid
classDiagram
    class Procedure {
        - id: int
        - name: string
        - description: string
    }
    
    class Stage {
        - id: int
        - procedureId: int
        - name: string
        - requiredTool: string
        - order: int
    }
    
    class TestResult {
        - id: int
        - procedureId: int
        - marks: int
        - totalStages: int
        - completedAt: timestamp
    }
    
    class ContactMessage {
        - id: int
        - name: string
        - email: string
        - message: string
        - createdAt: timestamp
    }
    
    class DetectedTool {
        - name: string
        - confidence: number
        - boundingBox: BBox
    }
    
    class BBox {
        - x1: number
        - y1: number
        - x2: number
        - y2: number
    }
    
    class CompareResult {
        - allPresent: boolean
        - preCount: int
        - postCount: int
        - present: DetectedTool[]
        - missing: string[]
        - extra: DetectedTool[]
        - summary: string
    }
    
    class ChatMessage {
        - role: 'user' | 'assistant'
        - content: string
    }
    
    Procedure "1" --> "*" Stage : has
    Procedure "1" --> "*" TestResult : records
    TestResult --> DetectedTool : contains
    CompareResult --> DetectedTool : has
    CompareResult --> DetectedTool : detects
    DetectedTool "1" --> "1" BBox : bound_by
```

---

## How to Use

### Option 1: GitHub/GitLab
Commit this file to repo - diagrams auto-render

### Option 2: Mermaid Live Editor
Visit https://mermaid.live and paste any diagram code

### Option 3: VS Code
Install "Markdown Preview Mermaid Support" extension

### Option 4: Export as PNG/SVG
Use https://kroki.io to convert Mermaid to images

### Option 5: Embed in Tools
- Notion, Confluence, GitHub Wiki support Mermaid natively
