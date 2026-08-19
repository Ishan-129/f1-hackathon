import os
import soundfile as sf
import numpy as np
from transformers import pipeline
from sqlalchemy.orm import Session
from app.db import SessionModel, LapTimeModel, AudioClipModel, EmotionAnalysisModel, InsightModel

# Global variables to cache model singletons
_text_classifier = None
_audio_classifier = None

def get_text_classifier():
    """Lazy loader for the Hugging Face Text Emotion Classifier."""
    global _text_classifier
    if _text_classifier is None:
        print("Loading Hugging Face Text Emotion Classifier (j-hartmann/emotion-english-distilroberta-base)...")
        _text_classifier = pipeline(
            "text-classification",
            model="j-hartmann/emotion-english-distilroberta-base",
            top_k=None
        )
        print("Text emotion model loaded successfully.")
    return _text_classifier

def get_audio_classifier():
    """Lazy loader for the Hugging Face Audio Emotion Classifier (speech-emotion-recognition)."""
    global _audio_classifier
    if _audio_classifier is None:
        print("Loading Hugging Face Audio Emotion Classifier (superb/wav2vec2-base-superb-er)...")
        _audio_classifier = pipeline(
            "audio-classification",
            model="superb/wav2vec2-base-superb-er"
        )
        print("Audio emotion model loaded successfully.")
    return _audio_classifier

def analyze_text_emotion(text: str) -> dict:
    """
    Analyzes the emotion/sentiment in the text transcript.
    Returns:
        dict: {"dominant_emotion": str, "score": float, "text_stress": float, "all_preds": list}
    """
    if not text or text.strip() == "" or text == "[Unintelligible audio]":
        return {
            "dominant_emotion": "neutral",
            "score": 1.0,
            "text_stress": 0.0,
            "all_preds": []
        }
        
    try:
        classifier = get_text_classifier()
        preds = classifier(text)
        
        # Format can be nested [[{'label': 'anger', 'score': ...}]] depending on HF version
        if isinstance(preds, list) and len(preds) > 0:
            if isinstance(preds[0], list):
                preds = preds[0]
                
        # Find dominant emotion
        dominant = max(preds, key=lambda x: x['score'])
        dominant_label = dominant['label']
        dominant_score = dominant['score']
        
        # Map predicted emotions to stress weights:
        # anger/fear: 1.0, sadness/surprise: 0.5, disgust: 0.4, others: 0.0
        weights = {
            "anger": 1.0,
            "fear": 1.0,
            "sadness": 0.5,
            "surprise": 0.5,
            "disgust": 0.4,
            "neutral": 0.0,
            "joy": 0.0
        }
        
        text_stress = 0.0
        for pred in preds:
            label = pred['label'].lower()
            score = pred['score']
            weight = weights.get(label, 0.0)
            text_stress += score * weight
            
        text_stress = min(100.0, max(0.0, text_stress * 100.0))
        
        return {
            "dominant_emotion": dominant_label,
            "score": dominant_score,
            "text_stress": text_stress,
            "all_preds": preds
        }
    except Exception as e:
        print(f"Error during text emotion analysis: {e}")
        return {
            "dominant_emotion": "neutral",
            "score": 1.0,
            "text_stress": 0.0,
            "all_preds": []
        }

def resample_waveform(waveform: np.ndarray, orig_sr: int, target_sr: int = 16000) -> np.ndarray:
    """Resamples a 1D waveform array to target_sr using linear interpolation."""
    if orig_sr == target_sr:
        return waveform
    duration = len(waveform) / orig_sr
    num_target_samples = int(duration * target_sr)
    return np.interp(
        np.linspace(0, len(waveform) - 1, num_target_samples),
        np.arange(len(waveform)),
        waveform
    ).astype(np.float32)

