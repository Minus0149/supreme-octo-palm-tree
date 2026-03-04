import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from auth import get_password_hash
from face_engine import is_trained

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/students", response_model=schemas.StudentOut, status_code=201)
def admin_create_student(student: schemas.StudentCreate, db: Session = Depends(get_db)):
    """Admin creates student credentials. Student does their own face scan separately."""
    existing = db.query(models.Student).filter(models.Student.usn == student.usn).first()
    if existing:
        raise HTTPException(status_code=409, detail="USN already registered")
    db_student = models.Student(
        usn=student.usn,
        name=student.name,
        dept=student.dept,
        semester=student.semester,
        password_hash=get_password_hash(student.password),
    )
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return db_student


@router.get("/students")
def list_all_students(db: Session = Depends(get_db)):
    """Returns all students with their face registration and training status."""
    students = db.query(models.Student).all()
    result = []
    for s in students:
        pending = db.query(models.FaceSample).filter(
            models.FaceSample.student_id == s.id,
            models.FaceSample.status == models.FaceSampleStatus.pending,
        ).count()
        approved = db.query(models.FaceSample).filter(
            models.FaceSample.student_id == s.id,
            models.FaceSample.status == models.FaceSampleStatus.approved,
        ).count()
        result.append({
            "id": s.id,
            "usn": s.usn,
            "name": s.name,
            "dept": s.dept,
            "semester": s.semester,
            "registered_at": s.registered_at.isoformat(),
            "face_status": (
                "trained" if is_trained(s.usn)
                else "approved" if approved > 0
                else "pending" if pending > 0
                else "unregistered"
            ),
        })
    return result


@router.delete("/students/{usn}", status_code=204)
def delete_student(usn: str, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(student)
    db.commit()
    # Clean up data files
    import shutil
    face_dir = os.path.join("data", "faces", usn)
    enc_file = os.path.join("data", "encodings", f"{usn}.npy")
    if os.path.isdir(face_dir):
        shutil.rmtree(face_dir)
    if os.path.exists(enc_file):
        os.remove(enc_file)
