from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db import get_db, SessionModel, LapTimeModel, AudioClipModel, TranscriptModel, EmotionAnalysisModel
from pathlib import Path
import csv
from app.models import SessionCreate, SessionResponse, SessionDetailResponse, SessionAnalysisResponse, TimelineEntry
from app.analytics import get_session_baseline

router = APIRouter(prefix="/api/session", tags=["Session"])

@router.post("/demo", response_model=SessionResponse, status_code=200)
def load_demo_session(db: Session = Depends(get_db)):
    """Create a deterministic, already-analysed session for stage demos."""
    existing = db.query(SessionModel).filter(SessionModel.name == "PitPulse Demo Session").first()
    if existing:
        return SessionResponse(id=existing.id, name=existing.name, created_at=existing.created_at)
    session = SessionModel(name="PitPulse Demo Session", created_at=datetime.now(timezone.utc))
    db.add(session); db.flush()
    csv_path = Path(__file__).resolve().parents[3] / "demo-assets" / "lap_times.csv"
    with csv_path.open(newline="") as handle:
        for row in csv.DictReader(handle):
            lap = int(row.get("lap", row.get("lap_number")))
            t = float(row.get("time", row.get("lap_time")))
            db.add(LapTimeModel(session_id=session.id, lap_number=lap, lap_time_seconds=t,
                sector_1_seconds=float(row.get("sector_1", t/3)), sector_2_seconds=float(row.get("sector_2", t/3)), sector_3_seconds=float(row.get("sector_3", t/3)), is_valid=True, timestamp=datetime.now(timezone.utc)))
    for lap, state, stress, text in [(10, "CALM", 12.0, "Copy, car feels good."), (18, "STRESSED", 78.0, "The tires are gone, I have no grip."), (19, "CALM", 15.0, "Understood, managing pace.")]:
        clip = AudioClipModel(session_id=session.id, file_path="/uploads/demo.wav", duration_seconds=3.0, lap_number=lap, timestamp=datetime.now(timezone.utc))
        db.add(clip); db.flush()
        tr = TranscriptModel(audio_clip_id=clip.id, text=text, confidence=0.95, timestamp=datetime.now(timezone.utc)); db.add(tr); db.flush()
        db.add(EmotionAnalysisModel(audio_clip_id=clip.id, transcript_id=tr.id, audio_emotion="angry" if stress > 50 else "neutral", audio_emotion_score=0.9, text_emotion="anger" if stress > 50 else "neutral", text_emotion_score=0.9, combined_stress_score=stress/100, final_state=state, stress=stress, fatigue=20.0, urgency=stress, confidence=92.0, timestamp=datetime.now(timezone.utc)))
    db.commit(); db.refresh(session)
    return SessionResponse(id=session.id, name=session.name, created_at=session.created_at)

@router.post("", response_model=SessionResponse, status_code=201)
def create_session(session: SessionCreate, db: Session = Depends(get_db)):
    new_sess = SessionModel(name=session.name, created_at=datetime.now(timezone.utc))
    db.add(new_sess)
    db.commit()
    db.refresh(new_sess)
    return SessionResponse(
        id=new_sess.id,
        name=new_sess.name,
        created_at=new_sess.created_at
    )

@router.get("/{id}", response_model=SessionDetailResponse)
def get_session(id: int, db: Session = Depends(get_db)):
    sess = db.query(SessionModel).filter(SessionModel.id == id).first()
    if not sess:
        raise HTTPException(status_code=404, detail=f"Session with ID {id} not found.")
    
    laps_count = len(sess.lap_times) if sess.lap_times else 0
    return SessionDetailResponse(
        id=sess.id,
        name=sess.name,
        created_at=sess.created_at,
        laps_count=laps_count
    )

@router.get("/{id}/analysis", response_model=SessionAnalysisResponse)
def get_session_analysis(id: int, db: Session = Depends(get_db)):
    sess = db.query(SessionModel).filter(SessionModel.id == id).first()
    if not sess:
        raise HTTPException(status_code=404, detail=f"Session with ID {id} not found.")
    
    # 1. Fetch baseline and stress lap if they exist
    baseline_avg, stress_lap_num = get_session_baseline(id, db)

    # 2. Pre-map lap number -> audio clip & emotion analysis
    lap_audio_map = {}
    for clip in sess.audio_clips:
        if clip.lap_number is not None:
            existing = lap_audio_map.get(clip.lap_number)
            if not existing:
                lap_audio_map[clip.lap_number] = clip
            else:
                existing_ea = existing.emotion_analyses[0] if existing.emotion_analyses else None
                current_ea = clip.emotion_analyses[0] if clip.emotion_analyses else None
                if current_ea and (not existing_ea or current_ea.combined_stress_score > existing_ea.combined_stress_score):
                    lap_audio_map[clip.lap_number] = clip

    timeline = []
    # Sort laps by lap_number
    sorted_laps = sorted(sess.lap_times, key=lambda x: x.lap_number)
    for lap in sorted_laps:
        clip = lap_audio_map.get(lap.lap_number)
        ea = clip.emotion_analyses[0] if (clip and clip.emotion_analyses) else None
        
        state = ea.final_state if (ea and ea.final_state) else "CALM"
        stress_score = ea.combined_stress_score if ea else 0.0
        text = clip.transcript.text if (clip and clip.transcript) else None
        audio_emotion = ea.audio_emotion if ea else None
        text_emotion = ea.text_emotion if ea else None
        
        # Calculate performance delta if baseline average exists
        perf_delta = None
        if baseline_avg is not None:
            perf_delta = (lap.lap_time_seconds - baseline_avg) / baseline_avg * 100

        timeline.append(
            TimelineEntry(
                lap=lap.lap_number,
                lap_time=lap.lap_time_seconds,
                driver_state=state,
                stress_score=stress_score,
                performance_delta=perf_delta,
                text=text,
                audio_emotion=audio_emotion,
                text_emotion=text_emotion,
                sector_1=lap.sector_1_seconds,
                sector_2=lap.sector_2_seconds,
                sector_3=lap.sector_3_seconds
            )
        )
        
    return SessionAnalysisResponse(
        session_id=id,
        timeline=timeline
    )
