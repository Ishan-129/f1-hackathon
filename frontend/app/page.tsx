'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { LayoutDashboard, Radio, Activity, Cpu } from 'lucide-react';

interface SessionResponse {
  id: number;
  name: string;
  created_at: string;
  laps_count: number;
}

export default function Home() {
  const [status, setStatus] = useState<string>('CONNECTING TO PITPULSE TELEMETRY BUS...');
  const [connected, setConnectedLocal] = useState<boolean>(false);
  const [data, setData] = useState<SessionResponse | null>(null);

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

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-0 bg-black text-white font-mono">

      {/* Hero Section with F1 Car */}
      <div className="relative w-full h-[420px] overflow-hidden">
        <Image
          src="/f1-car.jpeg"
          alt="F1 Racing Car"
          fill
          className="object-cover object-center"
          priority
        />
        {/* Dark gradient overlays for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80" />

        {/* Branding on top of hero */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="flex justify-center items-center gap-2 text-red-600 font-bold tracking-widest text-xs mb-3">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span>{connected ? "LINK ONLINE" : "LINK OFFLINE"}</span>
          </div>
          <h1 className="text-6xl md:text-7xl font-black tracking-tighter italic uppercase drop-shadow-[0_0_30px_rgba(225,6,0,0.4)]">
            PIT<span className="text-red-600">PULSE</span>
          </h1>
          <p className="text-xs text-gray-300 uppercase tracking-[0.3em] mt-3">
            F1 Driver Acoustic Sentiment &amp; Telemetry Correlation
          </p>
          {/* Animated red line accent */}
          <div className="w-32 h-0.5 bg-gradient-to-r from-transparent via-red-600 to-transparent mt-4 animate-pulse" />
        </div>
      </div>

      <div className="z-10 max-w-5xl w-full flex flex-col gap-8 items-center px-8 -mt-8">

        {/* Portal Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          <Link 
            href="/dashboard" 
            className="group bg-gray-950/80 backdrop-blur-sm border border-gray-900 hover:border-red-600 p-6 rounded-lg flex flex-col justify-between transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(225,6,0,0.1)]"
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
            className="group bg-gray-950/80 backdrop-blur-sm border border-gray-900 hover:border-red-600 p-6 rounded-lg flex flex-col justify-between transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(225,6,0,0.1)]"
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
            className="group bg-gray-950/80 backdrop-blur-sm border border-gray-900 hover:border-red-600 p-6 rounded-lg flex flex-col justify-between transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(225,6,0,0.1)]"
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
            className="group bg-gray-950/80 backdrop-blur-sm border border-gray-900 hover:border-red-600 p-6 rounded-lg flex flex-col justify-between transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(225,6,0,0.1)]"
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
        <div className="p-4 bg-gray-950/80 backdrop-blur-sm border border-gray-900 rounded-lg w-full text-center mb-8">
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
