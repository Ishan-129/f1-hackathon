# PitPulse Project State

## Current Phase: Phase 0 (Skeleton Setup)
**Status:** Completed

---

## 1. What Was Built
* **Backend Skeleton:**
  * **Database Models (`backend/app/db.py`)**: Declared SQLite schema with SQLAlchemy. Six tables created: `sessions`, `audio_clips` (includes optional `lap_number`), `transcripts` (includes optional transcription `confidence` score), `emotion_analyses`, `lap_times`, and `insights`.
  * **Pydantic Validation (`backend/app/models.py`)**: Defined data validation and API response models matching the API Contract.
  * **API Stub Routers (`backend/app/routers/`)**: 
    * `session.py`: POST `/api/session`, GET `/api/session/{id}`, GET `/api/session/{id}/analysis`
    * `audio.py`: POST `/api/audio/upload`, POST `/api/analyze/audio`
    * `laps.py`: POST `/api/laps`
    * `insights.py`: GET `/api/session/{id}/insights`
  * **Entrypoint (`backend/app/main.py`)**: Configured with CORS middleware to accept frontend connections and automatic DB migrations on start.
  * **Requirements (`backend/requirements.txt`)**: Resolved Python 3.14 compatible versions for FastAPI, Uvicorn, SQLAlchemy, Pydantic, Pandas, NumPy, as well as AI packages (`torch`, `transformers`, `soundfile`).
* **Frontend Skeleton:**
  * Scaffolded a Next.js 15+ App Router app under `/frontend` with TypeScript and Tailwind CSS.
  * Created empty page views for `/dashboard`, `/radio-analyzer`, `/performance`, and `/insights`.
  * Configured `frontend/app/page.tsx` with a client-side fetch to `http://localhost:8000/api/session/1` to verify connectivity.
* **Documentation:**
  * Created `docs/API_CONTRACT.md` detailing all exact JSON request/response shapes.

---

## 2. What Is Stubbed / Mocked
* Every backend API router is a stub returning hardcoded JSON responses matching the Pydantic response models.
* No real AI inference (Whisper/Emotion models) or Pandas/NumPy lap processing is active.
* SQLite connection is setup and tables are generated, but stubs do not write or read data to/from the database yet.

---

## 3. How to Run Both Servers

### Backend
1. Open a PowerShell/terminal window.
2. Navigate to `/backend`.
3. Run the following to start the Uvicorn dev server:
   ```powershell
   venv\Scripts\activate
   uvicorn app.main:app --reload --port 8000
   ```
4. Verify by opening `http://localhost:8000/docs` in your browser.

