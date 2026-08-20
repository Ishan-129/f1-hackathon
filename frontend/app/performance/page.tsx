'use client';

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ComposedChart, ReferenceLine, Legend } from "recharts";
import { AlertTriangle, RefreshCw, Activity, Layers, HelpCircle } from "lucide-react";
import { useSession } from "../context/SessionContext";

interface TimelineEntry {
  lap: number;
  lap_time: number;
  driver_state: string;
  stress_score: number;
  performance_delta: number | null;
  text?: string | null;
  audio_emotion?: string | null;
  text_emotion?: string | null;
  sector_1?: number | null;
  sector_2?: number | null;
  sector_3?: number | null;
}

export default function PerformancePage() {
  const { sessionId, refreshTrigger } = useSession();
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // 1. Identify Stress Event Lap
  const stressIdx = timeline.findIndex(t => t.driver_state === 'STRESSED' || t.driver_state === 'TIRED');
  const stressEntry = stressIdx !== -1 ? timeline[stressIdx] : null;
  const stressLap = stressEntry ? stressEntry.lap : null;

  // 2. Perform Baseline & Post-Stress Calculations
  let baselineLapTime: number | null = null;
  let postStressLapTime: number | null = null;
  let s1Baseline: number | null = null;
  let s1Post: number | null = null;
  let s2Baseline: number | null = null;
  let s2Post: number | null = null;
  let s3Baseline: number | null = null;
  let s3Post: number | null = null;

  if (stressIdx !== -1) {
    // Baseline: up to 3 calm laps prior to the stress event
    const calmBefore = timeline.slice(0, stressIdx).filter(t => t.driver_state === 'CALM');
    const baselineLaps = calmBefore.slice(-3);
    if (baselineLaps.length > 0) {
      baselineLapTime = baselineLaps.reduce((sum, t) => sum + t.lap_time, 0) / baselineLaps.length;
      s1Baseline = baselineLaps.reduce((sum, t) => sum + (t.sector_1 || 0), 0) / baselineLaps.length;
      s2Baseline = baselineLaps.reduce((sum, t) => sum + (t.sector_2 || 0), 0) / baselineLaps.length;
      s3Baseline = baselineLaps.reduce((sum, t) => sum + (t.sector_3 || 0), 0) / baselineLaps.length;
    }

    // Post-stress: next 2 laps immediately following the stress event lap
    const postLaps = timeline.slice(stressIdx + 1, stressIdx + 3);
    if (postLaps.length > 0) {
      postStressLapTime = postLaps.reduce((sum, t) => sum + t.lap_time, 0) / postLaps.length;
      s1Post = postLaps.reduce((sum, t) => sum + (t.sector_1 || 0), 0) / postLaps.length;
      s2Post = postLaps.reduce((sum, t) => sum + (t.sector_2 || 0), 0) / postLaps.length;
      s3Post = postLaps.reduce((sum, t) => sum + (t.sector_3 || 0), 0) / postLaps.length;
    }
  }

  // Compute percentage deltas
  const getPercentDelta = (post: number | null, base: number | null) => {
    if (post === null || base === null || base === 0) return null;
    return ((post - base) / base) * 100;
  };

  const lapDelta = getPercentDelta(postStressLapTime, baselineLapTime);
  const s1Delta = getPercentDelta(s1Post, s1Baseline);
  const s2Delta = getPercentDelta(s2Post, s2Baseline);
  const s3Delta = getPercentDelta(s3Post, s3Baseline);

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Title block */}
      <div className="flex justify-between items-center border-b border-gray-900 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-white uppercase flex items-center gap-2" id="performance-title">
            <Activity className="text-red-600 animate-pulse" size={20} />
            PERFORMANCE ANALYSIS HUD
          </h1>
          <p className="text-xs text-gray-500 uppercase mt-1">
            DRIVER STRESS VS LAP TIME TELEMETRY & SECTOR DEGRADATION CORRELATION
          </p>
        </div>
        <button 
          onClick={fetchAnalysis}
          className="bg-gray-950 border border-gray-800 hover:border-red-600 px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw size={12} /> REFRESH TELEMETRY
        </button>
      </div>

      {loading ? (
        <div className="h-96 bg-gray-950 border border-gray-900 rounded-lg flex flex-col items-center justify-center text-gray-500 gap-3">
          <span className="loading-spinner loading-spinner-lg" />
          SYNCHRONIZING TELEMETRY STREAM...
        </div>
      ) : error ? (
        <div className="h-96 bg-gray-950 border border-gray-900 rounded-lg flex flex-col items-center justify-center text-rose-500">
          <AlertTriangle className="mb-2 text-red-600 animate-pulse-telemetry" size={40} />
          <span>{error}</span>
        </div>
      ) : timeline.length === 0 ? (
        <div className="h-96 bg-gray-950 border border-gray-900 rounded-lg flex flex-col items-center justify-center text-gray-500 text-center gap-4">
          <span>NO TELEMETRY DATA RECORDED FOR THIS SESSION</span>
          <p className="text-xs text-gray-600 max-w-md">
            Please ingest a telemetry log CSV file in the main dashboard or upload an audio radio file in the Radio Analyzer to establish a timeline.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Sector Delta Summary Cards */}
          <div className="bg-gray-950 border border-gray-900 p-6 rounded-lg lg:col-span-1 flex flex-col justify-between">
            <div className="space-y-6">
              <h2 className="text-xs uppercase text-gray-400 font-bold border-b border-gray-900 pb-2 tracking-widest flex items-center gap-1">
                <Layers size={14} className="text-red-500" />
                // EVENT DEGRADATION REPORT
              </h2>

              {stressLap ? (
                <div className="space-y-4">
                  {/* Event summary badge */}
                  <div className="bg-red-950/20 border border-red-900/60 p-4 rounded" id="stress-event-box">
                    <div className="text-[10px] text-red-400 font-bold uppercase mb-1">STRESS THRESHOLD TRIGGERED</div>
                    <div className="text-sm font-bold text-white">
                      Lap {stressLap}: Driver classified as <span className="text-red-500 animate-pulse-telemetry font-black">{stressEntry?.driver_state}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                      Radio transcript: <span className="text-gray-300 italic">"{stressEntry?.text || 'Telemetry spikes detected'}"</span>
                    </div>
                  </div>

                  {/* Lap delta summary */}
                  <div className="bg-black border border-gray-900 p-4 rounded flex justify-between items-center">
                    <div>
                      <div className="text-[10px] text-gray-500 uppercase">CALM BASELINE AVG</div>
                      <div className="text-xl font-extrabold text-white">
                        {baselineLapTime ? `${baselineLapTime.toFixed(3)}s` : "N/A"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-500 uppercase">POST-STRESS AVG</div>
                      <div className="text-xl font-extrabold text-red-500">
                        {postStressLapTime ? `${postStressLapTime.toFixed(3)}s` : "N/A"}
                      </div>
                    </div>
                  </div>

                  {/* Sector breakdown */}
                  <div className="space-y-3 pt-2">
                    <div className="text-xxs text-gray-500 uppercase tracking-wider font-bold">SECTOR BREAKDOWN DEGRADATION</div>
                    
                    {/* Sector 1 */}
                    <div className="flex justify-between items-center bg-black border border-gray-900/40 p-2.5 rounded">
                      <div>
                        <span className="text-xs font-bold text-gray-400">SECTOR 1</span>
                        <span className="text-xxs text-gray-600 block">Straight line speed / acceleration</span>
                      </div>
                      <div className={`text-sm font-bold ${s1Delta && s1Delta > 0 ? 'text-red-500' : 'text-emerald-400'}`} id="sector1-delta">
                        {s1Delta !== null ? `${s1Delta > 0 ? '+' : ''}${s1Delta.toFixed(2)}%` : "N/A"}
                      </div>
                    </div>

                    {/* Sector 2 */}
                    <div className="flex justify-between items-center bg-black border border-gray-900/40 p-2.5 rounded">
                      <div>
                        <span className="text-xs font-bold text-gray-400">SECTOR 2</span>
                        <span className="text-xxs text-gray-600 block">Medium / high-speed corners</span>
                      </div>
                      <div className={`text-sm font-bold ${s2Delta && s2Delta > 0 ? 'text-red-500' : 'text-emerald-400'}`} id="sector2-delta">
                        {s2Delta !== null ? `${s2Delta > 0 ? '+' : ''}${s2Delta.toFixed(2)}%` : "N/A"}
                      </div>
                    </div>

                    {/* Sector 3 */}
                    <div className="flex justify-between items-center bg-black border border-gray-900/40 p-2.5 rounded">
                      <div>
                        <span className="text-xs font-bold text-gray-400">SECTOR 3</span>
                        <span className="text-xxs text-gray-600 block">Slow chicanes / traction phase</span>
                      </div>
                      <div className={`text-sm font-bold ${s3Delta && s3Delta > 0 ? 'text-red-500' : 'text-emerald-400'}`} id="sector3-delta">
                        {s3Delta !== null ? `${s3Delta > 0 ? '+' : ''}${s3Delta.toFixed(2)}%` : "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-black/50 border border-gray-900 p-6 rounded text-center py-12 space-y-3">
                  <HelpCircle className="mx-auto text-gray-600" size={32} />
                  <div className="text-xs text-gray-400 font-bold uppercase">NO STRESS THRESHOLD TRIGGERED</div>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    The driver sentiment has not crossed the 50% combined stress threshold. Baseline degradation metrics will populate once a STRESSED or TIRED radio clip is ingested.
                  </p>
                </div>
              )}
            </div>

            <div className="text-[10px] text-gray-600 mt-6 leading-relaxed border-t border-gray-900 pt-4">
              TELEMETRY ENGINE: Baseline is computed from the last 3 CALM laps preceding the stress event. Post-stress metrics represent the average of the subsequent 2 laps.
            </div>
          </div>

          {/* Right Columns: Charts & Visual overlays */}
          <div className="lg:col-span-2 space-y-6">

            {/* Combined Overlay Chart */}
            <div className="bg-gray-950 border border-gray-900 p-6 rounded-lg">
              <div className="flex justify-between items-center border-b border-gray-900 pb-2 mb-4">
                <h3 className="text-xs uppercase text-gray-400 font-bold tracking-widest">
                  // OVERLAY CORRELATION GRAPH
                </h3>
                <span className="text-[10px] text-gray-500 font-bold uppercase">// LAP TIME & BIOMETRIC STRESS</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={timeline} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="lap" stroke="#9ca3af" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis yAxisId="left" stroke="#ffffff" tick={{ fontSize: 10, fontFamily: 'monospace' }} domain={['dataMin - 0.5', 'dataMax + 0.5']} label={{ value: 'LAP TIME (S)', angle: -90, position: 'insideLeft', offset: 10, stroke: '#ffffff', fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#ef4444" tick={{ fontSize: 10, fontFamily: 'monospace' }} domain={[0, 1]} label={{ value: 'STRESS LEVEL (0-1.0)', angle: 90, position: 'insideRight', offset: 10, stroke: '#ef4444', fontSize: 10 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#0b0c10", borderColor: "#1f2937", fontFamily: 'monospace', color: '#fff', fontSize: 11 }}
                      labelFormatter={(label) => `Lap: ${label}`}
                    />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                    {stressLap && (
                      <ReferenceLine yAxisId="left" x={stressLap} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: `LAP ${stressLap} STRESS TRIGGER`, fill: '#ef4444', fontSize: 9, position: 'top' }} />
                    )}
                    <Area yAxisId="right" type="monotone" dataKey="stress_score" fill="#ef4444" stroke="#ef4444" fillOpacity={0.15} name="Driver Stress" />
                    <Line yAxisId="left" type="monotone" dataKey="lap_time" stroke="#ffffff" strokeWidth={2.5} activeDot={{ r: 6 }} name="Lap Time (Seconds)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Sector Breakdown Chart */}
            <div className="bg-gray-950 border border-gray-900 p-6 rounded-lg">
              <div className="flex justify-between items-center border-b border-gray-900 pb-2 mb-4">
                <h3 className="text-xs uppercase text-gray-400 font-bold tracking-widest">
                  // SECTOR BREAKDOWN TIMES
                </h3>
                <span className="text-[10px] text-gray-500 font-bold uppercase">// TRACK SECTOR S1, S2, S3 TRENDS</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="lap" stroke="#9ca3af" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 10, fontFamily: 'monospace' }} domain={['dataMin - 0.2', 'dataMax + 0.2']} label={{ value: 'SECTOR TIME (S)', angle: -90, position: 'insideLeft', offset: 10, stroke: '#9ca3af', fontSize: 10 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#0b0c10", borderColor: "#1f2937", fontFamily: 'monospace', color: '#fff', fontSize: 11 }}
                      labelFormatter={(label) => `Lap: ${label}`}
                    />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                    {stressLap && (
                      <ReferenceLine x={stressLap} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" />
                    )}
                    <Line type="monotone" dataKey="sector_1" stroke="#38bdf8" strokeWidth={2} name="Sector 1" />
                    <Line type="monotone" dataKey="sector_2" stroke="#fb923c" strokeWidth={2} name="Sector 2" />
                    <Line type="monotone" dataKey="sector_3" stroke="#f472b6" strokeWidth={2} name="Sector 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Bottom Table: Raw Data Grid */}
          <div className="bg-gray-950 border border-gray-900 p-6 rounded-lg lg:col-span-3">
            <h2 className="text-xs uppercase text-gray-400 font-bold border-b border-gray-900 pb-3 mb-4 tracking-widest">
              // TELEMETRY LOGS GRID
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-400">
                <thead className="bg-black text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-900">
                  <tr>
                    <th className="p-3">LAP</th>
                    <th className="p-3">LAP TIME</th>
                    <th className="p-3">SECTOR 1</th>
                    <th className="p-3">SECTOR 2</th>
                    <th className="p-3">SECTOR 3</th>
                    <th className="p-3">DRIVER STATE</th>
                    <th className="p-3">STRESS INDEX</th>
                    <th className="p-3 text-right">DELTA VS BASELINE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900" id="telemetry-table-body">
                  {timeline.map((entry, idx) => (
                    <tr 
                      key={idx} 
                      className={`hover:bg-gray-900/40 transition-colors ${entry.lap === stressLap ? 'bg-red-950/10 border-l-2 border-l-red-600' : ''}`}
                    >
                      <td className="p-3 font-bold text-white">{entry.lap}</td>
                      <td className="p-3 text-white font-bold">{entry.lap_time.toFixed(3)}s</td>
                      <td className="p-3">{entry.sector_1 ? `${entry.sector_1.toFixed(3)}s` : "N/A"}</td>
                      <td className="p-3">{entry.sector_2 ? `${entry.sector_2.toFixed(3)}s` : "N/A"}</td>
                      <td className="p-3">{entry.sector_3 ? `${entry.sector_3.toFixed(3)}s` : "N/A"}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          entry.driver_state === 'STRESSED' ? 'bg-red-950 text-red-400 border border-red-900 animate-pulse' :
                          entry.driver_state === 'TIRED' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                          'bg-emerald-950 text-emerald-400 border border-emerald-900'
                        }`}>
                          {entry.driver_state}
                        </span>
                      </td>
                      <td className="p-3 font-bold">{Math.round(entry.stress_score * 100)}%</td>
                      <td className={`p-3 text-right font-bold ${entry.performance_delta && entry.performance_delta > 0 ? 'text-red-500' : 'text-emerald-400'}`}>
                        {entry.performance_delta !== null
                          ? `${entry.performance_delta > 0 ? '+' : ''}${entry.performance_delta.toFixed(2)}%`
                          : "N/A"
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
