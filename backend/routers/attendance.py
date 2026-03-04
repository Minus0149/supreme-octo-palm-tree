import os
import base64
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime
from database import get_db
import models, schemas
from face_engine import verify_face, is_trained, identify_faces, identify_faces_with_grid, PRESENCE_THRESHOLD, GRIDS_DIR

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


@router.post("/session/start")
def start_class_session(body: dict, db: Session = Depends(get_db)):
    subject_code = body.get("subject_code")
    faculty_id_str = body.get("faculty_id")

    if not subject_code or not faculty_id_str:
        raise HTTPException(status_code=400, detail="subject_code and faculty_id required")

    subject = db.query(models.Subject).filter(models.Subject.code == subject_code).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    faculty = db.query(models.Faculty).filter(models.Faculty.faculty_id == faculty_id_str).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty not found")

    # Check if there's already an active session for this subject
    existing = db.query(models.ClassSession).filter(
        models.ClassSession.subject_id == subject.id,
        models.ClassSession.is_active == True
    ).first()
    
    if existing:
        return {"session_id": existing.id, "message": "Resumed active session"}

    session = models.ClassSession(
        subject_id=subject.id,
        faculty_id=faculty.id,
        is_active=True,
        start_time=datetime.utcnow()
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Pre-populate attendance records as absent for all students
    students = db.query(models.Student).all()
    records = []
    for st in students:
        records.append(
            models.AttendanceRecord(
                student_id=st.id,
                session_id=session.id,
                status=models.AttendanceStatus.absent,
                method=models.AttendanceMethod.manual # Default to manual until scanned
            )
        )
    db.bulk_save_objects(records)
    db.commit()

    return {"session_id": session.id, "message": "Class started"}


@router.post("/session/{session_id}/end")
def end_class_session(session_id: int, db: Session = Depends(get_db)):
    session = db.query(models.ClassSession).filter(models.ClassSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.is_active = False
    session.end_time = datetime.utcnow()
    db.commit()
    return {"message": "Class ended"}


@router.get("/session/active/{faculty_id_str}")
def get_active_session(faculty_id_str: str, db: Session = Depends(get_db)):
    faculty = db.query(models.Faculty).filter(models.Faculty.faculty_id == faculty_id_str).first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty not found")

    session = db.query(models.ClassSession).filter(
        models.ClassSession.faculty_id == faculty.id,
        models.ClassSession.is_active == True
    ).first()

    if not session:
        return {"session": None}

    subject = db.query(models.Subject).filter(models.Subject.id == session.subject_id).first()
    return {
        "session": {
            "id": session.id,
            "subject_code": subject.code,
            "subject_name": subject.name,
            "start_time": session.start_time
        }
    }


@router.get("/session/{session_id}/students")
def get_session_students(session_id: int, db: Session = Depends(get_db)):
    records = db.query(models.AttendanceRecord, models.Student).join(
        models.Student, models.AttendanceRecord.student_id == models.Student.id
    ).filter(
        models.AttendanceRecord.session_id == session_id
    ).all()

    results = []
    for r, s in records:
        results.append({
            "usn": s.usn,
            "name": s.name,
            "status": r.status.value,
            "confidence": r.confidence_score,
            "method": r.method.value
        })
    return {"students": results}


@router.post("/session")
def student_scan_attendance(body: dict, db: Session = Depends(get_db)):
    """
    Student triggered 3-photo scan.
    Requires an ACTIVE session for the subject_code.
    """
    usn = body.get("usn")
    subject_code = body.get("subject_code")
    photos: list = body.get("photos", [])

    if not usn or not subject_code or len(photos) != 3:
        raise HTTPException(status_code=400, detail="usn, subject_code, and 3 photos required")

    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    subject = db.query(models.Subject).filter(models.Subject.code == subject_code).first()

    if not student or not subject:
        raise HTTPException(status_code=404, detail="Student or Subject not found")

    session = db.query(models.ClassSession).filter(
        models.ClassSession.subject_id == subject.id,
        models.ClassSession.is_active == True
    ).first()

    if not session:
        raise HTTPException(status_code=400, detail="No active class session for this subject")

    if not is_trained(usn):
        raise HTTPException(status_code=422, detail="Face model not trained.")

    checkpoint_results = []
    for i, photo_b64 in enumerate(photos):
        try:
            img_bytes = base64.b64decode(photo_b64)
            result = verify_face(usn, img_bytes)
            checkpoint_results.append({
                "checkpoint": i + 1,
                "label": ["START", "MID", "END"][i],
                "matched": result["matched"],
                "confidence": result["confidence"],
                "error": result.get("error"),
            })
        except Exception as e:
            checkpoint_results.append({"matched": False, "confidence": 0.0, "error": str(e)})

    matched_count = sum(1 for r in checkpoint_results if r.get("matched"))
    is_present = matched_count >= 2
    avg_confidence = round(sum(r.get("confidence", 0) for r in checkpoint_results if r.get("matched")) / max(matched_count, 1), 1)

    # Upsert attendance record for this session
    record = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == student.id,
        models.AttendanceRecord.session_id == session.id
    ).first()

    if record:
        record.status = models.AttendanceStatus.present if is_present else models.AttendanceStatus.absent
        record.confidence_score = avg_confidence
        record.method = models.AttendanceMethod.face
    else:
        record = models.AttendanceRecord(
            student_id=student.id,
            session_id=session.id,
            status=models.AttendanceStatus.present if is_present else models.AttendanceStatus.absent,
            confidence_score=avg_confidence,
            method=models.AttendanceMethod.face
        )
        db.add(record)

    db.commit()

    return {
        "verdict": "present" if is_present else "absent",
        "matched_count": matched_count,
        "avg_confidence": avg_confidence,
        "checkpoint_results": checkpoint_results,
    }


@router.post("/class-session")
def faculty_scan_attendance(body: dict, db: Session = Depends(get_db)):
    """
    Faculty scanning room — batch photo processing with grid output.
    Uses threshold-based presence: student is present if detected in
    >= PRESENCE_THRESHOLD fraction of total frames.
    """
    session_id = body.get("session_id")
    photos: list = body.get("photos", [])

    if not session_id or not photos:
        raise HTTPException(status_code=400, detail="session_id and photos required")

    session = db.query(models.ClassSession).filter(models.ClassSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Decode all base64 photos to bytes
    photos_bytes = []
    for photo_b64 in photos:
        try:
            photos_bytes.append(base64.b64decode(photo_b64))
        except Exception:
            pass  # skip bad photos

    if not photos_bytes:
        raise HTTPException(status_code=400, detail="No valid photos provided")

    # Run the grid-based identification engine
    result = identify_faces_with_grid(photos_bytes, session_id)

    # Update attendance records based on threshold results
    marked = []
    for usn, student_data in result["students"].items():
        student = db.query(models.Student).filter(models.Student.usn == usn).first()
        if not student:
            continue

        record = db.query(models.AttendanceRecord).filter(
            models.AttendanceRecord.student_id == student.id,
            models.AttendanceRecord.session_id == session.id
        ).first()

        new_status = models.AttendanceStatus.present if student_data["is_present"] else models.AttendanceStatus.absent

        if record:
            record.status = new_status
            record.confidence_score = student_data["avg_confidence"]
            record.method = models.AttendanceMethod.face
        else:
            record = models.AttendanceRecord(
                student_id=student.id,
                session_id=session.id,
                status=new_status,
                confidence_score=student_data["avg_confidence"],
                method=models.AttendanceMethod.face
            )
            db.add(record)

        # Build grid image URL path (relative for frontend)
        grid_url = None
        if student_data.get("grid_image_path"):
            grid_filename = os.path.basename(student_data["grid_image_path"])
            grid_url = f"/api/attendance/grids/{grid_filename}"

        marked.append({
            "usn": usn,
            "name": student.name,
            "confidence": student_data["avg_confidence"],
            "detected_count": student_data["detected_count"],
            "total_frames": student_data["total_frames"],
            "presence_ratio": student_data["presence_ratio"],
            "is_present": student_data["is_present"],
            "grid_image_url": grid_url,
        })

    db.commit()

    # Build annotated image URL
    annotated_url = None
    if result.get("annotated_image_path"):
        annotated_filename = os.path.basename(result["annotated_image_path"])
        annotated_url = f"/api/attendance/grids/{annotated_filename}"

    return {
        "photos_processed": len(photos_bytes),
        "students_identified": len(marked),
        "marked_present": marked,
        "per_photo_results": result["per_photo_results"],
        "annotated_image_url": annotated_url,
    }


@router.post("/mark")
def manual_mark_attendance(body: dict, db: Session = Depends(get_db)):
    # Expects student_usn, session_id, status
    usn = body.get("student_usn")
    session_id = body.get("session_id")
    status = body.get("status")

    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    record = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.student_id == student.id,
        models.AttendanceRecord.session_id == session_id
    ).first()

    if record:
        record.status = status
        record.method = models.AttendanceMethod.manual
    else:
        record = models.AttendanceRecord(
            student_id=student.id,
            session_id=session_id,
            status=status,
            method=models.AttendanceMethod.manual
        )
        db.add(record)
    
    db.commit()
    return {"message": "Attendance updated"}


@router.get("/{usn}")
def get_attendance_summary(usn: str, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    records = (
        db.query(models.AttendanceRecord, models.ClassSession, models.Subject)
        .join(models.ClassSession, models.AttendanceRecord.session_id == models.ClassSession.id)
        .join(models.Subject, models.ClassSession.subject_id == models.Subject.id)
        .filter(models.AttendanceRecord.student_id == student.id)
        .all()
    )

    total_held = len(records)
    total_present = sum(1 for r, _, _ in records if r.status == models.AttendanceStatus.present)
    percentage = round((total_present / total_held) * 100, 1) if total_held > 0 else 0.0

    by_subject: dict = {}
    for record, session, subject in records:
        key = subject.code
        if key not in by_subject:
            by_subject[key] = {"subject": subject.name, "code": subject.code, "held": 0, "present": 0}
        by_subject[key]["held"] += 1
        if record.status == models.AttendanceStatus.present:
            by_subject[key]["present"] += 1

    for s in by_subject.values():
        s["percentage"] = round((s["present"] / s["held"]) * 100, 1) if s["held"] > 0 else 0.0

    return {
        "total_held": total_held,
        "total_present": total_present,
        "percentage": percentage,
        "by_subject": list(by_subject.values()),
    }


@router.get("/{usn}/logs")
def get_recent_logs(usn: str, limit: int = 10, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    records = (
        db.query(models.AttendanceRecord, models.ClassSession, models.Subject)
        .join(models.ClassSession, models.AttendanceRecord.session_id == models.ClassSession.id)
        .join(models.Subject, models.ClassSession.subject_id == models.Subject.id)
        .filter(models.AttendanceRecord.student_id == student.id)
        .order_by(models.ClassSession.start_time.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": r.id,
            "subject": subj.name,
            "date": str(sess.start_time.date()),
            "status": r.status.value,
            "confidence_score": r.confidence_score,
            "method": r.method.value,
        }
        for r, sess, subj in records
    ]


@router.get("/grids/{filename}")
def serve_grid_image(filename: str):
    """Serve generated grid and annotated images."""
    filepath = os.path.join(GRIDS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(filepath, media_type="image/jpeg")
