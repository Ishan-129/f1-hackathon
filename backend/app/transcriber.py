import os
import soundfile as sf
import numpy as np
from transformers import pipeline

# Global variable to cache the ASR pipeline singleton
_asr_pipeline = None

def get_asr_pipeline():
    """Lazy-loader for the Whisper ASR pipeline."""
    global _asr_pipeline
    if _asr_pipeline is None:
        print("Loading Hugging Face Whisper-Tiny model...")
        # Load whisper-tiny model for automatic speech recognition
        _asr_pipeline = pipeline(
            "automatic-speech-recognition",
            model="openai/whisper-tiny"
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
        
        result = pipe(inputs)
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
