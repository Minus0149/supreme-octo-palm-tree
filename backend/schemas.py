from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional
from models import FaceSampleStatus, AttendanceStatus, AttendanceMethod


# ——— Auth ———
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str


class LoginRequest(BaseModel):
    id: str        # USN for students, faculty_id for faculty
    password: str


# ——— Student ———
class StudentCreate(BaseModel):
    usn: str
    name: str
    dept: str
    semester: int
    password: str


class StudentOut(BaseModel):
    id: int
    usn: str
    name: str
    dept: str
    semester: int
    registered_at: datetime

    class Config:
        from_attributes = True


# ——— Face Samples ———
class FaceSampleOut(BaseModel):
    id: int
    student_id: int
    image_path: str
    status: FaceSampleStatus
    uploaded_at: datetime

    class Config:
        from_attributes = True


class FaceReviewRequest(BaseModel):
    action: str  # "approve" or "reject"


class PendingRegistration(BaseModel):
    student_id: int
    usn: str
    name: str
    dept: str
    sample_count: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


# ——— Class Sessions ———
class ClassSessionOut(BaseModel):
    id: int
    subject_id: int
    faculty_id: int
    start_time: datetime
    end_time: Optional[datetime]
    is_active: bool

    class Config:
        from_attributes = True


# ——— Attendance ———
class AttendanceRecordOut(BaseModel):
    id: int
    session_id: int
    status: AttendanceStatus
    confidence_score: Optional[float]
    method: AttendanceMethod

    class Config:
        from_attributes = True


class AttendanceSummary(BaseModel):
    total_held: int
    total_present: int
    percentage: float
    by_subject: list[dict]


class ManualMarkRequest(BaseModel):
    student_usn: str
    subject_code: str
    date: date
    status: AttendanceStatus


# ——— Subject ———
class SubjectOut(BaseModel):
    id: int
    name: str
    code: str

    class Config:
        from_attributes = True


# ——— Faculty ———
class FacultyCreate(BaseModel):
    faculty_id: str
    name: str
    dept: str
    password: str


class FacultyOut(BaseModel):
    id: int
    faculty_id: str
    name: str
    dept: str

    class Config:
        from_attributes = True
