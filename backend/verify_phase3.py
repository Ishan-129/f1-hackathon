import os
import sys
from fastapi.testclient import TestClient

# Add the backend root directory to the python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from app.main import app
from app.db import Base, engine, get_db, SessionModel, LapTimeModel, AudioClipModel, EmotionAnalysisModel, InsightModel

client = TestClient(app)

def run_verification():
    print("=== STARTING PITPULSE PHASE 3 VERIFICATION ===")
    
    # 1. Clean the database first (drop and recreate all tables for verification)
    print("Recreating database schema...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    # 2. Create a test session
    print("\nStep 1: Creating a test session...")
    create_session_resp = client.post("/api/session", json={"name": "Monza Practice Phase 3"})
    assert create_session_resp.status_code == 201, f"Failed to create session: {create_session_resp.text}"
    session_data = create_session_resp.json()
    session_id = session_data["id"]
    print(f"Session created successfully: {session_data}")

    # 3. Upload the demo lap-time CSV
    print("\nStep 2: Uploading telemetry CSV...")
    demo_assets_dir = os.path.abspath(os.path.join(backend_dir, "..", "demo-assets"))
    csv_path = os.path.join(demo_assets_dir, "lap_times.csv")
    assert os.path.exists(csv_path), f"Telemetry CSV not found at {csv_path}"

    with open(csv_path, "rb") as f:
        upload_csv_resp = client.post(
            "/api/laps",
            data={"session_id": session_id},
            files={"file": ("lap_times.csv", f, "text/csv")}
        )
    assert upload_csv_resp.status_code == 201, f"CSV upload failed: {upload_csv_resp.text}"
    laps_data = upload_csv_resp.json()
    print(f"Uploaded telemetry CSV successfully. Imported {len(laps_data)} laps.")
    assert len(laps_data) == 22, f"Expected 22 laps, got {len(laps_data)}"

    # 4. Upload and analyze audio clips
    # Lap 1: Calm Audio
    # Lap 18: Stressed Audio
    neutral_audio_path = os.path.join(demo_assets_dir, "test_neutral.wav")
    stressed_audio_path = os.path.join(demo_assets_dir, "test_stressed.wav")
    assert os.path.exists(neutral_audio_path), f"Neutral test audio not found"
    assert os.path.exists(stressed_audio_path), f"Stressed test audio not found"

    def process_audio(audio_path, filename, lap):
        print(f"\nProcessing {filename} for Lap {lap}...")
        with open(audio_path, "rb") as f:
            upload_resp = client.post(
                "/api/audio/upload",
                data={"session_id": session_id, "lap_number": lap},
                files={"file": (filename, f, "audio/wav")}
            )
        assert upload_resp.status_code == 201, f"Audio upload failed: {upload_resp.text}"
        clip_id = upload_resp.json()["audio_clip_id"]
        
        # Trigger analysis
        analyze_resp = client.post(
            "/api/analyze/audio",
            json={"audio_clip_id": clip_id}
        )
        assert analyze_resp.status_code == 200, f"Analysis failed: {analyze_resp.text}"
        res = analyze_resp.json()
        print(f"Analysis complete. Final State: {res['emotion_analysis']['final_state']}, Stress Score: {res['emotion_analysis']['stress']:.1f}%")
        return clip_id, res

    # Upload neutral audio for Lap 1 (this ensures Lap 1 is CALM, and since it is the first lap, it establishes that the session starts CALM)
    process_audio(neutral_audio_path, "test_neutral.wav", 1)
    
    # Upload stressed audio for Lap 18 (this triggers the stress event at Lap 18)
    process_audio(stressed_audio_path, "test_stressed.wav", 18)

    # 5. Call session analysis endpoint
    print("\nStep 3: Fetching session analysis timeline...")
    analysis_resp = client.get(f"/api/session/{session_id}/analysis")
    assert analysis_resp.status_code == 200, f"Analysis fetch failed: {analysis_resp.text}"
    analysis_data = analysis_resp.json()
    timeline = analysis_data["timeline"]
    print(f"Timeline entries count: {len(timeline)}")
    assert len(timeline) == 22, f"Expected timeline to have 22 entries, got {len(timeline)}"

    # Let's inspect Lap 1, 15, 17, 18, 19, 20
    timeline_by_lap = {item["lap"]: item for item in timeline}
    
    print("\nVerifying specific laps in timeline:")
    print(f"Lap 1: Time={timeline_by_lap[1]['lap_time']:.2f}s, State={timeline_by_lap[1]['driver_state']}, Stress={timeline_by_lap[1]['stress_score']:.3f}, Delta={timeline_by_lap[1]['performance_delta']}")
    print(f"Lap 15: Time={timeline_by_lap[15]['lap_time']:.2f}s, State={timeline_by_lap[15]['driver_state']}, Delta={timeline_by_lap[15]['performance_delta']:.3f}%")
    print(f"Lap 17: Time={timeline_by_lap[17]['lap_time']:.2f}s, State={timeline_by_lap[17]['driver_state']}, Delta={timeline_by_lap[17]['performance_delta']:.3f}%")
    print(f"Lap 18 (Stress): Time={timeline_by_lap[18]['lap_time']:.2f}s, State={timeline_by_lap[18]['driver_state']}, Stress={timeline_by_lap[18]['stress_score']:.3f}, Delta={timeline_by_lap[18]['performance_delta']:.3f}%")
    print(f"Lap 19: Time={timeline_by_lap[19]['lap_time']:.2f}s, State={timeline_by_lap[19]['driver_state']}, Delta={timeline_by_lap[19]['performance_delta']:.3f}%")
    print(f"Lap 20: Time={timeline_by_lap[20]['lap_time']:.2f}s, State={timeline_by_lap[20]['driver_state']}, Delta={timeline_by_lap[20]['performance_delta']:.3f}%")

    # Assert driver state at Lap 18 is STRESSED
    assert timeline_by_lap[18]["driver_state"] == "STRESSED", "Lap 18 should be STRESSED"
    # Assert Lap 1 is CALM
    assert timeline_by_lap[1]["driver_state"] == "CALM", "Lap 1 should be CALM"
    # Verify the baseline calculation: Laps 15, 16, 17 are CALM and have lap_time = 90.0s.
    # Average baseline = 90.0s
    # Lap 19: 92.0s -> Delta = (92.0 - 90.0) / 90.0 * 100 = 2.222%
    # Lap 20: 92.32s -> Delta = (92.32 - 90.0) / 90.0 * 100 = 2.578%
    assert abs(timeline_by_lap[15]["performance_delta"] - 0.0) < 1e-5
    assert abs(timeline_by_lap[17]["performance_delta"] - 0.0) < 1e-5
    assert abs(timeline_by_lap[19]["performance_delta"] - 2.2222) < 1e-3
    assert abs(timeline_by_lap[20]["performance_delta"] - 2.5777) < 1e-3

    # 6. Fetch insights
    print("\nStep 4: Fetching session insights...")
    insights_resp = client.get(f"/api/session/{session_id}/insights")
    assert insights_resp.status_code == 200, f"Insights fetch failed: {insights_resp.text}"
    insights_data = insights_resp.json()
    insights = insights_data["insights"]
    print(f"Generated {len(insights)} insights:")
    for ins in insights:
        print(f"- Category: {ins['category']}, Severity: {ins['severity']}, Content: '{ins['content']}'")

    # Find the performance insight
    perf_insight = next((ins for ins in insights if ins["category"] == "performance"), None)
    assert perf_insight is not None, "Performance insight not generated"
    assert "deterioration in lap time over the next two laps" in perf_insight["content"]
    assert "2.4%" in perf_insight["content"], f"Expected 2.4% deterioration in content, got: {perf_insight['content']}"
    assert "Lap 18" in perf_insight["content"]

    print("\n=== PITPULSE PHASE 3 VERIFICATION PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_verification()