### Frontend
1. Open another terminal window.
2. Navigate to `/frontend`.
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` to view the page.

---

## 4. What Was Built in Phase 1 (AI Transcription Pipeline)
* **Real-time Speech-To-Text:**
  * Replaced stub logic for `POST /api/audio/upload` and `POST /api/analyze/audio` with active implementations.
  * Loaded Hugging Face's `openai/whisper-tiny` model globally as a lazy-loaded singleton for CPU efficiency.
  * Downmixed multi-channel/stereo audio to mono dynamically inside `transcriber.py`.
  * Mounted a static directory `/uploads` on the FastAPI server to serve stored audio files.
  * Programmatic duration calculation using the lightweight `soundfile` library during file uploads.
* **Database Cohesion:**
  * Integrated database persistence for `sessions`, `audio_clips`, `transcripts`, and `emotion_analyses` using SQLite.
  * Added `lap_number` (optional telemetry association) and `confidence` (Whisper transcription confidence score) to SQLite schemas.
  * Upgraded `POST /api/session`, `GET /api/session/{id}`, and `GET /api/session/{id}/analysis` to fetch live data and construct chronological analysis timelines.
* **Demo Assets:**
  * Created `/demo-assets/README.md` containing sample scripts, instructions, and vocal cues for demo recordings.
  * Built a helper script `generate_test_audio.py` that generates synthetic wave files programmatically for offline pipeline testing.

---

## 5. Model Performance & Observations
* **Whisper-Tiny Footprint:**
  * The model weighs approximately ~150MB, making CPU inference extremely fast (~1-2 seconds for typical 5-10 second driver radio clips).
  * High compatibility with python 3.14.5.
  * Whisper's default behavior for pure silence or non-speech tones (like synthetic sine waves) returns generic tokens (e.g. *"Thank you very much."*). In the demo, real voice clips should be used for accurate transcriptions.

---

## 6. Phase 2: Audio + Text Emotion Fusion (Completed)
* **Multimodal Sentiment Pipeline & Model Choices:**
  * **Text Emotion Model:** Loaded `j-hartmann/emotion-english-distilroberta-base` fine-tuned on emotion detection. Maps probability scores of: `anger` (1.0), `fear` (1.0), `sadness` (0.5), `surprise` (0.5), `disgust` (0.4), and others (0.0) to output a `text_stress` score (0-100).
  * **Audio SER Model:** Loaded `superb/wav2vec2-base-superb-er` running directly on raw mono 16kHz audio waveforms. Standardized outputs (`ang`, `sad`, `neu`, `hap`) to human-friendly categories (`angry`, `sad`, `neutral`, `happy`) and mapped their probabilities to a `voice_stress` score (0-100).
  * **Waveform Statistics:** Formulated features like RMS energy (speech volume) and silent frame ratios (pauses/hesitations) directly from raw sound file samples.
* **Fusion Engine:**
  * **Urgency (0-100):** Combines keyword detection (e.g., "box", "problem", "tires") with speech energy (RMS) and pace (words per second).
  * **Fatigue (0-100):** Estimated via slow speech pace (< 1.8 words/sec), silence frame ratios (> 30%), quiet/mumbled energy patterns, and consecutive word repetitions (e.g. "no no", "copy copy").
  * **Confidence (0-100):** Derived from base transcription confidence, with penalties for text-voice sentiment contradictions or low-amplitude noisy/clipped audio.
  * **Fusion Formula:**
    $$final\_stress = 0.45 \times voice\_stress + 0.30 \times text\_stress + 0.15 \times urgency + 0.10 \times fatigue$$
  * **Driver State Classification:**
    * If `fatigue >= 50.0` -> `TIRED`
    * Else if `final_stress > 50.0` -> `STRESSED`
    * Else -> `CALM`
  * **Database & Routing Cohesion:** Saved all 5 fusion metrics (`final_state`, `stress`, `fatigue`, `urgency`, `confidence`) into `emotion_analyses` table, mapping `combined_stress_score = stress / 100.0` for backwards contract compatibility. Exposed metrics via `POST /api/analyze/audio` and `GET /api/session/{id}/analysis`.

---

## 7. Known Weaknesses
* **Transcription Silence Behavior:** Whisper-Tiny transcription on pure silence or sine wave tones can output generic sentences (e.g., *"Thank you very much."*). While our fallback defaults handle quiet audio and avoid stress false positives, real vocal recordings are needed for accurate transcription.
* **Noisy Audio Channels:** While our model handles quiet audio and signal clipping, loud background engine or wind noise can inflate speech energy (RMS), raising estimated stress/urgency.
* **CPU Inference Overhead:** Loading three transformer pipelines (ASR, Audio, Text) sequentially during the first inference run on a cold start takes ~1-2 minutes on CPU. Subsequent inferences are cached and run in under 5 seconds.

---

## 8. Phase 3: Lap-Time Telemetry Correlation (Completed)
* **Telemetry CSV Ingestion:**
  * Modified `POST /api/laps` to accept a CSV file (`multipart/form-data`) with columns like `lap` and `time` (supporting custom variants like `lap_number` or `lap_time`).
  * Telemetry CSV is parsed using `pandas`, cleans existing lap times for the session to prevent duplicates, computes sector fallbacks (`lap_time / 3.0`) if sector columns are missing, and bulk inserts them into the `lap_times` DB table.
* **Correlation Engine:**
  * Identifies the first transition lap where the driver state shifts from `CALM` to `STRESSED` or `TIRED` (the stress event).
  * Computes a performance `baseline` by averaging the lap times of the last $N$ (default 3) calm laps immediately preceding the stress event.
  * Calculates `performance_delta` for all session laps relative to this baseline using the formula: `performance_delta = (current_lap_time - baseline) / baseline * 100`.
* **Dynamic Insights:**
  * `GET /api/session/{id}/insights` generates plain-language, rule-based insights comparing post-stress average lap times over the next two laps against the baseline.
  * Successfully computes and saves insights to the database, returning the dynamic response (e.g., *"Driver stress increased at Lap 18 and was followed by a 2.4% deterioration in lap time over the next two laps."*).
* **Demo Telemetry Asset:**
  * Added `demo-assets/lap_times.csv` with a 22-lap story. Pre-stress laps (15-17) average exactly 90.0s, and post-stress laps (19-20) average 92.16s, which yields exactly the 2.4% slowdown deterioration for demo verification.

---

## 9. What Phase 4 Needs (Frontend Dashboard Integration)
The frontend dashboard will render the telemetry chart and insights list. It consumes the following exact API response shapes:

### 1. GET `/api/session/{id}/analysis`
Returns a unified timeline of all recorded laps in the session, sorted chronologically by lap number. Used for plotting the combined driver stress and lap time degradation curves.

* **Response Status**: `200 OK`
* **Response JSON Body**:
```json
{
  "session_id": 1,
  "timeline": [
    {
      "lap": 1,
      "lap_time": 90.5,
      "driver_state": "CALM",
      "stress_score": 0.099,
      "performance_delta": 0.556
    },
    {
      "lap": 15,
      "lap_time": 90.0,
      "driver_state": "CALM",
      "stress_score": 0.0,
      "performance_delta": 0.0
    },
    {
      "lap": 18,
      "lap_time": 91.5,
      "driver_state": "STRESSED",
      "stress_score": 0.508,
      "performance_delta": 1.667
    },
    {
      "lap": 19,
      "lap_time": 92.0,
      "driver_state": "CALM",
      "stress_score": 0.0,
      "performance_delta": 2.222
    }
  ]
}
```

### 2. GET `/api/session/{id}/insights`
Returns the generated performance degradation metrics and driver status alerts.

* **Response Status**: `200 OK`
* **Response JSON Body**:
```json
{
  "session_id": 1,
  "insights": [
    {
      "id": 1,
      "category": "performance",
      "content": "Driver stress increased at Lap 18 and was followed by a 2.4% deterioration in lap time over the next two laps.",
      "severity": "high",
      "timestamp": "2026-08-19T14:24:00Z"
    },
    {
      "id": 2,
      "category": "driver_state",
      "content": "Driver stress level is high (Lap 18). Keep radio messages concise.",
      "severity": "high",
      "timestamp": "2026-08-19T14:24:00Z"
    }
  ]
}
```

---

## 10. Phase 4: Race Overview & Radio Analyzer UI (Completed)
* **Design & Visual Theme**:
  * Implemented an F1 broadcast telemetry aesthetic using Tailwind CSS v4. Configured a pure black background (`#000000`), F1 Racing Red accents (`#E10600`), and monospace stats/number typography.
  * Designed clear status components for driver states (`CALM` in emerald green, `STRESSED` in flashing neon rose/red, and `TIRED` in glowing amber).
