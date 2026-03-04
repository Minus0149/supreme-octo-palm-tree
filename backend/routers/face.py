import os
import base64
import aiofiles
import threading
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
from database import get_db, SessionLocal
import models, schemas
from face_engine import train_student, verify_face, is_trained

router = APIRouter(prefix="/api/face", tags=["face"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "faces")


@router.post("/upload-frames")
async def upload_frames(
    usn: str = Form(...),
    frames: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Delete any existing pending samples before re-uploading
    db.query(models.FaceSample).filter(
        models.FaceSample.student_id == student.id,
        models.FaceSample.status == models.FaceSampleStatus.pending,
    ).delete()
    db.commit()

    student_dir = os.path.join(UPLOAD_DIR, usn)
    os.makedirs(student_dir, exist_ok=True)

    saved = []
    for i, frame in enumerate(frames):
        filename = f"frame_{i + 1:03d}.jpg"
        filepath = os.path.join(student_dir, filename)
        async with aiofiles.open(filepath, "wb") as f:
            content = await frame.read()
            await f.write(content)

        sample = models.FaceSample(
            student_id=student.id,
            image_path=filepath,
            status=models.FaceSampleStatus.pending,
        )
        db.add(sample)
        saved.append(filename)

    db.commit()
    return {"message": f"Uploaded {len(saved)} frames for {usn}", "files": saved}


@router.get("/status/{usn}")
def get_face_status(usn: str, db: Session = Depends(get_db)):
    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if is_trained(usn):
        enc = db.query(models.FaceEncoding).filter(
            models.FaceEncoding.student_id == student.id
        ).first()
        return {
            "status": "trained",
            "count": enc.frames_used if enc else 0,
            "trained_at": enc.trained_at.isoformat() if enc else None,
        }

    samples = db.query(models.FaceSample).filter(models.FaceSample.student_id == student.id).all()
    if not samples:
        return {"status": "unregistered", "count": 0}

    approved = [s for s in samples if s.status == models.FaceSampleStatus.approved]
    pending = [s for s in samples if s.status == models.FaceSampleStatus.pending]

    if approved:
        return {"status": "approved", "count": len(approved)}
    if pending:
        return {"status": "pending", "count": len(pending)}
    return {"status": "rejected", "count": 0}


@router.post("/train/{usn}")
def train_face(usn: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Trigger face embedding training for a student. Called after faculty approval."""
    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    result = train_student(usn)
    if not result["success"]:
        raise HTTPException(status_code=422, detail=result.get("error", "Training failed"))

    # Upsert the FaceEncoding record
    enc = db.query(models.FaceEncoding).filter(
        models.FaceEncoding.student_id == student.id
    ).first()
    if enc:
        enc.frames_used = result["faces_found"]
        enc.trained_at = datetime.utcnow()
    else:
        enc = models.FaceEncoding(
            student_id=student.id,
            encoding_path=result["encoding_path"],
            frames_used=result["faces_found"],
        )
        db.add(enc)
    db.commit()

    return {
        "message": f"Training complete for {usn}",
        "frames_processed": result["frames_processed"],
        "faces_found": result["faces_found"],
    }


@router.patch("/review/{student_id}")
def review_face_samples(
    student_id: int,
    body: schemas.FaceReviewRequest,
    db: Session = Depends(get_db),
):
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")

    new_status = (
        models.FaceSampleStatus.approved if body.action == "approve"
        else models.FaceSampleStatus.rejected
    )
    updated = db.query(models.FaceSample).filter(
        models.FaceSample.student_id == student_id,
        models.FaceSample.status == models.FaceSampleStatus.pending,
    ).all()

    if not updated:
        raise HTTPException(status_code=404, detail="No pending samples found for this student")

    for sample in updated:
        sample.status = new_status
    db.commit()

    # Auto-trigger training on approval IN A BACKGROUND THREAD
    # This prevents the HTTP response from hanging while the model downloads/processes
    if body.action == "approve":
        student = db.query(models.Student).filter(models.Student.id == student_id).first()
        usn = student.usn if student else None
        sid = student_id

        def _train_in_background(usn: str, sid: int):
            """Run training in a separate thread with its own DB session."""
            import logging
            logger = logging.getLogger(__name__)
            try:
                training_result = train_student(usn)
                if training_result["success"]:
                    bg_db = SessionLocal()
                    try:
                        enc = bg_db.query(models.FaceEncoding).filter(
                            models.FaceEncoding.student_id == sid
                        ).first()
                        if enc:
                            enc.frames_used = training_result["faces_found"]
                            enc.trained_at = datetime.utcnow()
                        else:
                            enc = models.FaceEncoding(
                                student_id=sid,
                                encoding_path=training_result["encoding_path"],
                                frames_used=training_result["faces_found"],
                            )
                            bg_db.add(enc)
                        bg_db.commit()
                        logger.info(f"Background training complete for {usn}")
                    finally:
                        bg_db.close()
                else:
                    logger.warning(f"Training failed for {usn}: {training_result.get('error')}")
            except Exception as e:
                logger.error(f"Background training error for {usn}: {e}")

        if usn:
            thread = threading.Thread(target=_train_in_background, args=(usn, sid))
            thread.start()

    return {"message": f"{len(updated)} samples marked as {new_status.value}"}


@router.get("/frames/{usn}")
def list_student_frames(usn: str, db: Session = Depends(get_db)):
    """List all uploaded frame filenames for a student (for faculty preview)."""
    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    student_dir = os.path.join(UPLOAD_DIR, usn)
    if not os.path.isdir(student_dir):
        return {"usn": usn, "frames": []}

    frames = sorted([
        f for f in os.listdir(student_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ])
    return {"usn": usn, "frames": frames, "count": len(frames)}


@router.get("/frames/{usn}/{filename}")
def get_frame_image(usn: str, filename: str):
    """Serve a single frame image for preview."""
    filepath = os.path.join(UPLOAD_DIR, usn, filename)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Frame not found")
    return FileResponse(filepath, media_type="image/jpeg")


@router.post("/verify")
async def verify_single_frame(body: dict, db: Session = Depends(get_db)):
    """Verify a single base64 image against a student's trained encoding."""
    usn = body.get("usn")
    image_b64 = body.get("image_b64")

    if not usn or not image_b64:
        raise HTTPException(status_code=400, detail="usn and image_b64 are required")

    student = db.query(models.Student).filter(models.Student.usn == usn).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        image_bytes = base64.b64decode(image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")

    result = verify_face(usn, image_bytes)
    return result
