"""
Seed script: RESETS the database and creates only faculty + subjects.
Students register themselves through the app.
Run with: python seed.py
"""
import os
import shutil
from sqlalchemy.orm import Session
from database import engine, SessionLocal, Base
from models import Student, Faculty, Subject, AttendanceRecord, FaceSample, FaceEncoding, ClassSession
from auth import get_password_hash

# ——— RESET: Drop and recreate all tables ———
print("🗑  Dropping all tables...")
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
print("✓ Database reset complete")

# ——— Clean face data directories ———
data_dir = os.path.join(os.path.dirname(__file__), "data")
for subdir in ["faces", "encodings"]:
    dirpath = os.path.join(data_dir, subdir)
    if os.path.isdir(dirpath):
        shutil.rmtree(dirpath)
    os.makedirs(dirpath, exist_ok=True)
print("✓ Face data directories cleaned")

db: Session = SessionLocal()

try:
    # ——— Faculty ———
    fac = Faculty(
        faculty_id="FAC-205",
        name="Dr. Ravi Kumar",
        dept="CS",
        password_hash=get_password_hash("admin123"),
    )
    db.add(fac)
    db.commit()
    db.refresh(fac)
    print("✓ Faculty created: FAC-205 / admin123")

    # ——— Subjects ———
    subjects_data = [
        ("Machine Learning", "21CS71", fac.id),
        ("Big Data Analytics", "21CS72", fac.id),
        ("Computer Networks", "21CS73", fac.id),
        ("Cloud Computing", "21CS74", fac.id),
    ]
    for name, code, fid in subjects_data:
        s = Subject(name=name, code=code, faculty_id=fid)
        db.add(s)
        db.commit()
        print(f"✓ Subject created: {code} — {name}")

    # ——— ONE test student (for immediate testing) ———
    student = Student(
        usn="U24AN23S0001",
        name="Anisha Rao",
        dept="CS",
        semester=6,
        password_hash=get_password_hash("student123"),
    )
    db.add(student)
    db.commit()
    print("✓ Student created: U24AN23S0001 / student123")

    print("\n✅ Seed complete!")
    print("   Faculty: FAC-205 / admin123")
    print("   Student: U24AN23S0001 / student123")
    print("   No attendance data — fresh start!")

finally:
    db.close()
