// ─── Project WOOHYUN — Focus Timer Hook ───────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";

export interface UseTimerOptions {
  totalSeconds: number;
  onComplete?: () => void;
  autoStart?: boolean;
}

export interface UseTimerReturn {
  timeLeft: number;
  running: boolean;
  pct: number;           // 0–100, how much time is LEFT
  mm: string;
  ss: string;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
}

export function useTimer({
  totalSeconds,
  onComplete,
  autoStart = true,
}: UseTimerOptions): UseTimerReturn {
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const [running, setRunning]   = useState(autoStart);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!running || timeLeft <= 0) return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(id);
          setRunning(false);
          onCompleteRef.current?.();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const start  = useCallback(() => setRunning(true),  []);
  const pause  = useCallback(() => setRunning(false), []);
  const toggle = useCallback(() => setRunning((r) => !r), []);
  const reset  = useCallback(() => {
    setRunning(false);
    setTimeLeft(totalSeconds);
  }, [totalSeconds]);

  const pct = Math.round((timeLeft / totalSeconds) * 100);
  const mm  = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss  = String(timeLeft % 60).padStart(2, "0");

  return { timeLeft, running, pct, mm, ss, start, pause, toggle, reset };
}
