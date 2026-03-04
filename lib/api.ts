const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
        ...options,
    });
    if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail || "API Error");
    }
    return res.json();
}

// ——— Auth ———
export async function loginStudent(usn: string, password: string) {
    return apiFetch<{ access_token: string; role: string }>("/api/students/login", {
        method: "POST",
        body: JSON.stringify({ id: usn, password }),
    });
}

export async function loginFaculty(facultyId: string, password: string) {
    return apiFetch<{ access_token: string; role: string }>("/api/faculty/login", {
        method: "POST",
        body: JSON.stringify({ id: facultyId, password }),
    });
}

// ——— Student ———
export async function getStudent(usn: string) {
    return apiFetch<{ id: number; usn: string; name: string; dept: string; semester: number }>(`/api/students/${usn}`);
}

export async function getFaceStatus(usn: string) {
    return apiFetch<{ status: string; count: number }>(`/api/face/status/${usn}`);
}

export async function uploadFaceFrames(usn: string, frames: Blob[]) {
    const formData = new FormData();
    formData.append("usn", usn);
    frames.forEach((blob, i) => formData.append("frames", blob, `frame_${i + 1}.jpg`));

    const res = await fetch(`${API_BASE}/api/face/upload-frames`, {
        method: "POST",
        body: formData,
        // Don't set Content-Type — browser sets it with proper boundary
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Upload failed");
    }
    return res.json();
}

// ——— Attendance ———
export async function getAttendanceSummary(usn: string) {
    return apiFetch<{
        total_held: number;
        total_present: number;
        percentage: number;
        by_subject: { subject: string; code: string; held: number; present: number; percentage: number }[];
    }>(`/api/attendance/${usn}`);
}

export async function getRecentLogs(usn: string, limit = 5) {
    return apiFetch<
        { id: number; subject: string; date: string; status: string; confidence_score: number | null; method: string }[]
    >(`/api/attendance/${usn}/logs?limit=${limit}`);
}

export async function startClassSession(subject_code: string, faculty_id: string) {
    return apiFetch<{ session_id: number; message: string }>("/api/attendance/session/start", {
        method: "POST",
        body: JSON.stringify({ subject_code, faculty_id }),
    });
}

export async function endClassSession(session_id: number) {
    return apiFetch<{ message: string }>(`/api/attendance/session/${session_id}/end`, {
        method: "POST",
    });
}

export async function getActiveClassSession(faculty_id: string) {
    return apiFetch<{ session: { id: number; subject_code: string; subject_name: string; start_time: string } | null }>(
        `/api/attendance/session/active/${faculty_id}`
    );
}

export async function getSessionStudents(session_id: number) {
    return apiFetch<{ students: { usn: string; name: string; status: string; confidence: number | null; method: string }[] }>(
        `/api/attendance/session/${session_id}/students`
    );
}

export async function attendanceSession(
    usn: string, subject_code: string, photos: string[]
) {
    return apiFetch<{
        verdict: "present" | "absent";
        matched_count: number;
        avg_confidence: number;
        checkpoint_results: { checkpoint: number; label: string; matched: boolean; confidence: number; error?: string | null }[];
    }>("/api/attendance/session", {
        method: "POST",
        body: JSON.stringify({ usn, subject_code, photos }),
    });
}

export async function classAttendanceSession(
    session_id: number, photos: string[]
) {
    return apiFetch<{
        photos_processed: number;
        students_identified: number;
        marked_present: { usn: string; name: string; confidence: number }[];
        per_photo_results: { photo: number; faces_detected: number; students?: string[]; error?: string }[];
    }>("/api/attendance/class-session", {
        method: "POST",
        body: JSON.stringify({ session_id, photos }),
    });
}

// ——— Faculty ———
export async function getPendingRegistrations() {
    return apiFetch<
        { student_id: number; usn: string; name: string; dept: string; sample_count: number; uploaded_at: string }[]
    >("/api/faculty/pending-registrations");
}

export async function reviewFaceSamples(studentId: number, action: "approve" | "reject") {
    return apiFetch(`/api/face/review/${studentId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
    });
}

export async function getStudentFrames(usn: string) {
    return apiFetch<{ usn: string; frames: string[]; count: number }>(`/api/face/frames/${usn}`);
}

export function getFrameUrl(usn: string, filename: string) {
    return `${API_BASE}/api/face/frames/${usn}/${filename}`;
}

export async function getDefaulters(threshold = 75) {
    return apiFetch<
        { student_id: number; usn: string; name: string; dept: string; attendance_percentage: number; shortage: number }[]
    >(`/api/faculty/defaulters?threshold=${threshold}`);
}

// ——— Admin ———
export async function adminListStudents() {
    return apiFetch<{
        id: number; usn: string; name: string; dept: string; semester: number;
        registered_at: string; face_status: string;
    }[]>("/api/admin/students");
}

export async function adminCreateStudent(data: { usn: string; name: string; dept: string; semester: number; password: string }) {
    return apiFetch("/api/admin/students", { method: "POST", body: JSON.stringify(data) });
}

export async function adminDeleteStudent(usn: string) {
    const res = await fetch(`${API_BASE}/api/admin/students/${usn}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");
}
