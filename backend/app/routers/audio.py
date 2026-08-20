from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db import get_db, AudioClipModel, TranscriptModel, EmotionAnalysisModel, SessionModel
from app.models import AudioClipResponse, AudioAnalysisRequest, AudioAnalysisResponse, TranscriptDetail, EmotionAnalysisDetail
from app.transcriber import transcribe_audio_file
from app.analytics import analyze_text_emotion, analyze_audio_emotion, compute_fusion_metrics
import os
import subprocess
import soundfile as sf

router = APIRouter(prefix="/api", tags=["Audio"])

# Local directory where audio files will be stored
UPLOAD_DIR = "uploads"

@router.post("/audio/upload", response_model=AudioClipResponse, status_code=201)
def upload_audio(
    session_id: int = Form(...),
    lap_number: int = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1. Verify session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found.")

    # 2. Verify file extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".wav", ".mp3", ".webm"]:
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio format. Only WAV, MP3, and WEBM are supported."
        )

    # 3. Create upload directory if it does not exist
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # 4. Generate a unique filename to avoid collisions
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_filename = f"session_{session_id}_{timestamp_str}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, safe_filename)

    # 5. Save the file to disk
    try:
        with open(dest_path, "wb") as buffer:
            buffer.write(file.file.read())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

    # 5b. Convert webm to wav using ffmpeg (soundfile/Whisper need wav/mp3)
    if ext == ".webm":
        wav_filename = safe_filename.replace(".webm", ".wav")
        wav_path = os.path.join(UPLOAD_DIR, wav_filename)
        try:
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", dest_path, "-ar", "16000", "-ac", "1", wav_path],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg error: {result.stderr}")
            # Remove original webm, use wav going forward
            os.remove(dest_path)
            dest_path = wav_path
            safe_filename = wav_filename
        except FileNotFoundError:
            if os.path.exists(dest_path):
                os.remove(dest_path)
            raise HTTPException(
                status_code=500,
                detail="ffmpeg is not installed. Install it to support live mic recordings (webm)."
            )
        except Exception as e:
            if os.path.exists(dest_path):
                os.remove(dest_path)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to convert webm to wav: {str(e)}"
            )

    # 6. Read audio duration using soundfile
    try:
        info = sf.info(dest_path)
        duration_seconds = info.duration
    except Exception as e:
        # Clean up corrupted file
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read audio file metadata. The file may be corrupt. Error: {str(e)}"
        )

    # 7. Persist to database
    # The API contract returns file_path as a web path (e.g. /uploads/filename.ext)
    web_file_path = f"/uploads/{safe_filename}"
    
    audio_clip = AudioClipModel(
        session_id=session_id,
        file_path=web_file_path,
        duration_seconds=duration_seconds,
        lap_number=lap_number,
        timestamp=datetime.now(timezone.utc)
    )
    
    db.add(audio_clip)
    db.commit()
    db.refresh(audio_clip)

    return AudioClipResponse(
        audio_clip_id=audio_clip.id,
        session_id=audio_clip.session_id,
        file_path=audio_clip.file_path,
        duration_seconds=audio_clip.duration_seconds,
        lap_number=audio_clip.lap_number,
        timestamp=audio_clip.timestamp
    )

@router.post("/analyze/audio", response_model=AudioAnalysisResponse)
def analyze_audio(
    req: AudioAnalysisRequest,
    db: Session = Depends(get_db)
):
    # 1. Fetch audio clip record from database
    clip = db.query(AudioClipModel).filter(AudioClipModel.id == req.audio_clip_id).first()
    if not clip:
        raise HTTPException(status_code=404, detail=f"Audio clip with ID {req.audio_clip_id} not found.")

    # 2. Get local disk path of the audio file
    filename = os.path.basename(clip.file_path)
    local_path = os.path.join(UPLOAD_DIR, filename)

    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail=f"Audio file not found on disk at {local_path}.")

    # 3. Transcribe audio using Hugging Face Whisper
    try:
        transcription_result = transcribe_audio_file(local_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Speech-To-Text transcription engine failed: {str(e)}"
        )

    # 4. Save transcript to transcripts table
    transcript = TranscriptModel(
        audio_clip_id=clip.id,
        text=transcription_result["text"],
        confidence=transcription_result["confidence"],
        timestamp=datetime.now(timezone.utc)
    )
    db.add(transcript)
    db.commit()
    db.refresh(transcript)

    # 5. Multimodal emotion analysis and fusion
    try:
        # Audio SER analysis
        audio_res = analyze_audio_emotion(local_path)
        
        # Text emotion analysis
        text_res = analyze_text_emotion(transcript.text)
        
        # Compute fusion
        fusion_res = compute_fusion_metrics(
            text=transcript.text,
            duration_seconds=clip.duration_seconds,
            rms_energy=audio_res["rms_energy"],
            silence_ratio=audio_res["silence_ratio"],
            text_stress=text_res["text_stress"],
            voice_stress=audio_res["voice_stress"],
            waveform=audio_res["waveform"]
        )
    except Exception as e:
        # Fail-safe fallbacks if ML models error out
        print(f"Emotion extraction pipeline failed, using fallback metrics: {e}")
        audio_res = {"dominant_emotion": "neutral", "score": 1.0, "voice_stress": 0.0, "rms_energy": 0.01, "silence_ratio": 0.1}
        text_res = {"dominant_emotion": "neutral", "score": 1.0, "text_stress": 0.0}
        fusion_res = {"final_state": "CALM", "stress": 0.0, "fatigue": 0.0, "urgency": 0.0, "confidence": 50.0}

    # 6. Save emotion analysis to DB
    # Map combined_stress_score to stress / 100.0 for backward contract compatibility
    emotion_analysis = EmotionAnalysisModel(
        audio_clip_id=clip.id,
        transcript_id=transcript.id,
        audio_emotion=audio_res["dominant_emotion"],
        audio_emotion_score=audio_res["score"],
        text_emotion=text_res["dominant_emotion"],
        text_emotion_score=text_res["score"],
        combined_stress_score=fusion_res["stress"] / 100.0,
        final_state=fusion_res["final_state"],
        stress=fusion_res["stress"],
        fatigue=fusion_res["fatigue"],
        urgency=fusion_res["urgency"],
        confidence=fusion_res["confidence"],
        timestamp=datetime.now(timezone.utc)
    )
    db.add(emotion_analysis)
    db.commit()
    db.refresh(emotion_analysis)

    return AudioAnalysisResponse(
        transcript=TranscriptDetail(
            id=transcript.id,
            audio_clip_id=transcript.audio_clip_id,
            text=transcript.text,
            confidence=transcript.confidence,
            timestamp=transcript.timestamp
        ),
        emotion_analysis=EmotionAnalysisDetail(
            id=emotion_analysis.id,
            audio_clip_id=emotion_analysis.audio_clip_id,
            transcript_id=emotion_analysis.transcript_id,
            audio_emotion=emotion_analysis.audio_emotion,
            audio_emotion_score=emotion_analysis.audio_emotion_score,
            text_emotion=emotion_analysis.text_emotion,
            text_emotion_score=emotion_analysis.text_emotion_score,
            combined_stress_score=emotion_analysis.combined_stress_score,
            final_state=emotion_analysis.final_state,
            stress=emotion_analysis.stress,
            fatigue=emotion_analysis.fatigue,
            urgency=emotion_analysis.urgency,
            confidence=emotion_analysis.confidence,
            timestamp=emotion_analysis.timestamp
        )
    )

