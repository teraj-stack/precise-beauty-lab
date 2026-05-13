/**
 * Alignment attempt tracking for ref-match shutter gate.
 *
 * One "attempt" = the operator's effort to bring the live frame into
 * EV+L1 alignment with the active histogram reference. It starts when
 * refMatch transitions to `aligned: false` and ends when it transitions
 * back to `aligned: true`.
 *
 * Tracks frames consumed and elapsed time, plus a per-session history
 * trend (in-memory only — resets when the camera component unmounts or
 * the active reference changes).
 */

import { useEffect, useRef, useState } from "react";

export interface AlignmentAttempt {
  /** Wall-clock start (ms epoch). */
  startedAt: number;
  /** Frames seen while not aligned. */
  frames: number;
  /** ms since startedAt at finish (or `now()` for active attempt). */
  durationMs: number;
}

export interface FinishedAlignmentAttempt extends AlignmentAttempt {
  finishedAt: number;
  /** |ΔEV| at finish. */
  finalEvAbs: number;
  /** L1 at finish. */
  finalL1: number;
}

export interface AlignmentTrackerState {
  current: AlignmentAttempt | null;
  last: FinishedAlignmentAttempt | null;
  history: FinishedAlignmentAttempt[];
}

const HISTORY_MAX = 12;

/**
 * @param refMatch - current snapshot, or `null` when there is no active reference.
 * @param resetKey - changes (e.g. switching reference) clear history and any in-flight attempt.
 */
export function useAlignmentTracker(
  refMatch: { evDelta: number; l1: number; aligned: boolean } | null,
  resetKey: string | null,
): AlignmentTrackerState {
  const [state, setState] = useState<AlignmentTrackerState>({
    current: null,
    last: null,
    history: [],
  });
  const currentRef = useRef<AlignmentAttempt | null>(null);

  // Reset on key change (new reference, etc.).
  useEffect(() => {
    currentRef.current = null;
    setState({ current: null, last: null, history: [] });
  }, [resetKey]);

  useEffect(() => {
    if (!refMatch) return;
    const now = Date.now();

    if (!refMatch.aligned) {
      const cur = currentRef.current;
      const next: AlignmentAttempt = cur
        ? { ...cur, frames: cur.frames + 1, durationMs: now - cur.startedAt }
        : { startedAt: now, frames: 1, durationMs: 0 };
      currentRef.current = next;
      setState((s) => ({ ...s, current: next }));
      return;
    }

    // aligned === true
    const cur = currentRef.current;
    if (cur) {
      const finished: FinishedAlignmentAttempt = {
        startedAt: cur.startedAt,
        frames: cur.frames,
        durationMs: now - cur.startedAt,
        finishedAt: now,
        finalEvAbs: Math.abs(refMatch.evDelta),
        finalL1: refMatch.l1,
      };
      currentRef.current = null;
      setState((s) => {
        const history = [...s.history, finished];
        return {
          current: null,
          last: finished,
          history: history.length > HISTORY_MAX ? history.slice(-HISTORY_MAX) : history,
        };
      });
    } else {
      // Already aligned and no in-flight attempt — nothing to do.
      if (state.current !== null) setState((s) => ({ ...s, current: null }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refMatch?.aligned, refMatch?.evDelta, refMatch?.l1]);

  return state;
}

export interface TrendStats {
  count: number;
  avgFrames: number;
  avgMs: number;
  bestFrames: number;
  bestMs: number;
  /** Negative = improving (fewer frames over time). */
  framesSlope: number;
}

export function summarizeAttempts(history: FinishedAlignmentAttempt[]): TrendStats | null {
  if (history.length === 0) return null;
  const n = history.length;
  const totalFrames = history.reduce((a, h) => a + h.frames, 0);
  const totalMs = history.reduce((a, h) => a + h.durationMs, 0);
  const bestFrames = history.reduce((m, h) => Math.min(m, h.frames), Infinity);
  const bestMs = history.reduce((m, h) => Math.min(m, h.durationMs), Infinity);

  // Simple linear slope of frames vs index (least-squares).
  let slope = 0;
  if (n >= 3) {
    const xs = history.map((_, i) => i);
    const ys = history.map((h) => h.frames);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean);
      den += (xs[i] - xMean) ** 2;
    }
    slope = den === 0 ? 0 : num / den;
  }

  return {
    count: n,
    avgFrames: totalFrames / n,
    avgMs: totalMs / n,
    bestFrames,
    bestMs,
    framesSlope: slope,
  };
}
