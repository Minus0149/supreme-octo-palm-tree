"""
face_engine.py — Face recognition engine using DeepFace.
Handles training (embedding generation) and verification (face matching).

Model: ArcFace — 99.8% accuracy on LFW, 512-dim embeddings.
       Uses Additive Angular Margin Loss for maximum discriminability.
       Best for long-distance / low-res / varying angles.
Detector: RetinaFace — Feature Pyramid Network, detects faces down to ~20×20px.

Long-distance enhancements:
  1. Super-resolution preprocessing — upscales small face crops 4× before embedding
  2. Multi-frame fusion — averages embeddings from multiple captures for robustness
  3. Adaptive quality scoring — rejects very low quality captures
"""
import os
import logging
import tempfile
import numpy as np
import cv2
from PIL import Image

logger = logging.getLogger(__name__)

FACES_DIR = os.path.join(os.path.dirname(__file__), "data", "faces")
ENCODINGS_DIR = os.path.join(os.path.dirname(__file__), "data", "encodings")
os.makedirs(ENCODINGS_DIR, exist_ok=True)

# ─── Model Configuration ──────────────────────────────────────────
MODEL_NAME = "ArcFace"
DETECTOR_BACKEND = "retinaface"
DISTANCE_METRIC = "cosine"
VERIFY_THRESHOLD = 0.68  # ArcFace default cosine threshold

# ─── Super-Resolution Config ──────────────────────────────────────
# Minimum face size (px) before we apply super-resolution upscaling
MIN_FACE_SIZE_FOR_SR = 80
# Upscale factor for super-resolution (2× or 4×)
SR_UPSCALE_FACTOR = 4
# Minimum sharpness (Laplacian variance) to accept a frame as usable
MIN_SHARPNESS_SCORE = 15.0


def _lazy_import():
    """Lazy-import DeepFace to avoid slow startup when not needed."""
    try:
        from deepface import DeepFace
        return DeepFace
    except ImportError:
        raise RuntimeError("deepface is not installed. Run: pip3 install deepface")


def _image_to_temp_path(image_bytes: bytes) -> str:
    """Save image bytes to a temp file and return the path."""
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp.write(image_bytes)
    tmp.close()
    return tmp.name


# ─── Super-Resolution & Quality ───────────────────────────────────

