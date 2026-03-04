import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import students, face, attendance, faculty, admin
import os

# Create the database tables (including any new ones added to models)
Base.metadata.create_all(bind=engine)

# Ensure data directories exist
os.makedirs("data/faces", exist_ok=True)
os.makedirs("data/encodings", exist_ok=True)

app = FastAPI(
    title="A.I.R.S — AI Attendance Recognition System",
    description="Backend API for face-based attendance tracking.",
    version="1.0.0",
)

# Allow requests from the Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(students.router)
app.include_router(face.router)
app.include_router(attendance.router)
app.include_router(faculty.router)
app.include_router(admin.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "system": "A.I.R.S", "version": "1.0.0"}

