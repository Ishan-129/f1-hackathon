'use client';

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Cpu, Brain, Activity, ShieldAlert } from "lucide-react";
import { useSession } from "../context/SessionContext";

interface InsightDetail {
  id: number;
  category: string;
  content: string;
  severity: string;
  timestamp: string;
}

interface TimelineEntry {
  lap: number;
  lap_time: number;
  driver_state: string;
  stress_score: number;
  performance_delta: number | null;
  text?: string | null;
}

export default function InsightsPage() {
  const { sessionId, refreshTrigger } = useSession();
  const [insights, setInsights] = useState<InsightDetail[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsightsAndTimeline = async () => {
    try {
      // Fetch both insights and timeline in parallel
      const [insightsRes, timelineRes] = await Promise.all([
        fetch(`http://localhost:8000/api/session/${sessionId}/insights`),
        fetch(`http://localhost:8000/api/session/${sessionId}/analysis`)
      ]);

      if (!insightsRes.ok || !timelineRes.ok) {
        throw new Error("Failed to load telemetry or insights feed");
      }

      const insightsData = await insightsRes.json();
      const timelineData = await timelineRes.json();

      setInsights(insightsData.insights || []);
      setTimeline(timelineData.timeline || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Connection error to telemetry backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchInsightsAndTimeline();
  }, [sessionId, refreshTrigger]);

  // Helper: Search transcripts for keywords to deduce cause
  const deducePossibleCause = (content: string, category: string): { cause: string; transcriptQuote?: string } => {
    // Find if the insight mentions a specific lap
    const lapMatch = content.match(/Lap (\d+)/i);
    const targetLap = lapMatch ? parseInt(lapMatch[1]) : null;

    // Scan for relevant transcript text
    let matchedText = "";
    if (targetLap !== null) {
      const lapEntry = timeline.find(t => t.lap === targetLap);
      if (lapEntry?.text) {
        matchedText = lapEntry.text.toLowerCase();
      }
    } else {
      // Fallback: check any recent transcript
      const anyTranscript = timeline.find(t => t.text);
      if (anyTranscript?.text) {
        matchedText = anyTranscript.text.toLowerCase();
      }
    }

    const quote = matchedText ? `"${matchedText}"` : undefined;

    // Check keywords in driver complaints
    if (matchedText.includes("tire") || matchedText.includes("grip") || matchedText.includes("gone")) {
      return {
        cause: "Acoustic keywords ('tires', 'grip') suggest potential thermal degradation or excessive tire compound wear.",
        transcriptQuote: quote
      };
    }
    if (matchedText.includes("power") || matchedText.includes("straight") || matchedText.includes("loss") || matchedText.includes("failure")) {
      return {
        cause: "Acoustic keywords ('power', 'failure') suggest potential powertrain, control electronics, or sensor anomalies.",
        transcriptQuote: quote
      };
    }
    if (matchedText.includes("brake") || matchedText.includes("brakes") || matchedText.includes("lock")) {
      return {
        cause: "Acoustic keywords ('brakes') suggest potential friction boundary limits or thermal overload on braking system.",
        transcriptQuote: quote
      };
    }
    if (category === "driver_state" && content.toLowerCase().includes("fatigue")) {
      return {
        cause: "Estimated voice pace deceleration and silent interval ratio spikes suggest potential driver physical fatigue.",
        transcriptQuote: quote
      };
    }

    // Default general hedged cause
    return {
      cause: "Elevated biometric acoustic stress cues detected; direct mechanical cause undetermined.",
      transcriptQuote: quote
    };
  };

  // Helper: Create actionable recommendation
  const deduceRecommendation = (category: string, content: string): string => {
    const text = content.toLowerCase();
    if (category === "performance") {
      if (text.includes("deterioration") || text.includes("slowdown") || text.includes("increase")) {
        return "Initiate strategy shift to Plan B. Prepare pit box for a compounds swap. Monitor tyre temperature telemetry.";
      }
      return "Continue monitoring pace. Prepare engine mappings adjustment if degradation trends persist.";
    }

    if (category === "driver_state") {
      if (text.includes("fatigue")) {
        return "Suggest driver focus on hydration check. Simplify telemetry delta updates via dash screen rather than verbal updates.";
      }
      if (text.includes("stress")) {
        return "Minimize radio traffic. Limit voice communications to essential race-control updates. Provide calming driver prompts.";
      }
    }
    return "Maintain normal race engineering procedures. Monitor driver telemetry baseline.";
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "high":
        return {
          border: "border-red-900/60 bg-red-950/5 hover:border-red-600/80 shadow-[0_0_15px_rgba(225,6,0,0.05)]",
          badge: "bg-red-950 border-red-900 text-red-500 animate-pulse",
          glow: "bg-red-500",
          text: "text-red-500"
        };
      case "medium":
        return {
          border: "border-amber-900/60 bg-amber-950/5 hover:border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.05)]",
          badge: "bg-amber-950 border-amber-900 text-amber-500",
          glow: "bg-amber-500",
          text: "text-amber-500"
        };
      default:
        return {
          border: "border-blue-900/60 bg-blue-950/5 hover:border-blue-500/80 shadow-[0_0_15px_rgba(59,130,246,0.05)]",
          badge: "bg-blue-950 border-blue-900 text-blue-500",
          glow: "bg-blue-500",
          text: "text-blue-500"
        };
    }
  };

  return (
    <div className="space-y-6 font-mono text-sm">
      
      {/* Header banner */}
      <div className="flex justify-between items-center border-b border-gray-900 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-white uppercase flex items-center gap-2" id="insights-title">
            <Cpu className="text-red-600 animate-pulse-telemetry" size={20} />
            AI RACE ENGINEER INSIGHTS
          </h1>
          <p className="text-xs text-gray-500 uppercase mt-1">
            REAL-TIME STRATEGIC INSIGHTS AND DRIVER PSYCHOLOGICAL FEEDBACK DECODE
          </p>
        </div>
        <button 
          onClick={fetchInsightsAndTimeline}
          className="bg-gray-950 border border-gray-800 hover:border-red-600 px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw size={12} /> SYNC INSIGHTS
        </button>
      </div>

      {loading ? (
        <div className="h-96 bg-gray-950 border border-gray-900 rounded-lg flex flex-col items-center justify-center text-gray-500 gap-3">
          <span className="loading-spinner loading-spinner-lg" />
          DECODING RACE ENGINEER FEED...
        </div>
      ) : error ? (
        <div className="h-96 bg-gray-950 border border-gray-900 rounded-lg flex flex-col items-center justify-center text-rose-500">
          <AlertCircle className="mb-2 text-red-600 animate-pulse-telemetry" size={40} />
          <span>{error}</span>
        </div>
      ) : insights.length === 0 ? (
        <div className="h-96 bg-gray-950 border border-gray-900 rounded-lg flex flex-col items-center justify-center text-gray-500 text-center gap-4">
          <Brain className="mx-auto text-gray-700 animate-pulse" size={48} />
          <span>NO INSIGHTS AVAILABLE FOR THIS SESSION</span>
          <p className="text-xs text-gray-600 max-w-md">
            Insights are computed based on correlation between telemetry laps and radio transmissions. Ingest lap csv data and upload radio packet waveforms first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="insights-cards-container">
          {insights.map((insight) => {
            const styles = getSeverityStyles(insight.severity);
            
            // Extract performance impact percentage (e.g., 2.4%)
            const pctMatch = insight.content.match(/(\d+(?:\.\d+)?%)/);
            const performanceImpact = pctMatch ? `${pctMatch[1]} PACE LOSS` : "N/A";

            // Extract lap number
            const lapMatch = insight.content.match(/Lap (\d+)/i);
            const lapText = lapMatch ? ` | LAP ${lapMatch[1]}` : "";
            
            const headline = insight.category === "performance"
              ? `PERFORMANCE DEGRADATION${lapText}`
              : `DRIVER STATE WARNING${lapText}`;

            const { cause, transcriptQuote } = deducePossibleCause(insight.content, insight.category);
            const recommendation = deduceRecommendation(insight.category, insight.content);

            return (
              <div 
                key={insight.id}
                className={`border p-6 rounded-lg transition-all duration-300 flex flex-col justify-between ${styles.border}`}
                id={`insight-card-${insight.id}`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${styles.glow}`} />
                      <h3 className="font-bold tracking-tight text-white uppercase text-sm">
                        {headline}
                      </h3>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-widest border uppercase ${styles.badge}`}>
                      {insight.severity}
                    </span>
                  </div>

                  {/* Raw alert notification content */}
                  <div className="bg-black/60 border border-gray-900 p-4 rounded mb-4 font-mono text-xs text-gray-300 italic relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-1 text-[8px] font-bold text-gray-700 tracking-tighter uppercase select-none">
                      RAW TELEMETRY MSG
                    </div>
                    "{insight.content}"
                  </div>

                  {/* Dynamic parsed statistics block */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-black border border-gray-900 p-3 rounded">
                      <span className="text-[10px] text-gray-500 uppercase block">PERFORMANCE IMPACT</span>
                      <span className={`text-base font-black ${insight.category === 'performance' ? 'text-red-500 animate-pulse-telemetry' : 'text-gray-400'}`}>
                        {performanceImpact}
                      </span>
                    </div>
                    <div className="bg-black border border-gray-900 p-3 rounded">
                      <span className="text-[10px] text-gray-500 uppercase block">ENGINEER TIMING</span>
                      <span className="text-xs font-bold text-white uppercase">
                        {new Date(insight.timestamp).toISOString().substring(11, 19)} UTC
                      </span>
                    </div>
                  </div>

                  {/* Associated vocal complaint */}
                  {transcriptQuote && (
                    <div className="bg-black/30 border-l-2 border-red-600 p-3 rounded mb-4 text-xs font-mono">
                      <span className="text-[9px] text-red-500 font-bold uppercase block mb-1">DRIVERS RADIO TRANSCRIPTION</span>
                      <span className="text-gray-300 italic">{transcriptQuote}</span>
                    </div>
                  )}

                  {/* Hedged Possible Cause */}
                  <div className="bg-black border border-gray-900/50 p-3 rounded mb-4 text-xs">
                    <span className="text-[9px] text-gray-500 font-bold uppercase block mb-1">POSSIBLE CAUSE ANALYSIS (HEDGED)</span>
                    <p className="text-gray-300 leading-relaxed font-sans text-xs">
                      {cause}
                    </p>
                  </div>
                </div>

                {/* Recommendation Engineering Box */}
                <div className="border border-dashed border-gray-800 bg-red-950/5 p-4 rounded mt-2">
                  <div className="flex items-center gap-1.5 text-xxs font-bold text-red-500 uppercase mb-1.5">
                    <ShieldAlert size={12} />
                    AI RACE ENGINEER ACTION DIRECTIVE
                  </div>
                  <p className="text-xs font-bold text-white leading-relaxed">
                    {recommendation}
                  </p>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
