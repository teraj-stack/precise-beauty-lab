/**
 * Portable image quality analysis.
 * Input: raw RGBA Uint8ClampedArray + width/height (works with HTMLCanvas
 * getImageData on web AND with vision-camera frame buffers on RN).
 *
 * Implements:
 *   - Mean luminance (Rec.709)
 *   - Histogram clipping
 *   - Gray-world color cast
 *   - Variance of Laplacian (3x3) for sharpness
 *
 * Pure functions, no DOM. SaMD-friendly: deterministic, no ML.
 */

import {
  DEFAULT_THRESHOLDS,
  type FrameMetrics,
  type QualityGateResult,
  type QualityReport,
  type QualityThresholds,
  type StabilityMetrics,
} from "./types";

export interface RoiRect {
  /** All values are fractions 0..1 of the source image. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Default centered face oval ROI (portrait-ish). */
export const DEFAULT_FACE_ROI: RoiRect = { x: 0.25, y: 0.15, w: 0.5, h: 0.7 };

/**
 * Extract a downsampled grayscale buffer from RGBA pixels within ROI.
 * Returns a Float32Array of length targetW*targetH with luma in [0,255].
 */
function extractGrayscaleRoi(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  roi: RoiRect,
  targetW: number,
): { gray: Float32Array; w: number; h: number; meanR: number; meanG: number; meanB: number } {
  const x0 = Math.max(0, Math.floor(roi.x * srcW));
  const y0 = Math.max(0, Math.floor(roi.y * srcH));
  const rW = Math.max(1, Math.floor(roi.w * srcW));
  const rH = Math.max(1, Math.floor(roi.h * srcH));

  const scale = Math.max(1, Math.floor(rW / targetW));
  const w = Math.floor(rW / scale);
  const h = Math.floor(rH / scale);
  const gray = new Float32Array(w * h);

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let yy = 0; yy < h; yy++) {
    const sy = y0 + yy * scale;
    for (let xx = 0; xx < w; xx++) {
      const sx = x0 + xx * scale;
      const idx = (sy * srcW + sx) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      // Rec.709 luma
      gray[yy * w + xx] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sumR += r;
      sumG += g;
      sumB += b;
      count++;
    }
  }

  return {
    gray,
    w,
    h,
    meanR: sumR / count,
    meanG: sumG / count,
    meanB: sumB / count,
  };
}

/** Variance of 3x3 Laplacian. Classic blur estimator. */
function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        -gray[i - w - 1] -
        gray[i - w] -
        gray[i - w + 1] -
        gray[i - 1] +
        8 * gray[i] -
        gray[i + 1] -
        gray[i + w - 1] -
        gray[i + w] -
        gray[i + w + 1];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function clippingRatio(gray: Float32Array): number {
  let clipped = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i];
    if (v <= 2 || v >= 253) clipped++;
  }
  return clipped / gray.length;
}

/** Gray-world color cast: how far the mean R,G,B deviates from neutral. */
function grayWorldCast(meanR: number, meanG: number, meanB: number): number {
  const m = (meanR + meanG + meanB) / 3;
  if (m < 1e-3) return 1;
  const dr = (meanR - m) / m;
  const dg = (meanG - m) / m;
  const db = (meanB - m) / m;
  return Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db));
}

export function analyzeFrame(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  roi: RoiRect = DEFAULT_FACE_ROI,
): FrameMetrics {
  const { gray, w, h, meanR, meanG, meanB } = extractGrayscaleRoi(rgba, srcW, srcH, roi, 220);

  // Mean luminance
  let lumSum = 0;
  for (let i = 0; i < gray.length; i++) lumSum += gray[i];
  const luminance = lumSum / gray.length / 255;

  return {
    luminance,
    sharpness: laplacianVariance(gray, w, h),
    clipping: clippingRatio(gray),
    colorCast: grayWorldCast(meanR, meanG, meanB),
    roiPixels: gray.length,
    timestamp: Date.now(),
  };
}

export function evaluateGates(
  metrics: FrameMetrics,
  stability: StabilityMetrics,
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS,
): QualityReport {
  const gates: QualityGateResult[] = [];

  // Exposure
  if (metrics.luminance < thresholds.luminanceMin) {
    gates.push({
      id: "exposure",
      label: "Ekspozycja",
      status: "fail",
      detail: `Za ciemno (${metrics.luminance.toFixed(2)}) — dodaj światło.`,
    });
  } else if (metrics.luminance > thresholds.luminanceMax) {
    gates.push({
      id: "exposure",
      label: "Ekspozycja",
      status: "fail",
      detail: `Za jasno (${metrics.luminance.toFixed(2)}) — odsuń źródło światła.`,
    });
  } else {
    gates.push({
      id: "exposure",
      label: "Ekspozycja",
      status: "ok",
      detail: `Luma ${metrics.luminance.toFixed(2)}`,
    });
  }

  // Clipping
  gates.push({
    id: "clipping",
    label: "Brak przepaleń",
    status: metrics.clipping > thresholds.clippingMax ? "warn" : "ok",
    detail: `${(metrics.clipping * 100).toFixed(1)}% pikseli skrajnych`,
  });

  // Sharpness
  gates.push({
    id: "sharpness",
    label: "Ostrość",
    status: metrics.sharpness < thresholds.sharpnessMin ? "fail" : "ok",
    detail: `LapVar ${metrics.sharpness.toFixed(0)}`,
  });

  // Color cast (proxy for AWB lock — if scene neutral, low cast)
  gates.push({
    id: "wb",
    label: "Balans bieli",
    status: metrics.colorCast > thresholds.colorCastMax ? "warn" : "ok",
    detail: `Cast ${(metrics.colorCast * 100).toFixed(1)}%`,
  });

  // Stability
  if (!stability.available) {
    gates.push({
      id: "stability",
      label: "Stabilizacja",
      status: "warn",
      detail: "Brak żyroskopu — trzymaj telefon obiema rękami.",
    });
  } else {
    gates.push({
      id: "stability",
      label: "Stabilizacja",
      status: stability.angularVelocity > thresholds.angularVelocityMax ? "fail" : "ok",
      detail: `ω ${stability.angularVelocity.toFixed(2)} rad/s`,
    });
  }

  const ready = gates.every((g) => g.status === "ok");
  return { ready, gates, metrics, stability };
}
