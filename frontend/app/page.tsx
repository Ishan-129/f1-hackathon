'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Radio, Activity, Cpu } from 'lucide-react';
import { useSession } from './context/SessionContext';

interface SessionResponse {
  id: number;
  name: string;
  created_at: string;
  laps_count: number;
}

export default function Home() {
  const router = useRouter();
  const { setSessionId, setSessionName, setConnected, triggerRefresh } = useSession();
  const [status, setStatus] = useState<string>('CONNECTING TO PITPULSE TELEMETRY BUS...');
  const [connected, setConnectedLocal] = useState<boolean>(false);
  const [data, setData] = useState<SessionResponse | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/session/1');
        if (!res.ok) throw new Error('API down');
        const json: SessionResponse = await res.json();
        setStatus('TELEMETRY BUS SYNCHRONIZED');
        setConnectedLocal(true);
        setData(json);
      } catch (err) {
        setStatus('OFFLINE - START BACKEND DEV SERVER (PORT 8000)');
        setConnectedLocal(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadDemo = async () => {
    setLoadingDemo(true);
    try {
      const res = await fetch("http://localhost:8000/api/session/demo", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSessionId(data.id);
      setSessionName(data.name);
      setConnected(true);
      triggerRefresh();
      router.push('/dashboard');
    } catch {
      alert("Failed to load demo session. Is the backend server running?");
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-black text-white font-mono">
      <div className="z-10 max-w-4xl w-full flex flex-col gap-8 items-center">
        
        {/* Branding header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center items-center gap-2 text-red-600 font-bold tracking-widest text-xs">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span>{connected ? "LINK ONLINE" : "LINK OFFLINE"}</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter italic uppercase">
            PIT<span className="text-red-600">PULSE</span>
          </h1>
          <p className="text-xs text-gray-500 uppercase tracking-widest">
            F1 Driver Acoustic Sentiment &amp; Telemetry Correlation
          </p>
        </div>

        {/* One-click Demo Button */}
        <button
          onClick={loadDemo}
          disabled={loadingDemo}
          className="w-full max-w-md bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 disabled:from-gray-800 disabled:to-gray-700 text-white font-black py-4 px-8 rounded-lg tracking-wider transition-all uppercase cursor-pointer text-sm border border-red-500/30 shadow-[0_0_30px_rgba(225,6,0,0.15)] hover:shadow-[0_0_40px_rgba(225,6,0,0.25)] flex items-center justify-center gap-3"
        >
          {loadingDemo && <span className="loading-spinner loading-spinner-sm" />}
          {loadingDemo ? "LOADING DEMO SESSION..." : "▶ LOAD DEMO SESSION — ONE CLICK START"}
        </button>

        {/* Portal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
          <Link 
            href="/dashboard" 
            className="group bg-gray-950 border border-gray-900 hover:border-red-600 p-6 rounded-lg flex flex-col justify-between transition-all hover:scale-102"
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <LayoutDashboard className="text-gray-400 group-hover:text-red-500 transition-colors" size={28} />
                <span className="text-[10px] text-gray-600 group-hover:text-red-500 font-bold">// LINK 01</span>
              </div>
              <h2 className="text-lg font-bold uppercase tracking-wider text-white mb-2">
                RACE OVERVIEW HUD
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                Real-time driver biometrics, lap times correlation, baseline delta mappings, and Recharts degradation line graphs.
              </p>
            </div>
            <div className="mt-6 text-xxs text-red-600 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
              LAUNCH SCREEN &gt;&gt;
            </div>
          </Link>

          <Link 
            href="/radio-analyzer" 
            className="group bg-gray-950 border border-gray-900 hover:border-red-600 p-6 rounded-lg flex flex-col justify-between transition-all hover:scale-102"
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <Radio className="text-gray-400 group-hover:text-red-500 transition-colors" size={28} />
                <span className="text-[10px] text-gray-600 group-hover:text-red-500 font-bold">// LINK 02</span>
              </div>
              <h2 className="text-lg font-bold uppercase tracking-wider text-white mb-2">
                RADIO ANALYZER
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                Ingest voice packets, run Speech-to-Text Whisper transcription, and compute Multimodal Acoustic/Text sentiment fusion.
              </p>
            </div>
            <div className="mt-6 text-xxs text-red-600 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
              LAUNCH SCREEN &gt;&gt;
            </div>
          </Link>

          <Link 
            href="/performance" 
            className="group bg-gray-950 border border-gray-900 hover:border-red-600 p-6 rounded-lg flex flex-col justify-between transition-all hover:scale-102"
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <Activity className="text-gray-400 group-hover:text-red-500 transition-colors" size={28} />
                <span className="text-[10px] text-gray-600 group-hover:text-red-500 font-bold">// LINK 03</span>
              </div>
              <h2 className="text-lg font-bold uppercase tracking-wider text-white mb-2">
                PERFORMANCE ANALYSIS
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                Lap time and driver stress overlays, sector degradation trends, and baseline deviation tracking.
              </p>
            </div>
            <div className="mt-6 text-xxs text-red-600 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
              LAUNCH SCREEN &gt;&gt;
            </div>
          </Link>

          <Link 
            href="/insights" 
            className="group bg-gray-950 border border-gray-900 hover:border-red-600 p-6 rounded-lg flex flex-col justify-between transition-all hover:scale-102"
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <Cpu className="text-gray-400 group-hover:text-red-500 transition-colors" size={28} />
                <span className="text-[10px] text-gray-600 group-hover:text-red-500 font-bold">// LINK 04</span>
              </div>
              <h2 className="text-lg font-bold uppercase tracking-wider text-white mb-2">
                ENGINEER INSIGHTS
              </h2>
              <p className="text-xs text-gray-400 leading-relaxed">
                AI Race Engineer alerts, performance impact analysis, hedged cause identification, and actionable pit strategy.
              </p>
            </div>
            <div className="mt-6 text-xxs text-red-600 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
              LAUNCH SCREEN &gt;&gt;
            </div>
          </Link>
        </div>

        {/* Status display */}
        <div className="p-4 bg-gray-950 border border-gray-900 rounded-lg w-full max-w-2xl text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{status}</p>
          {connected && data && (
            <div className="mt-3 text-xxs text-gray-500">
              ACTIVE SESSION ID: <span className="text-white font-bold">{data.id}</span> | 
              NAME: <span className="text-white font-bold ml-1">{data.name.toUpperCase()}</span> | 
              LAPS RECORDED: <span className="text-white font-bold ml-1">{data.laps_count}</span>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}

