import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
from auth import get_password_hash, verify_password, create_access_token

router = APIRouter(prefix="/api/students", tags=["students"])


@router.post("/register", response_model=schemas.StudentOut, status_code=201)
def register_student(student: schemas.StudentCreate, db: Session = Depends(get_db)):
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


@router.post("/login", response_model=schemas.Token)
def login_student(credentials: schemas.LoginRequest, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.usn == credentials.id).first()
    if not student or not verify_password(credentials.password, student.password_hash):
        raise HTTPException(status_code=401, detail="Invalid USN or password")
    token = create_access_token({"sub": student.usn, "role": "student", "name": student.name})
    return {"access_token": token, "token_type": "bearer", "role": "student"}


@router.get("/{usn}", response_model=schemas.StudentOut)
def get_student(usn: str, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student
