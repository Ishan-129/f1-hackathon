from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

class SessionCreate(BaseModel):
    name: str

class SessionResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

class AudioClipResponse(BaseModel):
    audio_clip_id: int
    session_id: int
    file_path: str
    duration_seconds: float
    lap_number: Optional[int] = None
    timestamp: datetime

class AudioAnalysisRequest(BaseModel):
    audio_clip_id: int

class TranscriptDetail(BaseModel):
    id: int
    audio_clip_id: int
    text: str
    confidence: Optional[float] = None
    timestamp: datetime

class EmotionAnalysisDetail(BaseModel):
    id: int
    audio_clip_id: Optional[int]
    transcript_id: Optional[int]
    audio_emotion: str
    audio_emotion_score: float
    text_emotion: str
    text_emotion_score: float
    combined_stress_score: float
    final_state: Optional[str] = None
    stress: Optional[float] = None
    fatigue: Optional[float] = None
    urgency: Optional[float] = None
    confidence: Optional[float] = None
    timestamp: datetime

class AudioAnalysisResponse(BaseModel):
    transcript: TranscriptDetail
    emotion_analysis: EmotionAnalysisDetail

class LapTimeCreate(BaseModel):
    session_id: int
    lap_number: int
    lap_time_seconds: float
    sector_1_seconds: float
    sector_2_seconds: float
    sector_3_seconds: float
    is_valid: bool = True

class LapTimeResponse(BaseModel):
    id: int
    session_id: int
    lap_number: int
    lap_time_seconds: float
    sector_1_seconds: float
    sector_2_seconds: float
    sector_3_seconds: float
    is_valid: bool
    timestamp: datetime

    class Config:
        from_attributes = True

class SessionDetailResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    laps_count: int

class TimelineEntry(BaseModel):
    lap: int
    lap_time: float
    driver_state: str
    stress_score: float
    performance_delta: Optional[float] = None
    text: Optional[str] = None
    audio_emotion: Optional[str] = None
    text_emotion: Optional[str] = None
    sector_1: Optional[float] = None
    sector_2: Optional[float] = None
    sector_3: Optional[float] = None

class SessionAnalysisResponse(BaseModel):
    session_id: int
    timeline: List[TimelineEntry]

class InsightDetail(BaseModel):
    id: int
    category: str
    content: str
    severity: str
    timestamp: datetime

class SessionInsightsResponse(BaseModel):
    session_id: int
    insights: List[InsightDetail]
