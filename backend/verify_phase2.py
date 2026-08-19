import os
import sys
from fastapi.testclient import TestClient

# Add the backend root directory to the python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from app.main import app
from app.db import Base, engine, get_db, SessionModel, AudioClipModel, TranscriptModel, EmotionAnalysisModel

client = TestClient(app)

def run_verification():
    print("=== STARTING PITPULSE PHASE 2 FUSION ENGINE VERIFICATION ===")
    
    # 1. Clean the database first (drop and recreate all tables for verification)
    print("Recreating database schema...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    # 2. Create a test session
    print("\nStep 1: Creating a test session...")
    create_session_resp = client.post("/api/session", json={"name": "Monza Practice Phase 2"})
    assert create_session_resp.status_code == 201, f"Failed to create session: {create_session_resp.text}"
    session_data = create_session_resp.json()
    session_id = session_data["id"]
    print(f"Session created successfully: {session_data}")
    
    # 3. Locate the test audio files
    demo_assets_dir = os.path.abspath(os.path.join(backend_dir, "..", "demo-assets"))
    stressed_audio_path = os.path.join(demo_assets_dir, "test_stressed.wav")
    neutral_audio_path = os.path.join(demo_assets_dir, "test_neutral.wav")
    
    assert os.path.exists(stressed_audio_path), f"Stressed test audio not found at {stressed_audio_path}"
    assert os.path.exists(neutral_audio_path), f"Neutral test audio not found at {neutral_audio_path}"
    
    # Helper to test clip
    def test_clip(audio_path, filename, lap):
        print(f"\n--- Testing audio clip: {filename} (Lap {lap}) ---")
        
        # Upload audio clip
        print("Uploading audio clip...")
        with open(audio_path, "rb") as f:
            upload_resp = client.post(
                "/api/audio/upload",
                data={"session_id": session_id, "lap_number": lap},
                files={"file": (filename, f, "audio/wav")}
            )
        assert upload_resp.status_code == 201, f"Audio upload failed: {upload_resp.text}"
        upload_data = upload_resp.json()
        audio_clip_id = upload_data["audio_clip_id"]
        print(f"Uploaded successfully. ID: {audio_clip_id}")
        
        # Trigger analysis
        print("Triggering multimodal analysis...")
        analyze_resp = client.post(
            "/api/analyze/audio",
            json={"audio_clip_id": audio_clip_id}
        )
        assert analyze_resp.status_code == 200, f"Analysis failed: {analyze_resp.text}"
        analysis_data = analyze_resp.json()
        
        print("\nAnalysis Result Details:")
        print(f"Transcript Text: '{analysis_data['transcript']['text']}'")
        ea = analysis_data["emotion_analysis"]
        print(f"Text Emotion: {ea['text_emotion']} (Score: {ea['text_emotion_score']:.3f})")
        print(f"Audio Emotion: {ea['audio_emotion']} (Score: {ea['audio_emotion_score']:.3f})")
        print(f"Urgency: {ea['urgency']:.1f}%")
        print(f"Fatigue: {ea['fatigue']:.1f}%")
        print(f"Confidence: {ea['confidence']:.1f}%")
        print(f"Stress Score: {ea['stress']:.1f}%")
        print(f"Final State: {ea['final_state']}")
        print(f"Combined Stress Score (Legacy 0-1): {ea['combined_stress_score']:.3f}")
        
        return audio_clip_id, analysis_data
        
    # Run the tests
    stressed_id, stressed_analysis = test_clip(stressed_audio_path, "test_stressed.wav", 5)
    neutral_id, neutral_analysis = test_clip(neutral_audio_path, "test_neutral.wav", 6)
    
    # 4. Verify DB storage directly
    print("\nStep 3: Verifying DB records directly via SQLAlchemy...")
    db_session = next(get_db())
    try:
        analyses = db_session.query(EmotionAnalysisModel).all()
        assert len(analyses) == 2, f"Expected 2 analysis records, found {len(analyses)}"
        for a in analyses:
            print(f"DB Record {a.id}: Clip {a.audio_clip_id} -> State: {a.final_state}, Stress: {a.stress:.1f}, Fatigue: {a.fatigue:.1f}, Urgency: {a.urgency:.1f}, Confidence: {a.confidence:.1f}")
            assert a.final_state in ["CALM", "STRESSED", "TIRED"]
            assert 0.0 <= a.stress <= 100.0
            assert 0.0 <= a.fatigue <= 100.0
            assert 0.0 <= a.urgency <= 100.0
            assert 0.0 <= a.confidence <= 100.0
    finally:
        db_session.close()
        
    # 5. Check Session Timeline Endpoint
    print("\nStep 4: Checking timeline endpoint...")
    timeline_resp = client.get(f"/api/session/{session_id}/analysis")
    assert timeline_resp.status_code == 200, f"Timeline request failed: {timeline_resp.text}"
    timeline_data = timeline_resp.json()
    print(f"Timeline retrieved for Session {session_id}. Number of items: {len(timeline_data['timeline'])}")
    for item in timeline_data["timeline"]:
        print(f"Timeline Clip {item['audio_clip_id']} -> Text: '{item['text']}', State: {item['final_state']}, Stress: {item['stress']:.1f}%")
        assert "final_state" in item
        assert "stress" in item
        assert "fatigue" in item
        
    print("\n=== PITPULSE PHASE 2 FUSION ENGINE VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_verification()
