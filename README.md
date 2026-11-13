# SurgiSense

**AI-assisted surgical instrument recognition, inventory reconciliation, and procedural training.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Frontend: React](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-149eca)](https://react.dev/)
[![Backend: FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688)](https://fastapi.tiangolo.com/)

**Hosted frontend:** [surgisense.vercel.app](https://surgisense.vercel.app/)  

SurgiSense is a web-based prototype that combines a browser camera interface, vision-language models, and a PostgreSQL database to support surgical-instrument recognition and training workflows. It includes live instrument identification, pre- and post-procedure inventory scanning, quantity reconciliation, and an AI conversational assistant called **SurgiBot**.

> **Project status:** Research and educational prototype. SurgiSense has not been established as a clinically validated medical device. Do not use its detections or inventory results to make clinical decisions or as a substitute for established operating-room instrument-count procedures.

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available API endpoints](#available-api-endpoints)
- [Troubleshooting](#troubleshooting)
- [Security and responsible use](#security-and-responsible-use)
- [Contributing](#contributing)
- [License](#license)

## Features

### Live instrument recognition

- Captures camera frames in the browser.
- Sends frames to the FastAPI backend for vision-based analysis.
- Uses the Groq-hosted Llama 4 Scout vision model to identify a supported surgical instrument.
- Publishes successful detections to connected clients through a WebSocket endpoint.

### Surgical procedure training

- Loads procedures and their stages from PostgreSQL.
- Associates each stage with a required instrument.
- Uses live detections in the training workflow.
- Records completed assessment results in the database.

### Inventory scanning and reconciliation

- Scans pre-procedure and post-procedure instrument trays.
- Uses Gemini vision models for multi-instrument identification and bounding-box data.
- Supports OpenRouter and Groq-based fallback paths in the inventory implementation.
- Compares instrument quantities and reports instruments classified as present, missing, or extra.
- Stores inventory sessions in PostgreSQL.

### SurgiBot

- Provides a conversational assistant through the application interface.
- Uses the Google Gemini API to generate responses.

## How it works

The application uses separate AI request paths for live recognition, inventory scanning, and chat. It does **not** currently use a single unified, locally trained object-detection model.

```mermaid
flowchart TD
    Browser[React application in browser]
    API[FastAPI backend]
    Groq["Groq Vision API<br/>Llama 4 Scout"]
    Gemini["Google Gemini API<br/>Inventory scanning and SurgiBot"]
    OpenRouter["OpenRouter API<br/>Inventory fallback"]
    DB[(PostgreSQL)]

    Browser -->|Camera frames| API
    API -->|Live instrument recognition| Groq
    Groq --> API
    API -->|Inventory scan| Gemini
    Gemini --> API
    API -.->|Fallback when configured| OpenRouter
    OpenRouter -.-> API
    API -->|Procedures, stages, results, inventory| DB
    DB --> API
    API --> Browser
```

## Technology stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Radix UI |
| Backend | Python, FastAPI, Uvicorn |
| Database | PostgreSQL, psycopg2 |
| Live vision | Groq API — `meta-llama/llama-4-scout-17b-16e-instruct` |
| Inventory vision | Google Gemini API, with configured fallback integrations |
| AI assistant | Google Gemini API |
| Frontend data validation | Zod |

## Repository structure

```text
Surgisense/
├── backend/
│   └── server.py              # FastAPI application and backend logic
├── client/
│   ├── public/                # Static frontend assets
│   ├── src/                   # React application source
│   ├── package.json           # Frontend dependencies and scripts
│   └── vite.config.ts         # Vite configuration and local API proxy
├── shared/
│   └── schema.ts              # Shared database/schema definitions
├── DIAGRAMS_MERMAID.md        # Mermaid architecture and workflow diagrams
├── DIAGRAM_ANALYSIS.md       # Diagram analysis and supporting notes
├── LICENSE
└── README.md
```

## Prerequisites

Install the following before setting up the project:

- **Python 3.10 or later**
- **Node.js 18 or later** and npm
- **PostgreSQL**
- A **Groq API key** for live camera-based instrument recognition
- A **Google Gemini API key** for SurgiBot and the primary inventory-scanning path
- An **OpenRouter API key** (optional) for the configured inventory fallback path

A browser that supports camera access is also required. Grant camera permission when prompted. Camera access normally requires `localhost` during local development or HTTPS in a deployed environment.

## Getting started

The frontend and backend run as separate processes. Keep both terminals open while developing.

### 1. Clone the repository

```bash
git clone https://github.com/AMDHAAROON/Surgisense.git
cd Surgisense
```

### 2. Create the PostgreSQL database

Connect to PostgreSQL as an administrative user:

```bash
psql -U postgres
```

Create an application user and database. Replace the example password with a strong, unique password:

```sql
CREATE USER surgitrack_user WITH PASSWORD 'replace_with_a_strong_password';
CREATE DATABASE surgitrack OWNER surgitrack_user;
\q
```

The backend creates its application tables during startup and inserts sample procedures and stages when the `procedures` table is empty. The sample data includes Craniotomy, Spinal Fusion, Appendectomy, and Basic Suturing. The database server must be running before the backend starts.

### 3. Configure the backend environment

Create a file named `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
DATABASE_URL=postgresql://surgitrack_user:replace_with_a_strong_password@localhost:5432/surgitrack
```

`OPENROUTER_API_KEY` is optional. Keep the `.env` file private and do not commit API keys or database credentials.

See [Environment variables](#environment-variables) for the role of each setting.

### 4. Install and start the backend

Open a terminal at the repository root, then run:

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

**Windows PowerShell:**

```powershell
.\venv\Scripts\Activate.ps1
```

**macOS / Linux:**

```bash
source venv/bin/activate
```

Install the backend dependencies:

```bash
python -m pip install --upgrade pip
pip install fastapi "uvicorn[standard]" psycopg2-binary python-dotenv httpx
```

Start the backend from the `backend` directory:

```bash
python server.py
```

The API will be available at `http://localhost:8000`. Interactive API documentation is available at `http://localhost:8000/docs`, and the health endpoint is `http://localhost:8000/api/health`.

### 5. Install and start the frontend

Open a **second terminal** at the repository root:

```bash
cd client
npm install
npm run dev
```

To create a production frontend build, run `npm run build` from the `client` directory.

Vite starts the frontend at:

```text
http://localhost:5173
```

The Vite development configuration proxies `/api`, `/stream`, and `/ws` requests to the backend on port `8000`.

### 6. Open the application

Visit `http://localhost:5173` in your browser and grant camera permission when prompted. Keep the backend and frontend processes running while using the application.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Yes for live recognition | Authenticates live camera-frame recognition. Also supports the inventory fallback path when a Gemini key is not configured. |
| `GEMINI_API_KEY` | Yes for SurgiBot and primary inventory scanning | Authenticates SurgiBot requests and the primary inventory-scanning integration. |
| `OPENROUTER_API_KEY` | Optional | Enables the configured OpenRouter inventory fallback when the Gemini inventory request path fails. |
| `DATABASE_URL` | Required for the configured database | PostgreSQL connection string used by the backend. |

For the complete application feature set, configure both `GROQ_API_KEY` and `GEMINI_API_KEY`. Add `OPENROUTER_API_KEY` if you want the configured OpenRouter fallback to be available.

## Available API endpoints

The following routes are defined by the FastAPI backend.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend health check |
| `POST` | `/api/detect` | Analyze a browser camera frame for a single instrument |
| `WS` | `/ws/detection` | Receive live detection events |
| `GET` | `/api/procedures` | List available procedures |
| `GET` | `/api/procedures/{proc_id}/stages` | List stages for a procedure |
| `POST` | `/api/tests/results` | Save a procedure-training result |
| `GET` | `/api/tests/results` | Retrieve recent procedure-training results |
| `POST` | `/api/contact` | Submit a contact message |
| `POST` | `/api/chat` | Send a message to SurgiBot |
| `POST` | `/api/inventory/scan` | Scan an inventory image |
| `POST` | `/api/inventory/scan-post` | Scan a post-procedure tray using pre-procedure instrument names as context |
| `POST` | `/api/inventory/save` | Save an inventory session |
| `POST` | `/api/inventory/reconcile` | Compare pre- and post-procedure inventories |
| `GET` | `/api/inventory/session/{session_id}` | Retrieve an inventory session |
| `GET` | `/api/inventory/latest/{session_type}` | Retrieve the latest saved pre- or post-procedure inventory |

For request and response details, run the backend and open `http://localhost:8000/docs`.

## Troubleshooting

| Issue | What to check |
|---|---|
| Live recognition returns no instrument | Confirm `GROQ_API_KEY` is valid, the backend is running, and the camera image contains a clearly visible supported instrument. |
| SurgiBot does not respond | Confirm `GEMINI_API_KEY` is set in `backend/.env` and the key has access to the configured Gemini API. |
| Inventory scanning returns no results | Check the Gemini key and backend logs. Configure `OPENROUTER_API_KEY` to enable the implemented OpenRouter fallback. If Gemini is not configured, the inventory path can use the Groq fallback when `GROQ_API_KEY` is available. |
| Database connection fails | Confirm PostgreSQL is running and `DATABASE_URL` contains the correct username, password, host, port, and database name. |
| Browser camera is unavailable | Allow camera access and use `localhost` or an HTTPS origin. Check that another application is not exclusively using the camera. |
| Frontend cannot reach the backend | Confirm the backend is listening on port `8000` and the frontend is running with the repository's Vite configuration. |

## Security and responsible use

- Store API keys and database credentials in environment variables. Never commit `.env` files or secrets.
- The current backend configuration is a development-oriented implementation. Review CORS settings, authentication, authorization, rate limiting, input validation, logging, and data-retention policies before exposing it to public or institutional networks.
- Treat model-generated instrument labels, bounding boxes, and confidence values as estimates. They are not independently verified clinical measurements.
- Do not use SurgiSense as the sole method for surgical instrument counts, retained-item prevention, clinical decisions, or patient care.
- Use synthetic or appropriately authorized data during development and testing. Protect any images or records that could contain patient or institutional information.

## Contributing

Contributions, bug reports, and suggestions are welcome. Before submitting a change:

1. Describe the issue or proposed improvement clearly.
2. Keep frontend and backend changes consistent with the documented API contracts.
3. Test the affected workflow locally.
4. Avoid committing secrets, credentials, or sensitive data.

## License

This project is licensed under the [MIT License](LICENSE).
