# AI-Powered Attendance Management System

A modern, faculty-driven, AI-powered attendance system built with Next.js, FastAPI, and DeepFace. It features a "surveillance" cyberpunk aesthetic, automated background face model training, and classroom-scale facial recognition.

## Features

### 👨‍🏫 Faculty-Driven Attendance
Faculty retain full control over the attendance process:
*   **Take Attendance:** Faculty initiate a live camera session, select a subject, and scan the classroom.
*   **Two Capture Modes:** 
    *   ⚡ **Quick Mode:** Captures 3 photos across 24 seconds for rapid testing.
    *   ⏱️ **Full Mode:** Captures 60 photos, 1 photo per minute, over a 60-minute class session.
*   **Classroom-Scale Recognition:** The AI detects *all* faces within a single frame and compares them against all registered students simultaneously.
*   **Faculty Monitor:** A real-time dashboard with a live CCTV feed, student defaulter lists, and a pending registration review panel. 
*   **Frame Preview Gallery:** Faculty can view the actual 30 frames submitted by a student before approving or rejecting their biometric registration.

### 🎓 Student Portal
*   **Simple Biometric Registration:** Students log in to a dedicated portal to capture 30 frames of their face from different angles.
*   **Status Tracking:** Students can track their registration status (Pending, Approved, Trained, Rejected).
*   **Attendance Summary:** Students can view their overall attendance percentages and breakdowns by subject.

### 🧠 Core Technology & AI Engine
*   **DeepFace Engine:** Replaced legacy libraries (`dlib`, `face_recognition`) with a state-of-the-art deep learning approach.
*   **RetinaFace Detector:** Highly accurate face detection capable of finding small or partially occluded faces (essential for classroom environments).
*   **ArcFace Recognizer:** Generates robust 512-dimensional facial embeddings for highly accurate 1-to-N matching.
*   **Asynchronous Background Training:** Heavy machine learning models (like ArcFace) are trained in background threads (`threading.Thread`) so the API never freezes and the UI remains responsive during faculty approval.

## Stack Overview
*   **Frontend:** Next.js 14, React, Tailwind CSS, Shadcn UI components, Lucide React icons.
*   **Backend:** FastAPI (Python), SQLAlchemy (SQLite), DeepFace, OpenCV.
*   **Security:** JWT based authentication, `bcrypt` password hashing, robust Next.js middleware routing roles.

## Getting Started

### Prerequisites
*   Node.js (v18+)
*   Python 3.10+

### Database Setup
To seed the database with a clean slate (1 Faculty, 4 Subjects, 1 Test Student):
```bash
cd backend
python3 seed.py
```

### Running the Backend
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Running the Frontend
```bash
cd attendance-app
npm install
npm run dev
# Server starts at http://localhost:3000
```

## Mock Accounts (From Seed)
*   **Student:** `U24AN23S0001` / `student123`
*   **Faculty:** `FAC-205` / `admin123`

## Architecture Notes
The backend uses a local SQLite database (`database.db`) to store student records and paths to facial encodings. Raw face registration frames are stored in `backend/data/faces/{usn}/` while compiled `.npy` embedding matrices are saved to `backend/data/encodings/`.
