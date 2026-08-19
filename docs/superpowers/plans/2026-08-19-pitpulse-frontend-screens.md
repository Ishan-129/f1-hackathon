# PitPulse Frontend Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Race Overview/Dashboard and Radio Analyzer screens, connecting them to the real FastAPI backend on port 8000, styled with a dark F1 broadcast HUD aesthetic.

**Architecture:** Use client-side React hooks (`useState`, `useEffect`) on `'use client'` Next.js pages to communicate with `http://localhost:8000`. Integrate Recharts for dual-axis correlation mapping and native HTML file pickers for CSV and audio telemetry packet uploads.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Recharts, Lucide React (icons).

## Global Constraints
* Maintain 100% dark mode race-telemetry design with pure black backgrounds (`bg-black`), dark gray borders (`border-gray-800`), and F1 Red highlights (`#E10600` / `text-red-600` / `border-red-600`).
* Use monospace fonts for all numerical stats and log lines.
* Handle API errors gracefully (offline server indicator, terminal-like upload failure displays).

---

### Task 1: Install Dependencies and Set Up Layout

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`

**Interfaces:**
- Consumes: None
- Produces: Navigation container, Lucide icons, and Recharts availability.

- [ ] **Step 1: Install `recharts` and `lucide-react`**
  Run:
  ```bash
  cd frontend
  npm install recharts lucide-react
  ```
  Expected: Installation succeeds without dependency resolution issues.

- [ ] **Step 2: Update `globals.css` with styling utilities**
  Add font styling and custom pulse animations to `frontend/app/globals.css`:
  ```css
  @import "tailwindcss";

  @theme {
    --color-f1-red: #E10600;
    --font-mono: var(--font-geist-mono), monospace;
  }

  @keyframes telemetry-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .animate-pulse-telemetry {
    animation: telemetry-pulse 1.5s infinite;
  }
  ```

- [ ] **Step 3: Modify `frontend/app/layout.tsx`**
  Edit the root layout to provide a unified broadcast HUD header:
  ```tsx
  'use client';

  import { useEffect, useState } from "react";
  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import { Activity, Radio, LayoutDashboard } from "lucide-react";
  import "./globals.css";

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [connected, setConnected] = useState(false);
    const [sessionName, setSessionName] = useState("SYNCING SESSION...");

    useEffect(() => {
      // Find or create session 1 on startup
      const checkSession = async () => {
        try {
          const res = await fetch("http://localhost:8000/api/session/1");
          if (res.ok) {
            const data = await res.json();
            setSessionName(data.name);
            setConnected(true);
          } else {
            // Create session 1 if it doesn't exist
            const createRes = await fetch("http://localhost:8000/api/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "MONZA PRACTICE 1" })
            });
            if (createRes.ok) {
              const data = await createRes.json();
              setSessionName(data.name);
              setConnected(true);
            }
          }
        } catch {
          setConnected(false);
          setSessionName("OFFLINE MODE");
        }
      };

      checkSession();
      const interval = setInterval(checkSession, 10000);
      return () => clearInterval(interval);
    }, []);

    return (
      <html lang="en" className="h-full bg-black text-white antialiased">
        <body className="min-h-full flex flex-col font-sans">
          {/* Latency Top Bar */}
          <div className="bg-black border-b border-gray-900 px-4 py-1.5 flex justify-between items-center text-xs tracking-wider text-gray-400 font-mono">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span>{connected ? "LIVE LINK ACTIVE" : "LINK OFFLINE - CHECK BACKEND"}</span>
            </div>
            <div className="text-f1-red font-bold">PITPULSE TELEMETRY ENGINE v1.0</div>
            <div>UTC: {new Date().toISOString().substring(11, 19)}</div>
          </div>

          {/* Main F1 HUD Navigation */}
          <header className="bg-gray-950 border-b-2 border-red-600 px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-6">
              <Link href="/dashboard" className="text-xl font-extrabold tracking-tighter italic text-white hover:text-red-500">
                PIT<span className="text-red-600">PULSE</span>
              </Link>
              <div className="hidden md:flex border-l border-gray-800 pl-6 text-sm text-gray-400 font-mono">
                SESSION: <span className="text-white font-bold ml-1">{sessionName.toUpperCase()}</span>
                <span className="mx-3 text-gray-700">|</span>
                DRIVER: <span className="text-white font-bold ml-1">L. HAMILTON // CAR 44</span>
              </div>
            </div>

            <nav className="flex gap-4">
              <Link href="/dashboard" className={`flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider rounded border transition ${pathname === '/dashboard' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-800 text-gray-400 hover:text-white'}`}>
                <LayoutDashboard size={14} />
                DASHBOARD
              </Link>
              <Link href="/radio-analyzer" className={`flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-wider rounded border transition ${pathname === '/radio-analyzer' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-800 text-gray-400 hover:text-white'}`}>
                <Radio size={14} />
                RADIO ANALYZER
              </Link>
            </nav>
          </header>

          <main className="flex-1 bg-black p-6">{children}</main>
        </body>
      </html>
    );
  }
  ```

---

### Task 2: Implement Dashboard Screen

**Files:**
- Create: `frontend/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `GET http://localhost:8000/api/session/1/analysis`, `POST http://localhost:8000/api/laps`