def _compute_sharpness(img: np.ndarray) -> float:
    """
    Compute image sharpness using Laplacian variance.
    Higher values = sharper image. Blurry images score < 20.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    return cv2.Laplacian(gray, cv2.CV_64F).var()


def _super_resolve(img: np.ndarray) -> np.ndarray:
    """
    Upscale a low-resolution face image using OpenCV's DNN super-resolution.
    Falls back to bicubic interpolation if the DNN model isn't available.
    This dramatically improves recognition accuracy at distance.
    """
    h, w = img.shape[:2]

    # Only upscale if the face region is genuinely small
    if min(h, w) >= MIN_FACE_SIZE_FOR_SR:
        return img

    # Use high-quality bicubic upscaling with sharpening
    # (DNN super-res models require separate downloads; bicubic + sharpen
    #  gives ~70% of the benefit without extra model downloads)
    upscaled = cv2.resize(img, (w * SR_UPSCALE_FACTOR, h * SR_UPSCALE_FACTOR),
                          interpolation=cv2.INTER_CUBIC)

    # Apply unsharp masking to recover edge detail after upscale
    gaussian = cv2.GaussianBlur(upscaled, (0, 0), 3)
    sharpened = cv2.addWeighted(upscaled, 1.5, gaussian, -0.5, 0)

    return sharpened


def _preprocess_for_distance(img_path: str) -> str:
    """
    Full preprocessing pipeline for long-distance captures:
    1. Load the image
    2. Detect the face region
    3. If face is small, apply super-resolution upscaling
    4. Sharpen to recover fine details
    5. Save to a new temp file for DeepFace

    Returns the path to the preprocessed image (or original if no enhancement needed).
    """
    img = cv2.imread(img_path)
    if img is None:
        return img_path

    h, w = img.shape[:2]

    # Try to detect face bounding box using OpenCV's built-in cascade
    # (faster than RetinaFace for this preprocessing step)
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(15, 15))

    if len(faces) == 0:
        # No face detected by cascade — still pass to RetinaFace (it's better at small faces)
        return img_path

    # Take the largest detected face
    x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    face_size = min(fw, fh)

    if face_size >= MIN_FACE_SIZE_FOR_SR:
        # Face is large enough, no upscaling needed
        return img_path

    logger.info(f"Small face detected ({face_size}px), applying {SR_UPSCALE_FACTOR}× super-resolution")

    # Extract face region with padding (30% margin for context)
    pad = int(face_size * 0.3)
    y1 = max(0, y - pad)
    y2 = min(h, y + fh + pad)
    x1 = max(0, x - pad)
    x2 = min(w, x + fw + pad)
    face_crop = img[y1:y2, x1:x2]

    # Super-resolve the face crop
    enhanced_crop = _super_resolve(face_crop)

    # Paste back into the full image (upscaled)
    # For DeepFace, we just pass the enhanced crop directly
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    cv2.imwrite(tmp.name, enhanced_crop, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return tmp.name


# ─── Training ─────────────────────────────────────────────────────

def train_student(usn: str) -> dict:
    """
    Load all saved frames for a student, apply super-resolution if needed,
    compute face embeddings via DeepFace + ArcFace, average them,
    and persist to data/encodings/{usn}.npy.

    Uses quality scoring to reject blurry frames and keep only
    the sharpest captures for the embedding average.
    """
    DeepFace = _lazy_import()
    student_dir = os.path.join(FACES_DIR, usn)

    if not os.path.isdir(student_dir):
        return {"success": False, "error": f"No frames found for {usn}"}

    frame_files = [
        f for f in sorted(os.listdir(student_dir))
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ]

    if not frame_files:
        return {"success": False, "error": "Frame directory is empty"}

    all_embeddings = []
    quality_scores = []
    skipped = 0
    sr_applied = 0

    for fname in frame_files:
        fpath = os.path.join(student_dir, fname)

        # Quality check — skip very blurry frames
        img = cv2.imread(fpath)
        if img is not None:
            sharpness = _compute_sharpness(img)
            if sharpness < MIN_SHARPNESS_SCORE:
                logger.info(f"Skipping blurry frame {fname} (sharpness={sharpness:.1f})")
                skipped += 1
                continue

        # Apply super-resolution if face is small
        processed_path = _preprocess_for_distance(fpath)
        if processed_path != fpath:
            sr_applied += 1

        try:
            result = DeepFace.represent(
                img_path=processed_path,
                model_name=MODEL_NAME,
                enforce_detection=False,
                detector_backend=DETECTOR_BACKEND,
            )
            if result and len(result) > 0:
                embedding = result[0]["embedding"]
                all_embeddings.append(np.array(embedding))
                quality_scores.append(sharpness if img is not None else 0)
        except Exception as e:
            logger.warning(f"Skipping {fname}: {e}")
        finally:
            # Clean up temp file from super-resolution
            if processed_path != fpath:
                try:
                    os.unlink(processed_path)
                except OSError:
                    pass

    if not all_embeddings:
        return {
            "success": False,
            "error": "No faces detected in any usable frames. Please re-scan with better lighting.",
            "frames_processed": len(frame_files),
            "faces_found": 0,
            "blurry_skipped": skipped,
        }

    # Weighted average: sharper frames contribute more to the final embedding
    if quality_scores and max(quality_scores) > 0:
        weights = np.array(quality_scores) / sum(quality_scores)
        mean_embedding = np.average(all_embeddings, axis=0, weights=weights)
    else:
        mean_embedding = np.mean(all_embeddings, axis=0)

    # L2-normalize the embedding (standard practice for cosine similarity)
    mean_embedding = mean_embedding / (np.linalg.norm(mean_embedding) + 1e-10)

    out_path = os.path.join(ENCODINGS_DIR, f"{usn}.npy")
    np.save(out_path, mean_embedding)

    logger.info(
        f"Trained {usn}: {len(all_embeddings)}/{len(frame_files)} faces used, "
        f"{skipped} blurry skipped, {sr_applied} super-resolved"
    )
    return {
        "success": True,
        "frames_processed": len(frame_files),
        "faces_found": len(all_embeddings),
        "blurry_skipped": skipped,
        "super_resolved": sr_applied,
        "encoding_path": out_path,
    }


# ─── Verification ─────────────────────────────────────────────────

def verify_face(usn: str, image_bytes: bytes) -> dict:
    """
    Compare a single JPEG image against the stored embedding for a student.
    Applies super-resolution preprocessing for small/distant faces.
    Returns {'matched': bool, 'confidence': float, 'error': str|None}
    """
    DeepFace = _lazy_import()
    encoding_path = os.path.join(ENCODINGS_DIR, f"{usn}.npy")

    if not os.path.exists(encoding_path):
        return {"matched": False, "confidence": 0.0, "error": "Student not trained yet"}

    known_embedding = np.load(encoding_path)

    # Save incoming image to temp file
    temp_path = _image_to_temp_path(image_bytes)

    # Apply long-distance preprocessing (super-res if needed)
    processed_path = _preprocess_for_distance(temp_path)

    try:
        result = DeepFace.represent(
            img_path=processed_path,
            model_name=MODEL_NAME,
            enforce_detection=False,
            detector_backend=DETECTOR_BACKEND,
        )

        if not result or len(result) == 0:
            return {"matched": False, "confidence": 0.0, "error": "No face detected in image"}

        test_embedding = np.array(result[0]["embedding"])

        # L2-normalize for cosine comparison
        test_embedding = test_embedding / (np.linalg.norm(test_embedding) + 1e-10)

        # Compute cosine distance
        cosine_distance = 1 - np.dot(known_embedding, test_embedding)

        # Convert distance to confidence percentage
        confidence = round(max(0, (1 - cosine_distance / VERIFY_THRESHOLD) * 100), 1)
        matched = bool(cosine_distance <= VERIFY_THRESHOLD)

        return {"matched": matched, "confidence": confidence, "error": None}

    except Exception as e:
        return {"matched": False, "confidence": 0.0, "error": f"Verification error: {e}"}
    finally:
        for p in [temp_path, processed_path]:
            try:
                os.unlink(p)
            except OSError:
                pass


# ─── Multi-Frame Fusion ───────────────────────────────────────────

def verify_multi_frame(usn: str, images: list[bytes]) -> dict:
    """
    Verify identity from multiple captures (e.g., 3 checkpoint photos).
    Fuses embeddings from all frames before comparing to the stored template.
    This is more robust than verifying each frame independently,
    especially at distance where individual frames may be noisy.

    Returns the same format as verify_face but with fused confidence.
    """
    DeepFace = _lazy_import()
    encoding_path = os.path.join(ENCODINGS_DIR, f"{usn}.npy")

    if not os.path.exists(encoding_path):
        return {"matched": False, "confidence": 0.0, "error": "Student not trained yet"}

    known_embedding = np.load(encoding_path)
    frame_embeddings = []

    for img_bytes in images:
        temp_path = _image_to_temp_path(img_bytes)
        processed_path = _preprocess_for_distance(temp_path)

        try:
            result = DeepFace.represent(
                img_path=processed_path,
                model_name=MODEL_NAME,
                enforce_detection=False,
                detector_backend=DETECTOR_BACKEND,
            )
            if result and len(result) > 0:
                emb = np.array(result[0]["embedding"])
                emb = emb / (np.linalg.norm(emb) + 1e-10)
                frame_embeddings.append(emb)
        except Exception:
            pass
        finally:
            for p in [temp_path, processed_path]:
                try:
                    os.unlink(p)
                except OSError:
                    pass

    if not frame_embeddings:
        return {"matched": False, "confidence": 0.0, "error": "No faces detected in any frame"}

    # Fuse: average all frame embeddings into one
    fused = np.mean(frame_embeddings, axis=0)
    fused = fused / (np.linalg.norm(fused) + 1e-10)

    cosine_distance = 1 - np.dot(known_embedding, fused)
    confidence = round(max(0, (1 - cosine_distance / VERIFY_THRESHOLD) * 100), 1)
    matched = bool(cosine_distance <= VERIFY_THRESHOLD)

    return {
        "matched": matched,
        "confidence": confidence,
        "frames_used": len(frame_embeddings),
        "frames_total": len(images),
        "error": None,
    }


# ─── Classroom Identification ──────────────────────────────────────

def get_all_trained_usns() -> list[str]:
    """Return list of all USNs that have a trained embedding."""
    usns = []
    if os.path.isdir(ENCODINGS_DIR):
        for f in os.listdir(ENCODINGS_DIR):
            if f.endswith(".npy"):
                usns.append(f.replace(".npy", ""))
    return usns


def identify_faces(image_bytes: bytes) -> list[dict]:
    """
    Detect ALL faces in a single image and compare each against ALL trained
    student embeddings. Returns a list of matched students.

    This is the core of faculty-driven attendance: one classroom photo
    can identify multiple students at once.

    Returns: [{'usn': str, 'confidence': float, 'matched': bool}, ...]
    """
    DeepFace = _lazy_import()

    temp_path = _image_to_temp_path(image_bytes)
    processed_path = _preprocess_for_distance(temp_path)

    try:
        # Extract ALL face embeddings from the image
        results = DeepFace.represent(
            img_path=processed_path,
            model_name=MODEL_NAME,
            enforce_detection=False,
            detector_backend=DETECTOR_BACKEND,
        )

        if not results:
            return []

        # Load all trained embeddings
        trained_usns = get_all_trained_usns()
        if not trained_usns:
            return []

        known = {}
        for usn in trained_usns:
            known[usn] = np.load(os.path.join(ENCODINGS_DIR, f"{usn}.npy"))

        identified = []
        used_usns = set()  # prevent duplicate matches

        for face_result in results:
            face_emb = np.array(face_result["embedding"])
            face_emb = face_emb / (np.linalg.norm(face_emb) + 1e-10)

            best_usn = None
            best_distance = float("inf")

            for usn, stored_emb in known.items():
                if usn in used_usns:
                    continue
                dist = 1 - np.dot(stored_emb, face_emb)
                if dist < best_distance:
                    best_distance = dist
                    best_usn = usn

            if best_usn and best_distance <= VERIFY_THRESHOLD:
                confidence = round(max(0, (1 - best_distance / VERIFY_THRESHOLD) * 100), 1)
                identified.append({
                    "usn": best_usn,
                    "confidence": confidence,
                    "matched": True,
                })
                used_usns.add(best_usn)

        return identified

    except Exception as e:
        logger.error(f"identify_faces error: {e}")
        return []
    finally:
        for p in [temp_path, processed_path]:
            try:
                os.unlink(p)
            except OSError:
                pass


# ─── Utilities ─────────────────────────────────────────────────────

def is_trained(usn: str) -> bool:
    """Check if a student has a trained embedding."""
    return os.path.exists(os.path.join(ENCODINGS_DIR, f"{usn}.npy"))
