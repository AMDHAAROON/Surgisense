# SurgiSense AI

SurgiSense is a real-time surgical tool tracking and training platform. It uses a webcam to detect surgical instruments through ArUco markers, guides trainees through step-by-step procedures, and provides AI assistance through SurgiBot powered by Google Gemini.

---

## 🛠 Tech Stack

- **Frontend** — React, TypeScript, TailwindCSS, shadcn/ui
- **Backend** — Python, FastAPI, OpenCV, MediaPipe
- **Database** — PostgreSQL
- **AI** — Google Gemini (gemini-2.5-flash)

---

## 🚀 Getting Started

**1. Clone the repo**
```
git clone https://github.com/AMDHAAROON/Surgisense.git
cd Surgisense
```

**2. Install Python packages**
```
pip install fastapi "uvicorn[standard]" opencv-contrib-python mediapipe numpy python-dotenv psycopg2-binary
```

**3. Install frontend packages**
```
npm install
```

**4. Set up PostgreSQL**
```
psql -U postgres
CREATE DATABASE surgitrack;
CREATE USER surgitrack_user WITH PASSWORD 'surgitrack123';
GRANT ALL PRIVILEGES ON DATABASE surgitrack TO surgitrack_user;
GRANT ALL ON SCHEMA public TO surgitrack_user;
\q
```

**5. Create backend/.env**
```
GEMINI_API_KEY=your_key_here
DATABASE_URL=postgresql://surgitrack_user:surgitrack123@localhost:5432/surgitrack
```

**6. Run the backend**
```
cd backend
python server.py
```

**7. Run the frontend**
```
npm run dev
```

Open http://localhost:5173 and click Start Camera to begin.

---

## 📄 License

MIT
