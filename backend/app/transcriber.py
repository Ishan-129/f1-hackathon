import os
import json
from pathlib import Path
import soundfile as sf
import numpy as np
from transformers import pipeline

# Global variable to cache the ASR pipeline singleton
_asr_pipeline = None

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_TRAINED_MODEL = BACKEND_DIR / "models" / "f1-whisper"


def get_asr_model_name() -> str:
    """Prefer a locally trained checkpoint, with the Hub model as fallback."""
    configured = os.getenv("PITPULSE_ASR_MODEL")
    if configured:
        return configured
    if (DEFAULT_TRAINED_MODEL / "config.json").exists():
        return str(DEFAULT_TRAINED_MODEL)
    return "openai/whisper-tiny"


def get_radio_prompt() -> str | None:
    configured = os.getenv("PITPULSE_ASR_MODEL")
    model_dir = Path(configured) if configured and Path(configured).is_dir() else DEFAULT_TRAINED_MODEL
    prompt_file = model_dir / "f1_radio_prompt.json"
    if not prompt_file.exists():
        return None
    try:
        prompt = json.loads(prompt_file.read_text(encoding="utf-8")).get("prompt")
        return prompt if isinstance(prompt, str) and prompt.strip() else None
    except (OSError, json.JSONDecodeError):
        return None

def get_asr_pipeline():
    """Lazy-loader for the Whisper ASR pipeline."""
    global _asr_pipeline
    if _asr_pipeline is None:
        model_name = get_asr_model_name()
        print(f"Loading PitPulse ASR model: {model_name}")
        _asr_pipeline = pipeline(
            "automatic-speech-recognition",
            model=model_name,
        )
        print("Model loaded successfully.")
    return _asr_pipeline

def transcribe_audio_file(file_path: str) -> dict:
    """
    Reads an audio file, converts it to mono float32 at 16kHz,
    and transcribes it using Hugging Face Whisper.
    
    Returns:
        dict: {"text": str, "confidence": float}
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")
        
    try:
        # Load audio file using soundfile
        data, samplerate = sf.read(file_path)
        
        # Ensure we have a 1D mono array
        if len(data.shape) > 1:
            # Downmix stereo/multichannel to mono by averaging channels
            data = np.mean(data, axis=1)
            
        # Whisper pipeline expects data as float32
        data = data.astype(np.float32)
        
        # Run Whisper pipeline
        pipe = get_asr_pipeline()
        
        # Prepare inputs for the ASR pipeline
        # By passing a dictionary with "array" and "sampling_rate",
        # Hugging Face's pipeline will automatically resample the audio to 16kHz if needed.
        inputs = {
            "array": data,
            "sampling_rate": samplerate
        }
        
        generate_kwargs = {"language": "en", "task": "transcribe"}
        prompt = get_radio_prompt()
        if prompt:
            tokenizer = getattr(pipe, "tokenizer", None)
            if tokenizer is not None and hasattr(tokenizer, "get_prompt_ids"):
                generate_kwargs["prompt_ids"] = tokenizer.get_prompt_ids(prompt)
        result = pipe(inputs, generate_kwargs=generate_kwargs)
        text = result.get("text", "").strip()
        
        # Whisper pipeline doesn't natively return a single confidence score.
        # We return a standard high confidence value (e.g. 0.95) for the demo.
        confidence = 0.95
        
        return {
            "text": text if text else "[Unintelligible audio]",
            "confidence": confidence
        }
    except Exception as e:
        print(f"Error during Whisper transcription: {e}")
        raise e
