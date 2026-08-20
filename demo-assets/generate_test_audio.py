import wave
import math
import struct
import os

def create_sine_wav(filepath, duration=2.0, freq=440.0, sample_rate=16000):
    """Generates a simple sine wave WAV file."""
    print(f"Generating synthetic audio file: {filepath}...")
    num_samples = int(duration * sample_rate)
    
    # Ensure directory exists
    dir_name = os.path.dirname(filepath)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)

    with wave.open(filepath, 'w') as wav_file:
        wav_file.setnchannels(1)      # Mono
        wav_file.setsampwidth(2)      # 16-bit depth (2 bytes per sample)
        wav_file.setframerate(sample_rate)
        
        for i in range(num_samples):
            t = float(i) / sample_rate
            # 32767 is max amplitude for 16-bit signed audio
            value = int(32767.0 * math.sin(2.0 * math.pi * freq * t))
            data = struct.pack('<h', value)
            wav_file.writeframesraw(data)
            
    print(f"Generated {filepath} successfully (duration: {duration}s).")

if __name__ == "__main__":
    # Generate test files in the same directory as the script
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    create_sine_wav(os.path.join(current_dir, "test_stressed.wav"), duration=2.5, freq=440.0)
    create_sine_wav(os.path.join(current_dir, "test_neutral.wav"), duration=1.8, freq=660.0)
