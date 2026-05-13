import { useEffect, useRef, useState } from "react";
import {
  analyzeFrame,
  DEFAULT_FACE_ROI,
  evaluateGates,
  TemporalTracker,
  type RoiRect,
} from "@/lib/camera/quality";
import { QUALITY_PROFILE_V1, type QualityProfile } from "@/lib/camera/quality-profiles";
import type { QualityReport, StabilityMetrics } from "@/lib/camera/types";

interface Options {
  intervalMs?: number;
  roi?: RoiRect;
  analysisWidth?: number;
  windowSize?: number;
  /** Profile whose `live` thresholds drive HUD gates. Defaults to v1 baseline. */
  profile?: QualityProfile;
}

export function useFrameAnalysis(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  stability: StabilityMetrics,
  opts: Options = {},
) {
  const {
    intervalMs = 220,
    roi = DEFAULT_FACE_ROI,
    analysisWidth = 480,
    windowSize = 8,
    profile = QUALITY_PROFILE_V1,
  } = opts;
  const [report, setReport] = useState<QualityReport | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef<TemporalTracker>(new TemporalTracker(windowSize));
  const stabRef = useRef(stability);
  stabRef.current = stability;

  useEffect(() => {
    let timer: number | null = null;
    let stopped = false;

    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    trackerRef.current.reset();

    const tick = () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        const ratio = v.videoHeight / v.videoWidth;
        const w = Math.min(analysisWidth, v.videoWidth);
        const h = Math.round(w * ratio);
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        try {
          const img = ctx.getImageData(0, 0, w, h);
          const m = analyzeFrame(img.data, w, h, roi);
          const temporal = trackerRef.current.push(m);
          setReport(evaluateGates(m, stabRef.current, temporal, profile.live));
        } catch {
          /* cross-origin guard */
        }
      }
      timer = window.setTimeout(tick, intervalMs);
    };
    tick();

    return () => {
      stopped = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [videoRef, intervalMs, roi, analysisWidth, windowSize, profile]);

  return report;
}
