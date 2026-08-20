'use client';

import { useState, useEffect, useRef, useCallback } from "react";
import { Radio, Mic, MicOff, AlertCircle, ChevronRight, RefreshCw } from "lucide-react";
import { useSession } from "../context/SessionContext";

interface PastRadioClip {
  lap: number;
  lap_time: number;
  driver_state: string;
  stress_score: number;
  performance_delta: number | null;
  text?: string;
  audio_emotion?: string;
  text_emotion?: string;
}

export default function RadioAnalyzerPage() {
  const { sessionId, refreshTrigger, triggerRefresh } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [lapNumber, setLapNumber] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [progressStep, setProgressStep] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [timelineFeed, setTimelineFeed] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loadingFeed, setLoadingFeed] = useState(false);

  // ── Live Mic Recording State ──
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Toggle microphone recording on/off
  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      // ── Stop recording ──
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordingDuration(0);
      return;
    }

    // ── Start recording ──
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Choose a supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Release mic tracks
        stream.getTracks().forEach(track => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'wav';
        const recordedFile = new File(
          [audioBlob],
          `live_recording_${Date.now()}.${ext}`,
          { type: mimeType }
        );

        setFile(recordedFile);
        audioChunksRef.current = [];
      };

      mediaRecorder.start(250); // collect data in 250ms chunks
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setError(null);

      // Tick the duration counter every second
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      setError("MICROPHONE ACCESS DENIED — Check browser permissions.");
    }
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Fetch previous radio transmissions for session
  const fetchTimelineFeed = async () => {
    setLoadingFeed(true);
    try {
      const res = await fetch(`http://localhost:8000/api/session/${sessionId}/analysis`);
      if (res.ok) {
        const data = await res.json();
        setTimelineFeed(data.timeline || []);
      }
    } catch (err) {
      console.error("Failed to load historical timeline feed", err);
    } finally {
      setLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchTimelineFeed();
  }, [sessionId, refreshTrigger]);

  // Form submission for Audio Upload + Analysis
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setAnalysisResult(null);
    setProgressStep(1); // Uploading...

    const formData = new FormData();
    formData.append("session_id", String(sessionId));
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
      
      triggerRefresh();
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

          {/* Dual Input: File Upload + Live Recording */}
          <div className="grid grid-cols-2 gap-3">
            {/* File Upload Zone */}
            <div 
              onClick={() => !isRecording && fileInputRef.current?.click()}
              className={`border border-dashed border-gray-800 bg-black/40 hover:bg-black/80 transition p-6 text-center rounded cursor-pointer ${isRecording ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <Mic className="mx-auto mb-2 text-gray-500" size={28} />
              <div className="text-[10px] font-bold text-gray-300 truncate">
                {file && !isRecording ? file.name : "LOAD FILE"}
              </div>
              <p className="text-[9px] text-gray-600 mt-1">WAV / MP3 / WEBM</p>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept="audio/*"
                className="hidden" 
              />
            </div>

            {/* Live Mic Recording Button */}
            <div
              onClick={!uploading ? toggleRecording : undefined}
              className={`border border-dashed rounded p-6 text-center cursor-pointer transition relative overflow-hidden ${
                isRecording
                  ? 'border-red-600 bg-red-950/30 hover:bg-red-950/50'
                  : 'border-gray-800 bg-black/40 hover:bg-black/80'
              } ${uploading ? 'opacity-40 pointer-events-none' : ''}`}
            >
              {/* Pulsing ring animation when recording */}
              {isRecording && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full border-2 border-red-500 animate-ping opacity-20" />
                </div>
              )}
              <div className="relative z-10">
                {isRecording ? (
                  <MicOff className="mx-auto mb-2 text-red-500" size={28} />
                ) : (
                  <Mic className="mx-auto mb-2 text-red-500" size={28} />
                )}
                <div className={`text-[10px] font-bold ${isRecording ? 'text-red-400' : 'text-gray-300'}`}>
                  {isRecording ? 'STOP RECORDING' : 'RECORD LIVE'}
                </div>
                {isRecording ? (
                  <p className="text-[10px] text-red-400 mt-1 tabular-nums animate-pulse">
                    ● REC {String(Math.floor(recordingDuration / 60)).padStart(2, '0')}:{String(recordingDuration % 60).padStart(2, '0')}
                  </p>
                ) : (
                  <p className="text-[9px] text-gray-600 mt-1">CLICK TO START</p>
                )}
              </div>
            </div>
          </div>

          {/* Lap association input */}
          <div>
            <label className="block text-[10px] text-gray-500 uppercase mb-1">ASSOCIATE WITH LAP NUMBER (OPTIONAL)</label>
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
            disabled={!file || uploading || isRecording}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-800 text-white font-bold py-3 px-4 rounded tracking-wider transition uppercase cursor-pointer"
          >
            {uploading ? "TRANSMITTING..." : "TRANSMIT PACKET"}
          </button>
        </form>

        {/* Loader Log terminal */}
        {uploading && (
          <div className="bg-black border border-gray-900 p-4 rounded mt-4 text-[10px] space-y-1.5 leading-relaxed font-mono">
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
          <div className="bg-rose-950/20 border border-rose-900 text-rose-500 p-4 rounded mt-4 text-[10px] flex items-start gap-2">
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
                <div className="text-[10px] text-gray-500 uppercase">COMBINED STRESS INDEX</div>
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
                <div className="text-[10px] text-gray-500 uppercase">FATIGUE INDEX</div>
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
                <div className="text-[10px] text-gray-500 uppercase">VOICE URGENCY</div>
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
                <div className="text-[10px] text-gray-500 uppercase">ASR TRANSCRIPT CONFIDENCE</div>
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
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">ACOUSTIC & TEXT MATRIX</div>
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
            disabled={loadingFeed}
            className="text-xs text-gray-500 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            {loadingFeed ? <span className="loading-spinner loading-spinner-sm" /> : <RefreshCw size={12} />} SYNC TIMELINE FEED
          </button>
        </div>
 
        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
          {loadingFeed && timelineFeed.length === 0 ? (
            <div className="text-center text-gray-600 py-6 text-xs flex justify-center items-center gap-2">
              <span className="loading-spinner loading-spinner-sm" />
              <span>SYNCING TIMELINE FEED...</span>
            </div>
          ) : timelineFeed.filter(t => t.text).length === 0 ? (
            <div className="text-center text-gray-600 py-6 text-xs">NO HISTORICAL AUDIO PACKETS FOUND IN DATABASE.</div>
          ) : (
            timelineFeed.filter(t => t.text).map((clip, idx) => (
              <div 
                key={idx}
                onClick={() => setAnalysisResult({
                  transcript: { text: clip.text, confidence: 0.95 },
                  emotion_analysis: {
                    stress: clip.stress_score * 100,
                    fatigue: clip.audio_emotion === 'sad' ? 60 : 15,
                    urgency: clip.audio_emotion === 'stressed' ? 70 : 10,
                    audio_emotion: clip.audio_emotion || 'neutral',
                    text_emotion: clip.text_emotion || 'neutral',
                    final_state: clip.driver_state,
                    combined_stress_score: clip.stress_score
                  }
                })}
                className="bg-black hover:bg-gray-900 border border-gray-900 hover:border-red-600 p-3 rounded flex items-center justify-between transition cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-red-500 font-bold">LAP {clip.lap}</span>
                  <span className="text-xs text-gray-300 truncate max-w-lg">"{clip.text || "Voice Clip Ingested"}"</span>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-bold">
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
