from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
import models, schemas
from auth import get_password_hash, verify_password, create_access_token

router = APIRouter(prefix="/api/faculty", tags=["faculty"])


@router.post("/register", response_model=schemas.FacultyOut, status_code=201)
def register_faculty(faculty: schemas.FacultyCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Faculty).filter(models.Faculty.faculty_id == faculty.faculty_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Faculty ID already registered")
    db_faculty = models.Faculty(
        faculty_id=faculty.faculty_id,
        name=faculty.name,
        dept=faculty.dept,
        password_hash=get_password_hash(faculty.password),
    )
    db.add(db_faculty)
    db.commit()
    db.refresh(db_faculty)
    return db_faculty


@router.post("/login", response_model=schemas.Token)
def login_faculty(credentials: schemas.LoginRequest, db: Session = Depends(get_db)):
    faculty = db.query(models.Faculty).filter(models.Faculty.faculty_id == credentials.id).first()
    if not faculty or not verify_password(credentials.password, faculty.password_hash):
        raise HTTPException(status_code=401, detail="Invalid Faculty ID or password")
    token = create_access_token({"sub": faculty.faculty_id, "role": "faculty", "name": faculty.name})
    return {"access_token": token, "token_type": "bearer", "role": "faculty"}


@router.get("/pending-registrations")
def get_pending_registrations(db: Session = Depends(get_db)):
    # Students with at least one pending face sample
    results = (
        db.query(
            models.Student.id,
            models.Student.usn,
            models.Student.name,
            models.Student.dept,
            func.count(models.FaceSample.id).label("sample_count"),
            func.min(models.FaceSample.uploaded_at).label("uploaded_at"),
        )
        .join(models.FaceSample, models.FaceSample.student_id == models.Student.id)
        .filter(models.FaceSample.status == models.FaceSampleStatus.pending)
        .group_by(models.Student.id)
        .all()
    )

    return [
        {
            "student_id": r.id,
            "usn": r.usn,
            "name": r.name,
            "dept": r.dept,
            "sample_count": r.sample_count,
            "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
        }
        for r in results
    ]


@router.get("/defaulters")
def get_defaulters(threshold: float = 75.0, db: Session = Depends(get_db)):
    students = db.query(models.Student).all()
    defaulters = []

    for student in students:
        records = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.student_id == student.id
        ).all()
        if not records:
            continue
        total = len(records)
        present = sum(1 for r in records if r.status == models.AttendanceStatus.present)
        pct = (present / total) * 100
        if pct < threshold:
            shortage = round((threshold / 100 * total) - present)
            defaulters.append({
                "student_id": student.id,
                "usn": student.usn,
                "name": student.name,
                "dept": student.dept,
                "attendance_percentage": round(pct, 1),
                "shortage": shortage,
            })

    # Sort worst first
    return sorted(defaulters, key=lambda x: x["attendance_percentage"])