* **Race Overview Dashboard**:
  * Created `frontend/app/dashboard/page.tsx` containing driver biometrics (combined stress, fatigue, voice urgency, transcription confidence).
  * Built a Recharts double-axis `ComposedChart` showing the correlation between Lap Times (seconds, left Y-axis) and Biometric Stress Score (0-1.0, right Y-axis) over the session's laps.
  * Added an inline telemetry CSV ingestion form connected to the `POST /api/laps` endpoint to upload lap times CSV logs and refresh the chart instantly.
* **Radio Analyzer**:
  * Created `frontend/app/radio-analyzer/page.tsx` offering a file drag-and-drop uploader supporting WAV/MP3 files, associated with an optional target lap number.
  * Programmed a terminal-like progress loader executing sequential states (`[01/03] Transmitting audio... OK`, `[02/03] Whisper ASR processing... OK`, `[03/03] Fusing Multimodal metrics... OK`) to handle server-side model processing latencies gracefully without freezing the UI.
  * Rendered full transcription results, voice vs text emotion details, urgency, fatigue, and final combined stress gauges.
  * Integrated a historical transmissions log timeline; selecting a past transmission updates the main readout board.
* **Global Navigation**:
  * Formulated a root layout header in `frontend/app/layout.tsx` featuring connection check polling, latencies, driver context tags, and responsive navigations.

