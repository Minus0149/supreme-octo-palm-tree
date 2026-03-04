from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from database import Base


class FaceSampleStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class AttendanceMethod(str, enum.Enum):
    face = "face"
    manual = "manual"


class AttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    usn = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    dept = Column(String, nullable=False)
    semester = Column(Integer, nullable=False, default=1)
    password_hash = Column(String, nullable=False)
    registered_at = Column(DateTime, default=datetime.utcnow)

    face_samples = relationship("FaceSample", back_populates="student", cascade="all, delete")
    attendance_records = relationship("AttendanceRecord", back_populates="student", cascade="all, delete")
    face_encoding = relationship("FaceEncoding", back_populates="student", uselist=False, cascade="all, delete")


class FaceSample(Base):
    __tablename__ = "face_samples"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    image_path = Column(String, nullable=False)
    status = Column(SAEnum(FaceSampleStatus), default=FaceSampleStatus.pending, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("Student", back_populates="face_samples")


class Faculty(Base):
    __tablename__ = "faculty"

    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    dept = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)

    subjects = relationship("Subject", back_populates="faculty")


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=True)

    faculty = relationship("Faculty", back_populates="subjects")
    class_sessions = relationship("ClassSession", back_populates="subject")


class ClassSession(Base):
    __tablename__ = "class_sessions"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=False)
    start_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    end_time = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    subject = relationship("Subject", back_populates="class_sessions")
    faculty = relationship("Faculty")
    attendance_records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("class_sessions.id"), nullable=False)
    date = Column(Date, nullable=False)
    status = Column(SAEnum(AttendanceStatus), default=AttendanceStatus.present, nullable=False)
    confidence_score = Column(Float, nullable=True)
    method = Column(SAEnum(AttendanceMethod), default=AttendanceMethod.face, nullable=False)

    student = relationship("Student", back_populates="attendance_records")
    session = relationship("ClassSession", back_populates="attendance_records")


class FaceEncoding(Base):
    __tablename__ = "face_encodings"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), unique=True, nullable=False)
    encoding_path = Column(String, nullable=False)
    frames_used = Column(Integer, default=0)
    trained_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("Student", back_populates="face_encoding")

