# PitPulse API Contract Specification

All timestamp fields use the ISO 8601 string format: `YYYY-MM-DDTHH:MM:SSZ` or `YYYY-MM-DDTHH:MM:SS.mmmmmmZ` (UTC).

---

## 1. POST `/api/session`
Creates a new race engineering/analysis session.

* **Content-Type**: `application/json`
* **Request JSON Body**:
  ```json
  {
    "name": "Monza Practice 1"
  }
  ```
* **Response Status**: `201 Created`
* **Response JSON Body**:
  ```json
  {
    "id": 1,
    "name": "Monza Practice 1",
    "created_at": "2026-08-19T19:12:00Z"
  }
  ```

---

## 2. POST `/api/audio/upload`
Uploads a driver/engineer radio audio clip file associated with a session.

* **Content-Type**: `multipart/form-data`
* **Form-data Fields**:
  * `session_id`: `int` (Required)
  * `file`: Binary file (e.g. `.wav`, `.mp3`) (Required)
* **Response Status**: `201 Created`
* **Response JSON Body**:
  ```json
  {
    "audio_clip_id": 1,
    "session_id": 1,
    "file_path": "/uploads/1_audio_12345.wav",
    "duration_seconds": 12.5,
    "lap_number": 5,
    "timestamp": "2026-08-19T19:12:05Z"
  }
  ```

---

## 3. POST `/api/analyze/audio`
Triggers Speech-To-Text transcription (Whisper) and emotion analysis on an uploaded audio clip.

* **Content-Type**: `application/json`
* **Request JSON Body**:
  ```json
  {
    "audio_clip_id": 1
  }
  ```
* **Response Status**: `200 OK`
* **Response JSON Body**:
  ```json
  {
    "transcript": {
      "id": 1,
      "audio_clip_id": 1,
      "text": "Box this lap, tires are going off.",
      "confidence": 0.95,
      "timestamp": "2026-08-19T19:12:10Z"
    },
    "emotion_analysis": {
      "id": 1,
      "audio_clip_id": 1,
      "transcript_id": 1,
      "audio_emotion": "stressed",
      "audio_emotion_score": 0.82,
      "text_emotion": "frustrated",
      "text_emotion_score": 0.75,
      "combined_stress_score": 0.79,
      "timestamp": "2026-08-19T19:12:10Z"
    }
  }
  ```

---

## 4. POST `/api/laps`
Submits a newly completed lap's telemetry and sector times.

* **Content-Type**: `application/json`
* **Request JSON Body**:
  ```json
  {
    "session_id": 1,
    "lap_number": 5,
    "lap_time_seconds": 92.45,
    "sector_1_seconds": 31.20,
    "sector_2_seconds": 28.15,
    "sector_3_seconds": 33.10,
    "is_valid": true
  }
  ```
* **Response Status**: `201 Created`
* **Response JSON Body**:
  ```json
  {
    "id": 1,
    "session_id": 1,
    "lap_number": 5,
    "lap_time_seconds": 92.45,
    "sector_1_seconds": 31.20,
    "sector_2_seconds": 28.15,
    "sector_3_seconds": 33.10,
    "is_valid": true,
    "timestamp": "2026-08-19T19:12:15Z"
  }
  ```

---

## 5. GET `/api/session/{id}`
Retrieves session metadata, including a count of laps recorded.

* **Response Status**: `200 OK`
* **Response JSON Body**:
  ```json
  {
    "id": 1,
    "name": "Monza Practice 1 (Mock)",
    "created_at": "2026-08-19T19:12:00Z",
    "laps_count": 5
  }
  ```

---

## 6. GET `/api/session/{id}/analysis`
Compiles a chronological history (timeline) of all radio transcription and emotion data for a given session.

* **Response Status**: `200 OK`
* **Response JSON Body**:
  ```json
  {
    "session_id": 1,
    "timeline": [
      {
        "audio_clip_id": 1,
        "timestamp": "2026-08-19T19:12:10Z",
        "text": "Box this lap, tires are going off.",
        "audio_emotion": "stressed",
        "audio_emotion_score": 0.82,
        "text_emotion": "frustrated",
        "text_emotion_score": 0.75,
        "combined_stress_score": 0.79
      }
    ]
  }
  ```

---

## 7. GET `/api/session/{id}/insights`
Retrieves AI-generated/rule-based insights for the session, categorized with urgency severity.

* **Response Status**: `200 OK`
* **Response JSON Body**:
  ```json
  {
    "session_id": 1,
    "insights": [
      {
        "id": 1,
        "category": "driver_state",
        "content": "Driver stress level is high. Keep radio messages concise.",
        "severity": "high",
        "timestamp": "2026-08-19T19:12:10Z"
      },
      {
        "id": 2,
        "category": "performance",
        "content": "Sector 3 times are degrading. Tires might be overheating.",
        "severity": "medium",
        "timestamp": "2026-08-19T19:12:15Z"
      }
    ]
  }
  ```
