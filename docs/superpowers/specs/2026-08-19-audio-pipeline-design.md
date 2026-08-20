# Design Spec: Audio Transcription Pipeline (Phase 1)

**Date:** 2026-08-19  
**Goal:** Replace the stub logic behind `POST /api/audio/upload` and `POST /api/analyze/audio` with a working Hugging Face Whisper pipeline.

---

## 1. Goal Description
The purpose of this work is to implement a robust backend audio processing and Speech-to-Text (STT) transcription pipeline. When a user uploads a `.wav` or `.mp3` audio clip, it will be stored on disk, and its duration and lap associations will be saved in the database. When analysis is triggered, the audio will be transcribed using the `openai/whisper-tiny` model, and both the transcript and a placeholder emotion analysis will be persisted in SQLite.

---

## 2. Proposed Changes

### Database updates (`backend/app/db.py`)
* Add `lap_number` (Integer, nullable=True) to `AudioClipModel` to track driver telemetry alignment.
* Add `confidence` (Float, nullable=True) to `TranscriptModel` to store Whisper's transcription confidence.

### Validation schema (`backend/app/models.py`)
* Update `AudioClipResponse` to include `lap_number: Optional[int] = None`.
* Ensure Pydantic validation handles these optional and updated fields gracefully.

### Transciber module (`backend/app/transcriber.py`) [NEW]
* Initialize `transformers.pipeline("automatic-speech-recognition", model="openai/whisper-tiny")` as a global model lazy-loaded or loaded at module import.
* Provide a function `transcribe_audio(file_path: str) -> dict` returning the transcribed text and a confidence score.

### Audio Router (`backend/app/routers/audio.py`)
* Update `upload_audio`:
  * Create `backend/uploads/` directory if it does not exist.
  * Extract audio duration using `soundfile.info(filepath).duration`.
  * Persist clip metadata (`session_id`, `file_path`, `duration_seconds`, optional `lap_number`) to `audio_clips` table.
* Update `analyze_audio`:
  * Fetch `AudioClipModel` from the DB using the provided `audio_clip_id`.
  * Invoke the transcriber to generate text.
  * Persist the transcript to the database (`TranscriptModel`).
  * Save a temporary fallback emotion analysis (`EmotionAnalysisModel`) to the database (Phase 2 will replace this with real emotion fusion models).
  * Return the response matching `API_CONTRACT.md` exactly.

---

## 3. Verification Plan

### Automated/Local Tests
* We will write a verification test script to:
  1. Upload a dummy `.wav`/`.mp3` file to `POST /api/audio/upload`.
  2. Verify database records for `audio_clips`.
  3. Send `POST /api/analyze/audio` with the returned clip ID.
  4. Verify that the correct transcription is generated and saved in the database.

### Manual Verification
* Run Uvicorn server and test via FastAPI Swagger documentation (`http://localhost:8000/docs`).
