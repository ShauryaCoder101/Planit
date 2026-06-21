import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from './useApi.jsx';

const TimerContext = createContext(null);

export function TimerProvider({ children }) {
  const api = useApi();
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  const calcElapsed = useCallback((timer) => {
    if (!timer) return 0;
    const start = new Date(timer.startTime).getTime();
    const now = Date.now();
    const pausedMs = timer.totalPausedMs || 0;
    if (timer.pausedAt) {
      const pausedAt = new Date(timer.pausedAt).getTime();
      return Math.floor((pausedAt - start - pausedMs) / 1000);
    }
    return Math.floor((now - start - pausedMs) / 1000);
  }, []);

  const isRunning = useCallback((timer) => {
    return timer && timer.isActive && !timer.pausedAt;
  }, []);

  const isPaused = useCallback((timer) => {
    return timer && timer.isActive && !!timer.pausedAt;
  }, []);

  const enrichTimer = useCallback((timer) => {
    if (!timer) return null;
    return {
      ...timer,
      status: timer.pausedAt ? 'paused' : 'running',
    };
  }, []);

  const startTicking = useCallback((timer) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timer && isRunning(timer)) {
      setElapsed(calcElapsed(timer));
      intervalRef.current = setInterval(() => {
        setElapsed(calcElapsed(timer));
      }, 1000);
    } else if (timer && isPaused(timer)) {
      setElapsed(calcElapsed(timer));
    }
  }, [calcElapsed, isRunning, isPaused]);

  const fetchActive = useCallback(async () => {
    try {
      const data = await api.get('/api/timer/active');
      const session = data?.timerSession || null;
      const enriched = enrichTimer(session);
      setActiveTimer(enriched);
      if (session) startTicking(session);
    } catch {
      setActiveTimer(null);
    }
  }, [api, startTicking, enrichTimer]);

  useEffect(() => {
    fetchActive();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = useCallback(async (dailyTaskId) => {
    const data = await api.post('/api/timer/start', { dailyTaskId });
    const session = data?.timerSession;
    const enriched = enrichTimer(session);
    setActiveTimer(enriched);
    startTicking(session);
    return enriched;
  }, [api, startTicking, enrichTimer]);

  const pauseTimer = useCallback(async () => {
    const data = await api.post('/api/timer/pause', {});
    const session = data?.timerSession;
    const enriched = enrichTimer(session);
    setActiveTimer(enriched);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setElapsed(calcElapsed(session));
    return enriched;
  }, [api, calcElapsed, enrichTimer]);

  const resumeTimer = useCallback(async () => {
    const data = await api.post('/api/timer/resume', {});
    const session = data?.timerSession;
    const enriched = enrichTimer(session);
    setActiveTimer(enriched);
    startTicking(session);
    return enriched;
  }, [api, startTicking, enrichTimer]);

  const finishTimer = useCallback(async () => {
    const data = await api.post('/api/timer/finish', {});
    setActiveTimer(null);
    setElapsed(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    return data;
  }, [api]);

  const formatTime = useCallback((totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, []);

  return (
    <TimerContext.Provider value={{
      activeTimer,
      elapsed,
      formattedTime: formatTime(elapsed),
      startTimer,
      pauseTimer,
      resumeTimer,
      finishTimer,
      refreshTimer: fetchActive,
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within TimerProvider');
  return ctx;
}
