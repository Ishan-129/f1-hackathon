# PitPulse — F1 Driver Acoustic Sentiment & Telemetry Correlation

**PitPulse** analyzes Formula 1 driver radio transmissions using Hugging Face ML models to detect stress, fatigue, and urgency in real time, then correlates these biometric signals with lap-time telemetry to surface actionable race-engineering insights.

---

## How to Run Both Servers

### 1. Backend (FastAPI + Python)

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Verify: open `http://localhost:8000/docs` — you should see the FastAPI Swagger UI.

### 2. Frontend (Next.js + React)

```powershell
cd frontend
npm install
npm run dev
```

Verify: open `http://localhost:3000` — you should see the PitPulse landing page.

> **Important:** Start the backend first. The frontend connects to `http://localhost:8000`.

---

## How to Run the Demo Flow

### One-Click Demo (recommended for stage)

1. Open `http://localhost:3000`.
2. Click **▶ LOAD DEMO SESSION — ONE CLICK START** on the landing page.
3. This seeds a deterministic session with 22 laps of telemetry + 3 pre-analysed radio events (laps 10, 18, 19) from `demo-assets/lap_times.csv`.
4. You are auto-redirected to the Dashboard. All 4 screens are now populated.

### Manual Demo (full pipeline)

1. Create a session via the API or let the frontend auto-create one.
2. Navigate to **Radio Analyzer** → upload `demo-assets/test_stressed.wav` → associate with lap 18.
3. Navigate to **Dashboard** → upload `demo-assets/lap_times.csv`.
4. Navigate to **Performance** → confirm chart and sector deltas.
5. Navigate to **Engineer Insights** → click **SYNC INSIGHTS**.

---

## 2-Minute Demo Script

| Step | Action | What to Show |
|------|--------|--------------|
| 1 | Start backend (`port 8000`) + frontend (`port 3000`) | Terminals running |
| 2 | Open `localhost:3000`, click **LOAD DEMO SESSION** | Landing page → auto-redirect to Dashboard |
| 3 | Dashboard | Lap time vs stress correlation chart, driver state badge (CALM/STRESSED), biometric bars |
| 4 | Navigate to **Radio Analyzer** | Select the Lap 18 transmission from the timeline feed → show transcript: *"The tires are gone, I have no grip"* → show fused stress readout (78%) |
| 5 | Navigate to **Performance** | Stress trigger at Lap 18, baseline vs post-stress delta (+2.4%), sector degradation breakdown |
| 6 | Navigate to **Engineer Insights** | Performance degradation alert, driver state warning, AI action directives (pit swap, minimize radio) |

**Total time: ~90 seconds of clicking + narration.**

---

## Hugging Face Model Attribution

PitPulse uses three Hugging Face Hub models:

| Model | Task | Hub Link |
|-------|------|----------|
| `openai/whisper-tiny` | Automatic Speech Recognition (ASR) | https://huggingface.co/openai/whisper-tiny |
| `j-hartmann/emotion-english-distilroberta-base` | Text Emotion Classification | https://huggingface.co/j-hartmann/emotion-english-distilroberta-base |
| `superb/wav2vec2-base-superb-er` | Speech Emotion Recognition (SER) | https://huggingface.co/superb/wav2vec2-base-superb-er |

> **⚠ Manual Step:** Per hackathon rules, each team member must create an individual Hugging Face account and verify real Hub usage. Account creation and any required access tokens are a manual setup step — not automated by this codebase.

### Fine-tune on the bundled F1 radio data

The `model/` directory contains the five Parquet shards from the F1 team-radio dataset. The backend includes a streaming Whisper fine-tuner that reads the embedded MP3 bytes, resamples them to 16 kHz, and trains against the supplied `transcription` field. It also writes an F1 driver/race prompt used during inference.

Run a quick local smoke check:

```powershell
cd backend
python train_model.py --max-samples 8 --max-steps 1 --output-dir models/f1-whisper
```

For a real fine-tune, use a CUDA machine and run the full corpus:

```powershell
cd backend
python train_model.py --output-dir models/f1-whisper --num-train-epochs 3
```

Once `backend/models/f1-whisper/config.json` exists, the API automatically uses it for uploads. Set `PITPULSE_ASR_MODEL` to override the checkpoint path. The generated model directory is ignored by git because it contains large binary weights.

---

## Demo Assets

| File | Purpose |
|------|---------|
| `demo-assets/lap_times.csv` | 22-lap telemetry with pre-stress laps averaging 90.0s and post-stress averaging 92.16s (= 2.4% deterioration) |
| `demo-assets/test_stressed.wav` | Synthetic stressed audio clip for live upload demo |
| `demo-assets/test_neutral.wav` | Synthetic neutral audio clip |

---

## Tech Stack

- **Backend:** Python 3.14, FastAPI, SQLAlchemy (SQLite), Pandas, NumPy
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Recharts
- **ML:** Hugging Face Transformers (Whisper, DistilRoBERTa, Wav2Vec2), PyTorch
