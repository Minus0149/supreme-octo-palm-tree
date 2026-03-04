import * as faceapi from 'face-api.js';

let isModelLoaded = false;
let isModelLoading = false;

// Initialize the TinyFaceDetector model
export async function initializeFaceDetection() {
    if (isModelLoaded) return true;
    if (isModelLoading) return false;

    isModelLoading = true;
    try {
        // We only need the TinyFaceDetector for bounding boxes
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        isModelLoaded = true;
        return true;
    } catch (err) {
        console.error("Failed to load face detection model:", err);
        return false;
    } finally {
        isModelLoading = false;
    }
}

export interface FaceDetectionResult {
    detected: boolean;
    bounds: { x: number; y: number; width: number; height: number } | null;
    status: 'ok' | 'no_face' | 'too_far' | 'too_close' | 'not_centered' | 'multiple_faces';
    message: string;
}

export async function detectFace(videoElement: HTMLVideoElement): Promise<FaceDetectionResult> {
    if (!isModelLoaded) {
        return { detected: false, bounds: null, status: 'no_face', message: 'Loading face detector...' };
    }

    // Detect using TinyFaceDetector for performance (160x160 input size)
    const detections = await faceapi.detectAllFaces(
        videoElement,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 })
    );

    if (detections.length === 0) {
        return { detected: false, bounds: null, status: 'no_face', message: 'No face detected. Look at the camera.' };
    }

    if (detections.length > 1) {
        return { detected: false, bounds: null, status: 'multiple_faces', message: 'Multiple faces detected. Please be alone.' };
    }

    const face = detections[0].box;
    const videoWidth = videoElement.videoWidth || videoElement.width;
    const videoHeight = videoElement.videoHeight || videoElement.height;

    // Calculate face area relative to video area
    const faceArea = face.width * face.height;
    const videoArea = videoWidth * videoHeight;
    const areaRatio = faceArea / videoArea;

    // Calculate center offset
    const faceCenterX = face.x + (face.width / 2);
    const faceCenterY = face.y + (face.height / 2);
    const videoCenterX = videoWidth / 2;
    const videoCenterY = videoHeight / 2;

    // Normalize distance from center (0 to 1)
    const distFromCenter = Math.sqrt(
        Math.pow((faceCenterX - videoCenterX) / videoWidth, 2) +
        Math.pow((faceCenterY - videoCenterY) / videoHeight, 2)
    );

    let status: FaceDetectionResult['status'] = 'ok';
    let message = 'Perfect — hold still';

    // Strict constraints for a good enrollment frame
    if (areaRatio < 0.05) {
        status = 'too_far';
        message = 'Move closer to the camera';
    } else if (areaRatio > 0.35) {
        status = 'too_close';
        message = 'Move slightly further away';
    } else if (distFromCenter > 0.15) {
        status = 'not_centered';
        message = 'Center your face in the oval';
    }

    return {
        detected: true,
        bounds: face,
        status,
        message
    };
}
