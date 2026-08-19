# PitPulse Demo Assets Guide

This directory contains guidelines and tools for preparing audio demo assets for PitPulse.

## How to Record Demo Audio Clips

To get the best transcription and stress detection results, record audio clips following these guidelines:

1. **Format:** Record in `.wav` or `.mp3` format.
2. **Settings:** Mono, 16kHz or 44.1kHz sample rate.
3. **Driver Radio Scripts (Examples):**
   * **Stressed/Urgent Clip (Trigger Words: "box", "tires", "problem"):** 
     > *"Box this lap engineer, box this lap! The rear tires are completely gone, I have zero grip!"*
   * **Neutral/Routine Clip:** 
     > *"Copy that, sector 2 time is looking stable. I'm focusing on the battery charge now."*
   * **Frustrated/Telemetry Clip:**
     > *"We have a power loss on the main straight! Let me know if there's a sensor failure."*

---

## Pre-generated Synthetic Test Audio

You can use the helper script `generate_test_audio.py` in this folder to generate synthetic audio files (`test_stressed.wav` and `test_neutral.wav`) programmatically. These files contain valid wav headers and simple sine waves, allowing you to test the upload and database pipeline immediately without recording yourself.

To generate them, run:
```bash
python generate_test_audio.py
```
