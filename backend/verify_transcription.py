import os
import sys
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add the backend root directory to the python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from app.main import app
from app.db import Base, engine, get_db, SessionModel, AudioClipModel, TranscriptModel, EmotionAnalysisModel

client = TestClient(app)

def run_verification():
    print("=== STARTING PITPULSE AUDIO PIPELINE VERIFICATION ===")
    
    # 1. Clean the database first (drop and recreate all tables for verification)
    print("Recreating database schema for test...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    # 2. Create a test session
    print("Step 1: Creating a test session...")
    create_session_resp = client.post("/api/session", json={"name": "Test Session"})
    assert create_session_resp.status_code == 201, f"Failed to create session: {create_session_resp.text}"
    session_data = create_session_resp.json()
    session_id = session_data["id"]
    print(f"Session created successfully: {session_data}")
    
    # 3. Locate the test audio file
    demo_assets_dir = os.path.abspath(os.path.join(backend_dir, "..", "demo-assets"))
    audio_file_path = os.path.join(demo_assets_dir, "test_stressed.wav")
    assert os.path.exists(audio_file_path), f"Test audio file not found at {audio_file_path}"
    print(f"Test audio file found at: {audio_file_path}")
    
    # 4. Upload the audio file
    print("Step 2: Uploading audio file to POST /api/audio/upload...")
    with open(audio_file_path, "rb") as f:
        upload_resp = client.post(
            "/api/audio/upload",
            data={"session_id": session_id, "lap_number": 3},
            files={"file": ("test_stressed.wav", f, "audio/wav")}
        )
    
    assert upload_resp.status_code == 201, f"Audio upload failed: {upload_resp.text}"
    upload_data = upload_resp.json()
    audio_clip_id = upload_data["audio_clip_id"]
    print(f"Audio uploaded successfully: {upload_data}")
    assert upload_data["session_id"] == session_id
    assert upload_data["lap_number"] == 3
    # Synthetic wave file test_stressed.wav has duration of 2.5 seconds
    assert abs(upload_data["duration_seconds"] - 2.5) < 0.1, f"Duration mismatch: {upload_data['duration_seconds']}"
    
    # 5. Run analysis on the uploaded clip
    print("Step 3: Triggering analysis via POST /api/analyze/audio...")
    analyze_resp = client.post(
        "/api/analyze/audio",
        json={"audio_clip_id": audio_clip_id}
    )
    
    assert analyze_resp.status_code == 200, f"Audio analysis failed: {analyze_resp.text}"
    analysis_data = analyze_resp.json()
    print(f"Audio analyzed successfully: {analysis_data}")
    
    # Verify transcript schema
    assert "transcript" in analysis_data
    assert "text" in analysis_data["transcript"]
    assert analysis_data["transcript"]["audio_clip_id"] == audio_clip_id
    
    # Verify emotion analysis schema
    assert "emotion_analysis" in analysis_data
    assert analysis_data["emotion_analysis"]["audio_clip_id"] == audio_clip_id
    assert analysis_data["emotion_analysis"]["transcript_id"] == analysis_data["transcript"]["id"]
    assert "audio_emotion" in analysis_data["emotion_analysis"]
    assert "combined_stress_score" in analysis_data["emotion_analysis"]
    
    # 6. Verify database records directly
    print("Step 4: Inspecting database records directly via SQLAlchemy...")
    db_session = next(get_db())
    try:
        # Check AudioClip record
        db_clip = db_session.query(AudioClipModel).filter(AudioClipModel.id == audio_clip_id).first()
        assert db_clip is not None, "Audio clip not found in DB"
        print(f"DB check: AudioClip record verified. File path: {db_clip.file_path}, Duration: {db_clip.duration_seconds}s, Lap: {db_clip.lap_number}")
        
        # Check Transcript record
        db_transcript = db_session.query(TranscriptModel).filter(TranscriptModel.audio_clip_id == audio_clip_id).first()
        assert db_transcript is not None, "Transcript not found in DB"
        print(f"DB check: Transcript record verified. Text: '{db_transcript.text}', Confidence: {db_transcript.confidence}")
        assert db_transcript.confidence == 0.95
        
        # Check Emotion Analysis record
        db_emotion = db_session.query(EmotionAnalysisModel).filter(EmotionAnalysisModel.audio_clip_id == audio_clip_id).first()
        assert db_emotion is not None, "Emotion analysis not found in DB"
        print(f"DB check: EmotionAnalysis record verified. Audio emotion: {db_emotion.audio_emotion}, Combined stress: {db_emotion.combined_stress_score}")
        
    finally:
        db_session.close()
        
    print("=== PITPULSE AUDIO PIPELINE VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_verification()