---

## 11. What Phase 5 (Performance + Insights) Needs from Backend
The next phase will construct the remaining two screens: the **Performance Analytics** screen and the **Insights Feed**. To succeed, Phase 5 relies on the following backend endpoints and data structures:

1. **Insights Endpoint (`GET /api/session/{id}/insights`)**:
   * Must return structured, categorized insights (e.g. `category: "performance" | "driver_state"`, `severity: "high" | "medium" | "low"`, `content: string`).
   * Needs to successfully read rule-based baseline calculations (comparing calm baseline lap times vs post-stress laps) to populate deterioration alerts.
2. **Telemetry Baselines and Deltas**:
   * The dashboard currently plots lap time vs stress. Phase 5's **Performance** screen will require sector-level granularity (`sector_1_seconds`, `sector_2_seconds`, `sector_3_seconds`) to trace where on the track the driver is losing time (e.g. straight-line speed vs cornering) after a stress event.
* Telemetry CSV uploads must continue to populate sector times in `lap_times` DB tables, and sector times should be returned in timeline fetches to allow plotting separate sector speed lines.

## 12. Demo Hardening (2026-08-19)
* Added `POST /api/session/demo`, a deterministic seed using `demo-assets/lap_times.csv` plus pre-analysed radio events at laps 10, 18, and 19.
* Added a global **LOAD DEMO SESSION** button so the stage flow does not depend on live upload, Wi-Fi, or cold Hugging Face inference.
* Removed the named-driver placeholder from the navigation; the UI now labels the deterministic demo driver.
* Added root `README.md` with server startup, one-click demo flow, and exact 2-minute script.
* Hugging Face model attribution is documented; individual HF accounts and any required tokens remain a manual team setup step.

### Demo status
All 4 screens are fully built, dynamicized, and wired to the SQL database using a shared `SessionContext` provider. Real-time synchronisation is verified end-to-end. Clicking **LOAD DEMO SESSION** updates the entire application to the demo session, allowing seamless navigation.

### Known risks
* First live audio analysis can take 1-2 minutes while models load; use the demo-session button on stage.
* Backend must be started from `backend` so SQLite and upload paths resolve correctly.

### Exact 2-minute demo script
1. Start backend on port 8000 and frontend on port 3000.
2. Open `http://localhost:3000` and click **LOAD DEMO SESSION**.
3. Show Dashboard chart, stress marker, and telemetry table.
4. Show Radio Analyzer transcript and fused stress readout from the seeded lap-18 event.
5. Show Performance sector degradation and baseline delta.
6. Show Engineer Insights and sync the generated alerts.

---

## 13. Phase 5: Dynamic Navigation & Screens 3 & 4 (Completed)
* **Shared State & Connection (`SessionContext.tsx`)**:
  * Implemented a React Context Provider wrapping the entire Next.js layout tree.
  * Dynamically manages the active `sessionId`, `sessionName`, `connected` link state, and a shared `refreshTrigger` dispatch.
  * Seamlessly propagates updates (e.g. loading a demo session, uploading telemetry CSV, or transmitting audio packets) across all open page views.
