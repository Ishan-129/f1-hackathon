'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, LayoutDashboard, Activity, Cpu } from "lucide-react";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider, useSession } from "./context/SessionContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { sessionId, sessionName, connected, setSessionId, setSessionName, setConnected } = useSession();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [utcTime, setUtcTime] = useState('--:--:--');

  // Live UTC clock
  useEffect(() => {
    const tick = () => setUtcTime(new Date().toISOString().substring(11, 19));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
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
    } catch {
      alert("Failed to load demo session. Is the backend server running?");
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <body className="min-h-full flex flex-col font-sans">
      {/* Latency Top Bar */}
      <div className="bg-black border-b border-gray-900 px-4 py-1.5 flex justify-between items-center text-xs tracking-wider text-gray-400 font-mono select-none">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span>{connected ? "LIVE LINK ACTIVE" : "LINK OFFLINE - CHECK BACKEND"}</span>
        </div>
        <div className="text-red-600 font-bold tracking-tighter">PITPULSE TELEMETRY ENGINE v1.0</div>
        <div>UTC: {utcTime}</div>
      </div>

      {/* Main F1 HUD Navigation */}
      <header className="bg-gray-950 border-b-2 border-red-600 px-6 py-4 flex justify-between items-center shrink-0 select-none">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-xl font-extrabold tracking-tighter italic text-white hover:text-red-500 transition-colors">
            PIT<span className="text-red-600">PULSE</span>
          </Link>
          <div className="hidden md:flex border-l border-gray-800 pl-6 text-sm text-gray-400 font-mono">
            SESSION: <span className="text-white font-bold ml-1">{sessionName.toUpperCase()}</span>
            <span className="mx-3 text-gray-700">|</span>
            DRIVER: <span className="text-white font-bold ml-1">DEMO DRIVER // CAR 01</span>
          </div>
        </div>

        <nav className="flex flex-wrap gap-3 items-center">
          <button onClick={loadDemo} disabled={loadingDemo} className="px-3 py-2 text-xs font-bold tracking-wider rounded border border-amber-700 text-amber-400 hover:bg-amber-950 disabled:opacity-50 cursor-pointer transition-colors flex items-center gap-2">
            {loadingDemo && <span className="loading-spinner loading-spinner-sm" style={{borderTopColor: '#f59e0b'}} />}
            {loadingDemo ? "LOADING DEMO..." : "LOAD DEMO SESSION"}
          </button>
          <Link href="/dashboard" className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold tracking-wider rounded border transition ${pathname === '/dashboard' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-800 text-gray-400 hover:text-white'}`} id="nav-dashboard">
            <LayoutDashboard size={14} />
            DASHBOARD
          </Link>
          <Link href="/radio-analyzer" className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold tracking-wider rounded border transition ${pathname === '/radio-analyzer' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-800 text-gray-400 hover:text-white'}`} id="nav-radio-analyzer">
            <Radio size={14} />
            RADIO ANALYZER
          </Link>
          <Link href="/performance" className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold tracking-wider rounded border transition ${pathname === '/performance' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-800 text-gray-400 hover:text-white'}`} id="nav-performance">
            <Activity size={14} />
            PERFORMANCE
          </Link>
          <Link href="/insights" className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold tracking-wider rounded border transition ${pathname === '/insights' ? 'bg-red-600 border-red-600 text-white' : 'border-gray-800 text-gray-400 hover:text-white'}`} id="nav-insights">
            <Cpu size={14} />
            ENGINEER INSIGHTS
          </Link>
        </nav>
      </header>

      <main className="flex-1 bg-black p-6 overflow-auto">{children}</main>
    </body>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-black text-white antialiased`}
    >
      <SessionProvider>
        <LayoutContent>{children}</LayoutContent>
      </SessionProvider>
    </html>
  );
}
