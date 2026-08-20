'use client';

import { useEffect, useState, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart } from "recharts";
import { Upload, AlertTriangle, RefreshCw } from "lucide-react";
import { useSession } from "../context/SessionContext";

interface TimelineEntry {
  lap: number;
  lap_time: number;
  driver_state: string;
  stress_score: number;
  performance_delta: number | null;
}

export default function DashboardPage() {
  const { sessionId, refreshTrigger, triggerRefresh } = useSession();
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch live session analysis
  const fetchAnalysis = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/session/${sessionId}/analysis`);
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
    setLoading(true);
    fetchAnalysis();
  }, [sessionId, refreshTrigger]);

  // Telemetry CSV Upload Handler
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvUploading(true);
    const formData = new FormData();
    formData.append("session_id", String(sessionId));
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

      triggerRefresh();
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
            <div className="text-xs font-bold uppercase tracking-widest opacity-85">STATUS</div>
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

        <div className="text-[10px] text-gray-600 mt-6 leading-relaxed">
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
              <div className="text-[10px] text-gray-500 uppercase">CURRENT LAP TIME</div>
              <div className="text-2xl font-extrabold text-white">
                {latestEntry ? `${latestEntry.lap_time.toFixed(3)}s` : "N/A"}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">LAP: {latestEntry?.lap || "N/A"}</div>
            </div>

            <div className="bg-black border border-gray-900 p-4 rounded">
              <div className="text-[10px] text-gray-500 uppercase">PERF DELTA</div>
              <div className={`text-2xl font-extrabold ${latestEntry?.performance_delta && latestEntry.performance_delta > 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                {latestEntry?.performance_delta !== null && latestEntry?.performance_delta !== undefined
                  ? `${latestEntry.performance_delta > 0 ? '+' : ''}${latestEntry.performance_delta.toFixed(2)}%`
                  : "N/A"
                }
              </div>
              <div className="text-[10px] text-gray-500 mt-1">VS CALM BASELINE</div>
            </div>
          </div>

          {/* Ingestion Panel */}
          <div className="border border-dashed border-gray-800 p-6 rounded text-center bg-black/50">
            <Upload className="mx-auto mb-3 text-gray-600" size={24} />
            <div className="text-xs text-gray-300 font-bold mb-1">INGEST TELEMETRY DATA PACKET</div>
            <p className="text-[10px] text-gray-500 mb-4">Upload lap_times.csv telemetry logs</p>
            
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
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-800 text-white text-xs font-bold py-2 px-4 rounded tracking-wider transition uppercase cursor-pointer flex items-center gap-2 mx-auto"
            >
              {csvUploading && <span className="loading-spinner loading-spinner-sm" />}
              {csvUploading ? "INGESTING..." : "SELECT CSV FILE"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex justify-between items-center">
          <button 
            onClick={fetchAnalysis}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            {loading ? <span className="loading-spinner loading-spinner-sm" /> : <RefreshCw size={12} />} REFRESH HUD DATA
          </button>
        </div>
      </div>

      {/* Right Column: Recharts Core Correlation Chart */}
      <div className="bg-gray-950 border border-gray-900 p-6 rounded-lg lg:col-span-3">
        <h2 className="text-xs uppercase text-gray-500 font-bold mb-4 tracking-widest border-b border-gray-900 pb-2">
          // CORRELATION MAP: LAP TIME VS DRIVER STRESS
        </h2>

        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-500 gap-3">
            <span className="loading-spinner loading-spinner-lg" />
            <span>CONNECTING TELEMETRY BUS...</span>
          </div>
        ) : error ? (
          <div className="h-64 flex flex-col items-center justify-center text-rose-500">
            <AlertTriangle className="mb-2" size={32} />
            <span>{error}</span>
          </div>
        ) : timeline.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-500 text-center gap-4">
            <span>NO TELEMETRY RECORDED FOR CURRENT SESSION.</span>
            <span className="text-xs text-gray-600">PLEASE INGEST TELEMETRY DATA PACKET (CSV).</span>
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
