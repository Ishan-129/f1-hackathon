'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface SessionContextType {
  sessionId: number;
  sessionName: string;
  connected: boolean;
  refreshTrigger: number;
  setSessionId: (id: number) => void;
  setSessionName: (name: string) => void;
  setConnected: (connected: boolean) => void;
  triggerRefresh: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId, setSessionId] = useState<number>(1);
  const [sessionName, setSessionName] = useState<string>("SYNCING SESSION...");
  const [connected, setConnected] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // Run periodic connection check
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/session/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setSessionName(data.name);
          setConnected(true);
        } else {
          // If the session ID doesn't exist, create it if it's 1
          if (sessionId === 1) {
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
          } else {
            setConnected(false);
            setSessionName("SESSION NOT FOUND");
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
  }, [sessionId, refreshTrigger]);

  return (
    <SessionContext.Provider
      value={{
        sessionId,
        sessionName,
        connected,
        refreshTrigger,
        setSessionId,
        setSessionName,
        setConnected,
        triggerRefresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