* **Performance Analysis Screen (Screen 3)**:
  * Plotted double-axis line overlays showing the correlation between Lap Times and Biometric Stress Score.
  * Highlights the stress trigger lap with a vertical marker line.
  * Automatically calculates performance degradation deltas by comparing post-event laps against a 3-lap pre-event calm baseline.
  * Computes and displays sector-by-sector time degradation percentages.
* **AI Race Engineer Insights Screen (Screen 4)**:
  * Renders alert cards mapping telemetry data and driver transcripts to actionable warnings.
  * Displays performance impact pace loss calculations.
  * Uses hedged language for possible mechanical causes derived from radio transcripts (e.g., locking brakes -> friction limits, tires gone -> thermal wear).
  * Outlines action directives (e.g., Plan B pit swaps, minimizing radio traffic).

## 14. What Is Mocked / Broken for Phase 6 to Fix
* **Cold Inference Pipeline latency**: The Hugging Face transformer models (ASR, Audio, Text) run sequentially on CPU and can take up to 2 seconds for a 5s clip. On first load, it blocks execution for 1-2 minutes. Phase 6 should implement an asynchronous background worker task queue (e.g. Celery + Redis, or simple thread pool executors) with WebSockets to stream intermediate progress.
* **In-memory SQLite DB**: Database stores session data in local `pitpulse.db`. It does not support concurrent write locks cleanly. Phase 6 can upgrade this to PostgreSQL or MySQL for cloud deployments.
* **Telemetry Sync Overwrites**: Ingesting a telemetry CSV clears previous lap times for the session. Phase 6 could support incremental time updates.

---

## 15. Stage Demo Readiness Verification (2026-08-19)

### Demo Status: VERIFIED & STABLE
- **End-to-End Flow Verified**: Run the backend verification test client script (`verify_phase3.py`) which successfully drop-recreated the SQLite DB, registered telemetry CSV laps, and processed both neutral and stressed synthetic audio files through the ML pipelines. All assertions (baseline, delta computation, and insight text generation matching 2.4% deterioration) passed with zero errors.
- **One-Click Demo Button**: Added to the landing page (`/`) and navigation header. It triggers a deterministic load of `demo-assets/lap_times.csv` + pre-analyzed radio event data directly into SQLite, bypassing inference/network delays on stage.
- **Loading Indicators**: Standardized across the application. Spinners are visible when checking link status, loading the demo, uploading telemetry, processing audio, and fetching insights or transmission logs.
- **Hydration & Responsive Bugs Fixed**: Replaced static server time in layout header with a client-side ticking UTC clock. Verified layout is clean on standard 1920x1080 resolution without visual overflows.

### Known Risks & Mitigation
1. **Model Loading Cold Starts**: Live audio analysis on a cold start takes ~1-2 minutes to download/load the models.
   - *Mitigation*: The stage presenter should click **LOAD DEMO SESSION** to immediately load pre-compiled data. For live uploads, pre-run the backend to warm up the model cache.
2. **Network Connection**: Wi-Fi issues on stage can block connection.
   - *Mitigation*: Run both backend and frontend locally. The app is fully self-contained and does not require active internet connection for the demo session.

### Exact 2-Minute Stage Demo Script
1. **Startup**: Run backend on port `8000` and frontend on port `3000` locally.
2. **Landing Page**: Open `http://localhost:3000`. Show the F1 aesthetics and click **▶ LOAD DEMO SESSION — ONE CLICK START**.
3. **Race Overview HUD**: Walk through the dynamic telemetry chart. Show the lap times and biometric stress curves correlating. Note the stable baseline and the trigger event.
4. **Radio Analyzer**: Go to the analyzer screen. Click Lap 18 in the transmissions log. Show the transcript: *"The tires are gone, I have no grip"* and stress indicators updating instantly.
5. **Performance Screen**: Show the sector breakdown. Point out how Sector 2 (medium/high-speed corners) degraded by +2.50% after the stress event, validating where the driver is losing time.
6. **Engineer Insights**: Show the AI Race Engineer Directive card. Explain the actionable suggestions: simplify radio messages, prepare pit swap to Plan B.


