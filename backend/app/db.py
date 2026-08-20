import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = "sqlite:///./pitpulse.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class SessionModel(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    audio_clips = relationship("AudioClipModel", back_populates="session")
    lap_times = relationship("LapTimeModel", back_populates="session")
    insights = relationship("InsightModel", back_populates="session")

class AudioClipModel(Base):
    __tablename__ = "audio_clips"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    file_path = Column(String, nullable=False)
    duration_seconds = Column(Float, nullable=False)
    lap_number = Column(Integer, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("SessionModel", back_populates="audio_clips")
    transcript = relationship("TranscriptModel", uselist=False, back_populates="audio_clip")
    emotion_analyses = relationship("EmotionAnalysisModel", back_populates="audio_clip")

class TranscriptModel(Base):
    __tablename__ = "transcripts"
    id = Column(Integer, primary_key=True, index=True)
    audio_clip_id = Column(Integer, ForeignKey("audio_clips.id"), nullable=False)
    text = Column(String, nullable=False)
    confidence = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    audio_clip = relationship("AudioClipModel", back_populates="transcript")
    emotion_analyses = relationship("EmotionAnalysisModel", back_populates="transcript")

class EmotionAnalysisModel(Base):
    __tablename__ = "emotion_analyses"
    id = Column(Integer, primary_key=True, index=True)
    audio_clip_id = Column(Integer, ForeignKey("audio_clips.id"), nullable=True)
    transcript_id = Column(Integer, ForeignKey("transcripts.id"), nullable=True)
    audio_emotion = Column(String, nullable=False)
    audio_emotion_score = Column(Float, nullable=False)
    text_emotion = Column(String, nullable=False)
    text_emotion_score = Column(Float, nullable=False)
    combined_stress_score = Column(Float, nullable=False)
    final_state = Column(String, nullable=True)
    stress = Column(Float, nullable=True)
    fatigue = Column(Float, nullable=True)
    urgency = Column(Float, nullable=True)
    confidence = Column(Float, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    audio_clip = relationship("AudioClipModel", back_populates="emotion_analyses")
    transcript = relationship("TranscriptModel", back_populates="emotion_analyses")

class LapTimeModel(Base):
    __tablename__ = "lap_times"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    lap_number = Column(Integer, nullable=False)
    lap_time_seconds = Column(Float, nullable=False)
    sector_1_seconds = Column(Float, nullable=False)
    sector_2_seconds = Column(Float, nullable=False)
    sector_3_seconds = Column(Float, nullable=False)
    is_valid = Column(Boolean, default=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("SessionModel", back_populates="lap_times")

class InsightModel(Base):
    __tablename__ = "insights"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    category = Column(String, nullable=False)
    content = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("SessionModel", back_populates="insights")