- [ ] **Step 1: Write dashboard file with Recharts correlation graph**
  Build a comprehensive dashboard under `frontend/app/dashboard/page.tsx` containing telemetry readings, CSV upload logic, and the Recharts chart:
  ```tsx
  'use client';

  import { useEffect, useState, useRef } from "react";
  import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart } from "recharts";
  import { Upload, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

  interface TimelineEntry {
    lap: number;
    lap_time: number;
    driver_state: string;
    stress_score: number;
    performance_delta: number | null;
  }

  export default function DashboardPage() {
    const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [csvUploading, setCsvUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch live session analysis
    const fetchAnalysis = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/session/1/analysis");
        if (!res.ok) throw new Error("Failed to load telemetry session analysis");
        const data = await res.json();
        setTimeline(data.timeline || []);
        setError(null);
      } catch (err: any) {
        setError(err.message || "Connection error to telemetry backend");
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      fetchAnalysis();
    }, []);

    // Telemetry CSV Upload Handler
    const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setCsvUploading(true);
      const formData = new FormData();
      formData.append("session_id", "1");
      formData.append("file", file);

      try {
        const res = await fetch("http://localhost:8000/api/laps", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const detail = await res.json();
          throw new Error(detail.detail || "Failed to ingest telemetry CSV");
        }

        await fetchAnalysis();
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err: any) {
        alert(`CSV Upload Error: ${err.message}`);
      } finally {
        setCsvUploading(false);
      }
    };

    // Calculate Driver State Metrics from latest lap timeline
    const latestEntry = timeline[timeline.length - 1];
    const driverState = latestEntry?.driver_state || "CALM";
    const stressPercent = Math.round((latestEntry?.stress_score || 0) * 100);

    const getStatusColor = (state: string) => {
      if (state === "STRESSED") return "bg-rose-600 text-white border-rose-500 animate-pulse-telemetry";
      if (state === "TIRED") return "bg-amber-500 text-black border-amber-400";
      return "bg-emerald-500 text-black border-emerald-400";
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-sm">
        
        {/* Left Column: Driver HUD Indicator & Stress Bars */}
        <div className="bg-gray-950 border border-gray-900 p-6 flex flex-col justify-between rounded-lg">
          <div>
            <h2 className="text-xs uppercase text-gray-500 font-bold mb-4 tracking-widest border-b border-gray-900 pb-2">
              // DRIVER BIOMETRICS HUD
            </h2>
            
            {/* Big Driver State Box */}
            <div className={`p-8 border-2 rounded text-center mb-6 transition-all ${getStatusColor(driverState)}`}>
              <div className="text-xs font-bold uppercase tracking-widest opacity-80">STATUS</div>
              <div className="text-4xl font-extrabold tracking-tighter">{driverState}</div>
            </div>

            {/* Stress level indicators */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1 text-gray-400">
                  <span>COMBINED BIOMETRIC STRESS</span>
                  <span className="font-bold text-white">{stressPercent}%</span>
                </div>
                <div className="w-full bg-gray-900 h-2 rounded overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${driverState === 'STRESSED' ? 'bg-rose-500' : 'bg-emerald-400'}`}
                    style={{ width: `${stressPercent}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 text-gray-400">
                  <span>ESTIMATED FATIGUE INDEX</span>
                  <span className="font-bold text-white">{driverState === 'TIRED' ? '70%' : '20%'}</span>
                </div>
                <div className="w-full bg-gray-900 h-2 rounded overflow-hidden">
                  <div 
                    className={`h-full bg-amber-500 transition-all duration-500`}
                    style={{ width: driverState === 'TIRED' ? '70%' : '20%' }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="text-xxs text-gray-600 mt-6 leading-relaxed">
            CRITICAL LIMITS: STRESSED &gt; 50% COMBINED STRESS // TIRED &gt; 50% FATIGUE. RADIO COMMUNICATION GUIDELINE: KEEP MESSAGES CONCISE IN WARNING STATES.
          </div>
        </div>

        {/* Center Column: Lap Telemetry & CSV Ingestion */}
        <div className="bg-gray-950 border border-gray-900 p-6 flex flex-col justify-between rounded-lg">
          <div>
            <h2 className="text-xs uppercase text-gray-500 font-bold mb-4 tracking-widest border-b border-gray-900 pb-2">
              // TELEMETRY LAP TIMING
            </h2>

            {/* Quick Stat Blocks */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-black border border-gray-900 p-4 rounded">
                <div className="text-xxs text-gray-500 uppercase">CURRENT LAP TIME</div>
                <div className="text-2xl font-extrabold text-white">
                  {latestEntry ? `${latestEntry.lap_time.toFixed(3)}s` : "N/A"}
                </div>
                <div className="text-xxs text-gray-500 mt-1">LAP: {latestEntry?.lap || "N/A"}</div>
              </div>

              <div className="bg-black border border-gray-900 p-4 rounded">
                <div className="text-xxs text-gray-500 uppercase">PERF DELTA</div>
                <div className={`text-2xl font-extrabold ${latestEntry?.performance_delta && latestEntry.performance_delta > 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                  {latestEntry?.performance_delta !== null && latestEntry?.performance_delta !== undefined
                    ? `${latestEntry.performance_delta > 0 ? '+' : ''}${latestEntry.performance_delta.toFixed(2)}%`
                    : "N/A"
                  }
                </div>
                <div className="text-xxs text-gray-500 mt-1">VS CALM BASELINE</div>
              </div>
            </div>

            {/* Ingestion Panel */}
            <div className="border border-dashed border-gray-800 p-6 rounded text-center bg-black/50">
              <Upload className="mx-auto mb-3 text-gray-600" size={24} />
              <div className="text-xs text-gray-300 font-bold mb-1">INGEST telemetry DATA packet</div>
              <p className="text-xxs text-gray-500 mb-4">Upload lap_times.csv telemetry logs</p>
              
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleCsvUpload}
                accept=".csv"
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={csvUploading}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-800 text-white text-xs font-bold py-2 px-4 rounded tracking-wider transition uppercase cursor-pointer"
              >
                {csvUploading ? "INGESTING..." : "SELECT CSV FILE"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex justify-between items-center">
            <button 
              onClick={fetchAnalysis}
              className="text-xs text-gray-500 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} /> REFRESH HUD DATA
            </button>
          </div>
        </div>

        {/* Right Column: Recharts Core Correlation Chart */}
        <div className="bg-gray-950 border border-gray-900 p-6 rounded-lg lg:col-span-3">
          <h2 className="text-xs uppercase text-gray-500 font-bold mb-4 tracking-widest border-b border-gray-900 pb-2">
            // CORRELATION MAP: LAP TIME VS DRIVER STRESS
          </h2>

          {loading ? (
            <div className="h-64 flex items-center justify-center text-gray-500">
              CONNECTING TELEMETRY BUS...
            </div>
          ) : error ? (
            <div className="h-64 flex flex-col items-center justify-center text-rose-500">
              <AlertTriangle className="mb-2" size={32} />
              <span>{error}</span>
            </div>
          ) : timeline.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-500 text-center">
              NO TELEMETRY RECORDED FOR CURRENT SESSION.<br />PLEASE INGEST TELEMETRY DATA PACKET (CSV).
            </div>
          ) : (
            <div className="h-72 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={timeline} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="lap" stroke="#9ca3af" tick={{ fontSize: 10, fontFamily: 'monospace' }} label={{ value: 'LAP NUMBER', position: 'insideBottom', offset: -5, stroke: '#9ca3af', fontSize: 10 }} />
                  <YAxis yAxisId="left" stroke="#ffffff" tick={{ fontSize: 10, fontFamily: 'monospace' }} domain={['dataMin - 1', 'dataMax + 1']} label={{ value: 'LAP TIME (S)', angle: -90, position: 'insideLeft', offset: 10, stroke: '#ffffff', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#ef4444" tick={{ fontSize: 10, fontFamily: 'monospace' }} domain={[0, 1]} label={{ value: 'STRESS LEVEL (0-1.0)', angle: 90, position: 'insideRight', offset: 10, stroke: '#ef4444', fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#0b0c10", borderColor: "#1f2937", fontFamily: 'monospace', color: '#fff', fontSize: 11 }}
                    labelFormatter={(label) => `Lap: ${label}`}
                  />
                  <Area yAxisId="right" type="monotone" dataKey="stress_score" fill="#ef4444" stroke="#ef4444" fillOpacity={0.15} name="Stress Level" />
                  <Line yAxisId="left" type="monotone" dataKey="lap_time" stroke="#ffffff" strokeWidth={2} activeDot={{ r: 6 }} name="Lap Time" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    );
  }
  ```

---

### Task 3: Implement Radio Analyzer Screen

**Files:**
- Create: `frontend/app/radio-analyzer/page.tsx`

**Interfaces:**
- Consumes: `POST http://localhost:8000/api/audio/upload`, `POST http://localhost:8000/api/analyze/audio`, `GET http://localhost:8000/api/session/1/analysis`

- [ ] **Step 1: Write Radio Analyzer Component**
  Create `frontend/app/radio-analyzer/page.tsx` containing file-upload interface, the sequential analysis loader state, detailed metric indicators, and history logs:
  ```tsx
  'use client';

  import { useState, useEffect, useRef } from "react";
  import { Radio, Mic, AlertCircle, Play, CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";

  interface PastRadioClip {
    audio_clip_id: number;
    timestamp: string;
    text: string;
    audio_emotion: string;
    audio_emotion_score: number;
    text_emotion: string;
    text_emotion_score: number;
    combined_stress_score: number;
  }

  export default function RadioAnalyzerPage() {
    const [file, setFile] = useState<File | null>(null);
    const [lapNumber, setLapNumber] = useState<string>("");
    const [uploading, setUploading] = useState(false);
    const [progressStep, setProgressStep] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<any>(null);
    const [timelineFeed, setTimelineFeed] = useState<PastRadioClip[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch previous radio transmissions for session 1
    const fetchTimelineFeed = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/session/1/analysis");
        if (res.ok) {
          const data = await res.json();
          // Filter entries that have audio clips/transcripts recorded
          setTimelineFeed(data.timeline || []);
        }
      } catch (err) {
        console.error("Failed to load historical timeline feed", err);
      }
    };

    useEffect(() => {
      fetchTimelineFeed();
    }, []);

    // Form submission for Audio Upload + Analysis
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!file) return;

      setUploading(true);
      setError(null);
      setAnalysisResult(null);
      setProgressStep(1); // Uploading...

      const formData = new FormData();
      formData.append("session_id", "1");
      formData.append("file", file);
      if (lapNumber) {
        formData.append("lap_number", lapNumber);
      }

      try {
        // Step 1: Upload Audio file
        const uploadRes = await fetch("http://localhost:8000/api/audio/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const detail = await uploadRes.json();
          throw new Error(detail.detail || "Audio packet upload failed");
        }

        const uploadData = await uploadRes.json();
        const clipId = uploadData.audio_clip_id;

        setProgressStep(2); // Transcribing...

        // Step 2: Trigger analysis
        const analyzeRes = await fetch("http://localhost:8000/api/analyze/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_clip_id: clipId }),
        });

        if (!analyzeRes.ok) {
          const detail = await analyzeRes.json();
          throw new Error(detail.detail || "Transcription & Emotion Fusion failed");
        }

        setProgressStep(3); // Completing...
        const analysisData = await analyzeRes.json();
        
        setAnalysisResult(analysisData);
        setFile(null);
        setLapNumber("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        
        await fetchTimelineFeed();
      } catch (err: any) {
        setError(err.message || "Model timeout or backend pipeline failure.");
        setProgressStep(0);
      } finally {
        setUploading(false);
      }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono text-sm">
        
        {/* Left Column: Radio Packet Ingestion */}
        <div className="bg-gray-950 border border-gray-900 p-6 rounded-lg flex flex-col justify-between">
          <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="text-xs uppercase text-gray-500 font-bold border-b border-gray-900 pb-2 tracking-widest">
              // RADIO TRANSMISSION INGESTION
            </h2>

            {/* Drag & Drop selector */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-gray-800 bg-black/40 hover:bg-black/80 transition p-8 text-center rounded cursor-pointer"
            >
              <Mic className="mx-auto mb-2 text-gray-500" size={32} />
              <div className="text-xs font-bold text-gray-300">
                {file ? file.name : "LOAD AUDIO WAVE PACKET"}
              </div>
              <p className="text-xxs text-gray-600 mt-1">WAV / MP3 FORMAT SUPPORTED</p>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept="audio/*"
                className="hidden" 
              />
            </div>

            {/* Lap association input */}
            <div>
              <label className="block text-xxs text-gray-500 uppercase mb-1">ASSOCIATE WITH LAP NUMBER (OPTIONAL)</label>
              <input 
                type="number" 
                placeholder="E.G. 18"
                value={lapNumber}
                onChange={(e) => setLapNumber(e.target.value)}
                className="w-full bg-black border border-gray-900 p-3 rounded text-white focus:outline-none focus:border-red-600 font-mono"
              />
            </div>

            <button 
              type="submit"
              disabled={!file || uploading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-800 text-white font-bold py-3 px-4 rounded tracking-wider transition uppercase cursor-pointer"
            >
              {uploading ? "TRANSMITTING..." : "TRANSMIT PACKET"}
            </button>
          </form>

          {/* Loader Log terminal */}
          {uploading && (
            <div className="bg-black border border-gray-900 p-4 rounded mt-4 text-xxs space-y-1.5 leading-relaxed font-mono">
              <div className="text-gray-500">TRANSMISSION SEQUENCE RUNNING:</div>
              <div className="flex items-center gap-2">
                <span className={progressStep >= 1 ? "text-emerald-400" : "text-gray-600"}>[01/03]</span>
                <span className={progressStep === 1 ? "text-white animate-pulse" : "text-gray-500"}>
                  UPLOADING AUDIO STREAM... {progressStep > 1 ? "OK" : "PENDING"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={progressStep >= 2 ? "text-emerald-400" : "text-gray-600"}>[02/03]</span>
                <span className={progressStep === 2 ? "text-white animate-pulse" : "text-gray-500"}>
                  RUNNING WHISPER SPEECH-TO-TEXT... {progressStep > 2 ? "OK" : "PENDING"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={progressStep >= 3 ? "text-emerald-400" : "text-gray-600"}>[03/03]</span>
                <span className={progressStep === 3 ? "text-white animate-pulse" : "text-gray-500"}>
                  FUSING MULTIMODAL SENTIMENT METRICS...
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-950/20 border border-rose-900 text-rose-500 p-4 rounded mt-4 text-xxs flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold uppercase block mb-1">SYSTEM PIPELINE ERROR</span>
                <span>{error}</span>
              </div>
            </div>
          )}
        </div>

        {/* Center/Right Column: Multimodal Analysis Panel */}
        <div className="bg-gray-950 border border-gray-900 p-6 rounded-lg lg:col-span-2">
          <h2 className="text-xs uppercase text-gray-500 font-bold mb-4 tracking-widest border-b border-gray-900 pb-2">
            // FUSION MATRIX READOUT
          </h2>

          {analysisResult ? (
            <div className="space-y-6">
              {/* Monospace Transcript Display */}
              <div className="bg-black border-l-4 border-red-600 p-5 rounded font-mono text-base italic leading-relaxed text-white">
                "{analysisResult.transcript.text}"
              </div>

              {/* Stress metric progress bars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-black border border-gray-900 p-4 rounded">
                  <div className="text-xxs text-gray-500 uppercase">COMBINED STRESS INDEX</div>
                  <div className="text-3xl font-extrabold text-white">
                    {Math.round(analysisResult.emotion_analysis.stress)}%
                  </div>
                  <div className="w-full bg-gray-900 h-1.5 rounded overflow-hidden mt-2">
                    <div 
                      className="bg-red-500 h-full transition-all duration-300"
                      style={{ width: `${analysisResult.emotion_analysis.stress}%` }}
                    />
                  </div>
                </div>

                <div className="bg-black border border-gray-900 p-4 rounded">
                  <div className="text-xxs text-gray-500 uppercase">FATIGUE INDEX</div>
                  <div className="text-3xl font-extrabold text-white">
                    {Math.round(analysisResult.emotion_analysis.fatigue)}%
                  </div>
                  <div className="w-full bg-gray-900 h-1.5 rounded overflow-hidden mt-2">
                    <div 
                      className="bg-amber-500 h-full transition-all duration-300"
                      style={{ width: `${analysisResult.emotion_analysis.fatigue}%` }}
                    />
                  </div>
                </div>

                <div className="bg-black border border-gray-900 p-4 rounded">
                  <div className="text-xxs text-gray-500 uppercase">VOICE URGENCY</div>
                  <div className="text-3xl font-extrabold text-white">
                    {Math.round(analysisResult.emotion_analysis.urgency)}%
                  </div>
                  <div className="w-full bg-gray-900 h-1.5 rounded overflow-hidden mt-2">
                    <div 
                      className="bg-blue-400 h-full transition-all duration-300"
                      style={{ width: `${analysisResult.emotion_analysis.urgency}%` }}
                    />
                  </div>
                </div>

                <div className="bg-black border border-gray-900 p-4 rounded">
                  <div className="text-xxs text-gray-500 uppercase">ASR TRANSCRIPT CONFIDENCE</div>
                  <div className="text-3xl font-extrabold text-white">
                    {Math.round(analysisResult.transcript.confidence * 100)}%
                  </div>
                  <div className="w-full bg-gray-900 h-1.5 rounded overflow-hidden mt-2">
                    <div 
                      className="bg-emerald-400 h-full transition-all duration-300"
                      style={{ width: `${analysisResult.transcript.confidence * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Classification matrices */}
              <div className="border border-gray-900 p-4 rounded bg-black/30 space-y-3">
                <div className="text-xxs text-gray-500 uppercase tracking-widest">ACOUSTIC & TEXT MATRIX</div>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="flex justify-between border-b border-gray-900 pb-1.5">
                    <span className="text-gray-500">VOICE EMOTION:</span>
                    <span className="text-white font-bold uppercase">{analysisResult.emotion_analysis.audio_emotion}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-900 pb-1.5">
                    <span className="text-gray-500">TEXT EMOTION:</span>
                    <span className="text-white font-bold uppercase">{analysisResult.emotion_analysis.text_emotion}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">CLASSIFICATION:</span>
                    <span className="text-red-500 font-extrabold">{analysisResult.emotion_analysis.final_state}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">VOICE STRESS SCORE:</span>
                    <span className="text-white">{Math.round(analysisResult.emotion_analysis.combined_stress_score * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-gray-600 border border-dashed border-gray-900 rounded">
              <Radio size={32} className="mb-2 text-gray-700 animate-pulse" />
              <span>TRANSMIT DRIVER AUDIO WAVE PACKET TO VIEW SENTIMENT READOUTS</span>
            </div>
          )}
        </div>

        {/* Bottom Historical Timeline Feed */}
        <div className="bg-gray-950 border border-gray-900 p-6 rounded-lg lg:col-span-3">
          <div className="flex justify-between items-center border-b border-gray-900 pb-3 mb-4">
            <h2 className="text-xs uppercase text-gray-500 font-bold tracking-widest">
              // SESSION TRANSMISSIONS LOG
            </h2>
            <button 
              onClick={fetchTimelineFeed}
              className="text-xs text-gray-500 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} /> SYNC TIMELINE FEED
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {timelineFeed.length === 0 ? (
              <div className="text-center text-gray-600 py-6 text-xs">NO HISTORICAL AUDIO PACKETS FOUND IN DATABASE.</div>
            ) : (
              timelineFeed.map((clip, idx) => (
                <div 
                  key={idx}
                  onClick={() => setAnalysisResult({
                    transcript: { text: clip.text, confidence: 0.95 },
                    emotion_analysis: {
                      stress: clip.combined_stress_score * 100,
                      fatigue: clip.audio_emotion === 'sad' ? 60 : 15,
                      urgency: clip.audio_emotion === 'stressed' ? 70 : 10,
                      audio_emotion: clip.audio_emotion,
                      text_emotion: clip.text_emotion,
                      final_state: clip.driver_state,
                      combined_stress_score: clip.combined_stress_score
                    }
                  })}
                  className="bg-black hover:bg-gray-900 border border-gray-900 hover:border-red-600 p-3 rounded flex items-center justify-between transition cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-xxs text-red-500 font-bold">LAP {clip.lap}</span>
                    <span className="text-xs text-gray-300 truncate max-w-lg">"{clip.text || "Voice Clip Ingested"}"</span>
                  </div>
                  <div className="flex items-center gap-4 text-xxs font-bold">
                    <span className={`px-2 py-0.5 rounded ${clip.driver_state === 'STRESSED' ? 'bg-red-950 text-red-400 border border-red-900' : 'bg-gray-900 text-gray-400'}`}>
                      {clip.driver_state}
                    </span>
                    <ChevronRight size={12} className="text-gray-500" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    );
  }
  ```

---

### Task 4: Documentation Update

**Files:**
- Modify: `docs/PROJECT_STATE.md`

- [ ] **Step 1: Document built features and Phase 5 specs**
  Append to the bottom of the project state documentation:
  - **What's Built in Phase 4**: Summarize UI implementation details, components, layout wrappers, error fallback boxes, and CSV + audio upload capabilities.
  - **Phase 5 Requirements**: Define what the remaining screens (Performance, Insights) need from the backend endpoints (`GET /api/session/{id}/insights`, lap deltas, baseline timings, sector degradation profiles).

- [ ] **Step 2: Commit documentation**
  ```bash
  git add docs/PROJECT_STATE.md
  git commit -m "docs: append Phase 4 progress and Phase 5 design specifications"
  ```