def analyze_audio_emotion(file_path: str) -> dict:
    """
    Analyzes the emotion in raw audio.
    Reads audio waveform directly to compute speech energy and silence.
    Returns:
        dict: {"dominant_emotion": str, "score": float, "voice_stress": float, "rms_energy": float, "silence_ratio": float, "waveform": ndarray}
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")
        
    try:
        # 1. Read audio waveform using soundfile
        data, samplerate = sf.read(file_path)
        if len(data.shape) > 1:
            data = np.mean(data, axis=1) # Downmix stereo to mono
        data = data.astype(np.float32)
        
        # Compute waveform statistics
        rms_energy = float(np.sqrt(np.mean(data ** 2))) if len(data) > 0 else 0.0
        silence_ratio = float(np.mean(np.abs(data) < 0.002)) if len(data) > 0 else 1.0
        
        # Resample to 16kHz for superb model
        data_16k = resample_waveform(data, samplerate, 16000)
        
        # 2. Run speech emotion recognition model
        classifier = get_audio_classifier()
        preds = classifier(data_16k)
        
        if isinstance(preds, list) and len(preds) > 0:
            if isinstance(preds[0], list):
                preds = preds[0]
                
        # Find dominant emotion
        dominant = max(preds, key=lambda x: x['score'])
        dominant_label = dominant['label']
        dominant_score = dominant['score']
        
        # Standardize labels from superb/wav2vec2-base-superb-er (neu, hap, ang, sad)
        label_map = {
            "ang": "angry",
            "neu": "neutral",
            "hap": "happy",
            "sad": "sad"
        }
        friendly_label = label_map.get(dominant_label.lower(), dominant_label)
        
        # Map predicted audio emotions to stress weights:
        # ang/angry: 1.0, sad/sadness/fear: 1.0 or 0.5
        weights = {
            "ang": 1.0,
            "angry": 1.0,
            "sad": 0.5,
            "neu": 0.0,
            "neutral": 0.0,
            "hap": 0.0,
            "happy": 0.0
        }
        
        voice_stress = 0.0
        for pred in preds:
            label = pred['label'].lower()
            score = pred['score']
            weight = weights.get(label, 0.0)
            voice_stress += score * weight
            
        voice_stress = min(100.0, max(0.0, voice_stress * 100.0))
        
        return {
            "dominant_emotion": friendly_label,
            "score": dominant_score,
            "voice_stress": voice_stress,
            "rms_energy": rms_energy,
            "silence_ratio": silence_ratio,
            "waveform": data
        }
    except Exception as e:
        print(f"Error during audio emotion analysis: {e}")
        return {
            "dominant_emotion": "neutral",
            "score": 1.0,
            "voice_stress": 0.0,
            "rms_energy": 0.0,
            "silence_ratio": 1.0,
            "waveform": np.array([], dtype=np.float32)
        }

def compute_fusion_metrics(
    text: str,
    duration_seconds: float,
    rms_energy: float,
    silence_ratio: float,
    text_stress: float,
    voice_stress: float,
    waveform: np.ndarray = None
) -> dict:
    """
    Fuses audio features, text sentiment, and keywords into high-level driver state.
    Outputs:
        dict: {
            "final_state": "CALM" | "STRESSED" | "TIRED",
            "stress": float (0-100),
            "fatigue": float (0-100),
            "urgency": float (0-100),
            "confidence": float (0-100)
        }
    """
    lower_text = text.lower()
    
    # 1. Estimate Urgency (0-100)
    # Text-based urgency keywords
    urgency_keywords = ["box", "now", "immediately", "problem", "failure", "emergency", "critical", "tires", "grip", "brake", "straight", "power", "loss", "crash"]
    text_urgency_boost = sum(40.0 for kw in urgency_keywords if kw in lower_text)
    text_urgency = min(100.0, 20.0 + text_urgency_boost)
    
    # Audio-based urgency (pace and loudness/energy)
    words = text.split()
    word_count = len(words)
    # Speech pace (words per second)
    pace = word_count / duration_seconds if duration_seconds > 0 else 0.0
    pace_score = min(100.0, max(0.0, (pace - 1.5) * 25.0))
    # Sound energy score normalized to a reference level (e.g. 0.05 RMS)
    rms_score = min(100.0, (rms_energy / 0.05) * 100.0) if rms_energy > 0 else 0.0
    
    audio_urgency = 0.6 * rms_score + 0.4 * pace_score
    urgency = min(100.0, max(0.0, 0.5 * text_urgency + 0.5 * audio_urgency))
    
    # 2. Estimate Fatigue (0-100)
    # Slow speech: pace less than 1.8 words/second
    slow_speech_score = max(0.0, min(100.0, (1.8 - pace) * 50.0))
    # Silence ratio: silences longer than 30% of clip duration
    silence_score = min(100.0, max(0.0, (silence_ratio - 0.3) * 200.0)) if silence_ratio > 0.3 else 0.0
    # Energy fatigue: soft/mumbled speech (energy under 0.015 but not silent)
    if 0.001 < rms_energy < 0.015:
        energy_fatigue = max(0.0, min(100.0, (0.015 - rms_energy) * 5000.0))
    else:
        energy_fatigue = 0.0
    # Words repetition (e.g. cognitive fatigue repetitions like "no no" or "copy copy")
    repetition_score = 0.0
    if len(words) > 1:
        for i in range(len(words) - 1):
            w1 = words[i].lower()
            w2 = words[i+1].lower()
            if w1 == w2 and w1 not in ["the", "a", "an", "to", "in", "on", "of", "and", "is", "it"]:
                repetition_score = 30.0
                break
                
    fatigue = min(100.0, max(0.0, 0.3 * slow_speech_score + 0.3 * silence_score + 0.2 * energy_fatigue + 0.2 * repetition_score))
    
    # 3. Estimate Confidence (0-100)
    base_confidence = 95.0
    
    # Deduct penalty if text sentiment and audio tone disagree significantly
    disagreement_penalty = 0.0
    if abs(voice_stress - text_stress) > 50.0:
        disagreement_penalty = 15.0
        
    # Deduct penalty for extremely quiet audio (signal-to-noise ratio)
    audio_quality_penalty = 0.0
    if rms_energy < 0.003:
        audio_quality_penalty = 20.0
    elif waveform is not None and len(waveform) > 0 and np.max(np.abs(waveform)) > 0.98:
        audio_quality_penalty = 10.0 # Audio clipping
        
    confidence = min(100.0, max(0.0, base_confidence - disagreement_penalty - audio_quality_penalty))
    
    # 4. Compute Final Fusion Stress (0-100)
    # final_stress = 0.45*voice_stress + 0.30*text_stress + 0.15*urgency + 0.10*fatigue
    stress = 0.45 * voice_stress + 0.30 * text_stress + 0.15 * urgency + 0.10 * fatigue
    stress = min(100.0, max(0.0, stress))
    
    # 5. Classify Driver State
    # Hackathon brief: exactly CALM / STRESSED / TIRED labels. TIRED takes precedence.
    if fatigue >= 50.0:
        final_state = "TIRED"
    elif stress > 50.0:
        final_state = "STRESSED"
    else:
        final_state = "CALM"
        
    return {
        "final_state": final_state,
        "stress": stress,
        "fatigue": fatigue,
        "urgency": urgency,
        "confidence": confidence
    }

def get_session_baseline(session_id: int, db: Session):
    """
    Returns (baseline_avg, stress_lap_number) if a stress event and baseline exist, otherwise (None, None).
    """
    sess = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not sess:
        return None, None
        
    laps = sorted(sess.lap_times, key=lambda x: x.lap_number)
    if not laps:
        return None, None
        
    lap_emotion_map = {}
    for clip in sess.audio_clips:
        if clip.lap_number is not None and clip.emotion_analyses:
            ea = clip.emotion_analyses[0]
            existing = lap_emotion_map.get(clip.lap_number)
            if not existing or ea.combined_stress_score > existing.combined_stress_score:
                lap_emotion_map[clip.lap_number] = ea
                
    stress_lap_idx = None
    for idx, l in enumerate(laps):
        ea = lap_emotion_map.get(l.lap_number)
        state = ea.final_state if (ea and ea.final_state) else "CALM"
        if state in ["STRESSED", "TIRED"]:
            has_calm_before = any(
                (lap_emotion_map.get(prev.lap_number).final_state if (lap_emotion_map.get(prev.lap_number) and lap_emotion_map.get(prev.lap_number).final_state) else "CALM") == "CALM"
                for prev in laps[:idx]
            )
            if has_calm_before:
                stress_lap_idx = idx
                break
                
    if stress_lap_idx is not None:
        stress_lap_num = laps[stress_lap_idx].lap_number
        N = 3
        calm_before = []
        for l in laps[:stress_lap_idx]:
            ea = lap_emotion_map.get(l.lap_number)
            state = ea.final_state if (ea and ea.final_state) else "CALM"
            if state == "CALM":
                calm_before.append(l)
        baseline_laps = calm_before[-N:]
        if len(baseline_laps) > 0:
            baseline_avg = sum(l.lap_time_seconds for l in baseline_laps) / len(baseline_laps)
            return baseline_avg, stress_lap_num
            
    return None, None

def generate_session_insights(session_id: int, db: Session) -> list:
    """
    Analyzes session lap times and driver stress levels to produce actionable insights.
    """
    sess = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not sess:
        return []
        
    laps = sorted(sess.lap_times, key=lambda x: x.lap_number)
    if not laps:
        return []
        
    lap_emotion_map = {}
    for clip in sess.audio_clips:
        if clip.lap_number is not None and clip.emotion_analyses:
            ea = clip.emotion_analyses[0]
            existing = lap_emotion_map.get(clip.lap_number)
            if not existing or ea.combined_stress_score > existing.combined_stress_score:
                lap_emotion_map[clip.lap_number] = ea
                
    lap_states = []
    for l in laps:
        ea = lap_emotion_map.get(l.lap_number)
        state = ea.final_state if (ea and ea.final_state) else "CALM"
        stress_val = ea.stress if ea else 0.0
        lap_states.append({
            "lap_number": l.lap_number,
            "lap_time": l.lap_time_seconds,
            "state": state,
            "stress_score": stress_val
        })
        
    stress_lap_idx = None
    for idx, ls in enumerate(lap_states):
        if ls["state"] in ["STRESSED", "TIRED"]:
            has_calm_before = any(lap_states[i]["state"] == "CALM" for i in range(idx))
            if has_calm_before:
                stress_lap_idx = idx
                break
                
    insights = []
    
    if stress_lap_idx is not None:
        stress_lap_num = lap_states[stress_lap_idx]["lap_number"]
        N = 3
        calm_before = [ls for ls in lap_states[:stress_lap_idx] if ls["state"] == "CALM"]
        baseline_laps = calm_before[-N:]
        
        if len(baseline_laps) > 0:
            baseline_avg = sum(ls["lap_time"] for ls in baseline_laps) / len(baseline_laps)
            next_laps = lap_states[stress_lap_idx + 1 : stress_lap_idx + 3]
            
            if len(next_laps) > 0:
                next_laps_avg = sum(ls["lap_time"] for ls in next_laps) / len(next_laps)
                performance_delta = (next_laps_avg - baseline_avg) / baseline_avg * 100
                
                if performance_delta >= 0:
                    content = f"Driver stress increased at Lap {stress_lap_num} and was followed by a {performance_delta:.1f}% deterioration in lap time over the next two laps."
                    severity = "high" if performance_delta > 1.5 else "medium"
                else:
                    content = f"Driver stress increased at Lap {stress_lap_num} but lap times improved by {abs(performance_delta):.1f}% over the next two laps."
                    severity = "low"
                    
                insights.append({
                    "category": "performance",
                    "content": content,
                    "severity": severity
                })
            else:
                insights.append({
                    "category": "performance",
                    "content": f"Driver stress increased at Lap {stress_lap_num}; insufficient subsequent laps to calculate performance delta.",
                    "severity": "medium"
                })
        else:
            insights.append({
                "category": "performance",
                "content": f"Driver stress increased at Lap {stress_lap_num}; insufficient calm baseline laps to calculate performance delta.",
                "severity": "medium"
            })
            
    latest_stress_lap = None
    for ls in reversed(lap_states):
        if ls["state"] in ["STRESSED", "TIRED"]:
            latest_stress_lap = ls
            break
            
    if latest_stress_lap:
        if latest_stress_lap["state"] == "STRESSED":
            insights.append({
                "category": "driver_state",
                "content": f"Driver stress level is high (Lap {latest_stress_lap['lap_number']}). Keep radio messages concise.",
                "severity": "high"
            })
        elif latest_stress_lap["state"] == "TIRED":
            insights.append({
                "category": "driver_state",
                "content": f"Driver fatigue is high (Lap {latest_stress_lap['lap_number']}). Recommend focusing on hydration and basic inputs.",
                "severity": "high"
            })
    else:
        insights.append({
            "category": "driver_state",
            "content": "Driver state is stable and calm.",
            "severity": "low"
        })
        
    return insights
