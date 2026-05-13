import { useEffect, useRef, useState } from "react";
import { analyzeFrame, DEFAULT_FACE_ROI, evaluateGates, type RoiRect } from "@/lib/camera/quality";
import type { QualityReport, StabilityMetrics } from "@/lib/camera/types";

interface Options {
  intervalMs?: number;
  roi?: RoiRect;
  analysisWidth?: number;
}

/**
 * Periodically samples frames from a <video> element via an offscreen canvas,
 * runs the portable quality analyzer, and emits a QualityReport.
 */
export function useFrameAnalysis(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  stability: StabilityMetrics,
  opts: Options = {},
) {
  const { intervalMs = 250, roi = DEFAULT_FACE_ROI, analysisWidth = 480 } = opts;
  const [report, setReport] = useState<QualityReport | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stabRef = useRef(stability);
  stabRef.current = stability;

  useEffect(() => {
    let rafTimer: number | null = null;
    let stopped = false;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

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
          setReport(evaluateGates(m, stabRef.current));
        } catch {
          // ignore (cross-origin guard, etc.)
        }
      }
      rafTimer = window.setTimeout(tick, intervalMs);
    };
    tick();

    return () => {
      stopped = true;
      if (rafTimer != null) window.clearTimeout(rafTimer);
    };
  }, [videoRef, intervalMs, roi, analysisWidth]);

  return report;
}
