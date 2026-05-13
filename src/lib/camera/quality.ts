/**
 * Portable image quality analysis.
 * Input: raw RGBA Uint8ClampedArray + width/height (works with HTMLCanvas
 * getImageData on web AND with vision-camera frame buffers on RN).
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
  type TemporalStability,
} from "./types";

export interface RoiRect {
  /** All values are fractions 0..1 of the source image. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_FACE_ROI: RoiRect = { x: 0.25, y: 0.15, w: 0.5, h: 0.7 };

interface RoiSample {
  gray: Float32Array;
  /** Skin mask aligned with `gray`, values 0 or 1. */
  skin: Uint8Array;
  w: number;
  h: number;
  meanR: number;
  meanG: number;
  meanB: number;
}

/**
 * Skin classifier: HSV heuristic that matches a wide range of phototypes
 * (Fitzpatrick I–VI). Conservative on saturation to reject pure red/orange
 * objects, generous on value to handle low-light dermatology setups.
 */
function isSkinPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  if (v < 0.18 || v > 0.98) return false;
  const s = max === 0 ? 0 : (max - min) / max;
  if (s < 0.12 || s > 0.7) return false;
  // Hue
  let h: number;
  const d = max - min;
  if (d === 0) return false;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  // Skin hues: warm region ~0–50°, with a small wrap-around for very dark tones
  return h <= 50 || h >= 345;
}

function extractRoi(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  roi: RoiRect,
  targetW: number,
): RoiSample {
  const x0 = Math.max(0, Math.floor(roi.x * srcW));
  const y0 = Math.max(0, Math.floor(roi.y * srcH));
  const rW = Math.max(1, Math.floor(roi.w * srcW));
  const rH = Math.max(1, Math.floor(roi.h * srcH));

  const scale = Math.max(1, Math.floor(rW / targetW));
  const w = Math.floor(rW / scale);
  const h = Math.floor(rH / scale);
  const gray = new Float32Array(w * h);
  const skin = new Uint8Array(w * h);

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
      gray[yy * w + xx] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      skin[yy * w + xx] = isSkinPixel(r, g, b) ? 1 : 0;
      sumR += r;
      sumG += g;
      sumB += b;
      count++;
    }
  }

  return { gray, skin, w, h, meanR: sumR / count, meanG: sumG / count, meanB: sumB / count };
}

/** Variance of 3×3 Laplacian — classic blur estimator. */
function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        -gray[i - w - 1] - gray[i - w] - gray[i - w + 1] -
        gray[i - 1] + 8 * gray[i] - gray[i + 1] -
        gray[i + w - 1] - gray[i + w] - gray[i + w + 1];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export const HISTOGRAM_BINS = 32;

interface ClippingStats {
  low: number;
  high: number;
  total: number;
  histogram: number[];
}

function clippingAndHistogram(gray: Float32Array): ClippingStats {
  const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
  let low = 0;
  let high = 0;
  const n = gray.length;
  for (let i = 0; i < n; i++) {
    const v = gray[i];
    if (v <= 2) low++;
    else if (v >= 253) high++;
    let bin = Math.floor((v / 256) * HISTOGRAM_BINS);
    if (bin < 0) bin = 0;
    else if (bin >= HISTOGRAM_BINS) bin = HISTOGRAM_BINS - 1;
    bins[bin]++;
  }
  for (let i = 0; i < HISTOGRAM_BINS; i++) bins[i] = bins[i] / n;
  return { low: low / n, high: high / n, total: (low + high) / n, histogram: bins };
}

function grayWorldCast(meanR: number, meanG: number, meanB: number): number {
  const m = (meanR + meanG + meanB) / 3;
  if (m < 1e-3) return 1;
  const dr = (meanR - m) / m;
  const dg = (meanG - m) / m;
  const db = (meanB - m) / m;
  return Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db));
}

/** Skin centroid (in normalized ROI coords 0..1) and skin pixel ratio. */
function skinStats(skin: Uint8Array, w: number, h: number) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (skin[y * w + x]) {
        sx += x;
        sy += y;
        n++;
      }
    }
  }
  if (n === 0) return { ratio: 0, offset: 1 };
  const cx = sx / n / w;
  const cy = sy / n / h;
  const dx = cx - 0.5;
  const dy = cy - 0.5;
  // Normalised by half-diagonal of the ROI (≈0.707)
  const offset = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 0.5);
  return { ratio: n / (w * h), offset };
}

export function analyzeFrame(
  rgba: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  roi: RoiRect = DEFAULT_FACE_ROI,
): FrameMetrics {
  const { gray, skin, w, h, meanR, meanG, meanB } = extractRoi(rgba, srcW, srcH, roi, 220);

  let lumSum = 0;
  for (let i = 0; i < gray.length; i++) lumSum += gray[i];
  const luminance = lumSum / gray.length / 255;

  const { ratio, offset } = skinStats(skin, w, h);
  const clip = clippingAndHistogram(gray);

  return {
    luminance,
    sharpness: laplacianVariance(gray, w, h),
    clipping: clip.total,
    clippingLow: clip.low,
    clippingHigh: clip.high,
    histogram: clip.histogram,
    colorCast: grayWorldCast(meanR, meanG, meanB),
    skinRatio: ratio,
    centerOffset: offset,
    roiPixels: gray.length,
    timestamp: Date.now(),
  };
}

/* -------------------- Temporal stability tracker -------------------- */

export class TemporalTracker {
  private buf: FrameMetrics[] = [];
  constructor(private windowSize = 8) {}

  push(m: FrameMetrics): TemporalStability {
    this.buf.push(m);
    if (this.buf.length > this.windowSize) this.buf.shift();
    return this.compute();
  }

  reset() {
    this.buf = [];
  }

  private compute(): TemporalStability {
    const n = this.buf.length;
    if (n < 2) return { luminanceStd: 0, colorCastStd: 0, samples: n };
    let lumSum = 0;
    let castSum = 0;
    for (const m of this.buf) {
      lumSum += m.luminance;
      castSum += m.colorCast;
    }
    const lumMean = lumSum / n;
    const castMean = castSum / n;
    let lumVar = 0;
    let castVar = 0;
    for (const m of this.buf) {
      lumVar += (m.luminance - lumMean) ** 2;
      castVar += (m.colorCast - castMean) ** 2;
    }
    return {
      luminanceStd: Math.sqrt(lumVar / n),
      colorCastStd: Math.sqrt(castVar / n),
      samples: n,
    };
  }
}

/* -------------------- Gate evaluation -------------------- */

export function evaluateGates(
  metrics: FrameMetrics,
  stability: StabilityMetrics,
  temporal: TemporalStability,
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS,
): QualityReport {
  const gates: QualityGateResult[] = [];

  // 1. Position / distance — skin fill in ROI
  if (metrics.skinRatio < thresholds.skinRatioMin) {
    gates.push({
      id: "distance",
      label: "Odległość",
      status: "fail",
      detail: `Twarz za mała (${(metrics.skinRatio * 100).toFixed(0)}% ROI) — przybliż.`,
    });
  } else if (metrics.skinRatio > thresholds.skinRatioMax) {
    gates.push({
      id: "distance",
      label: "Odległość",
      status: "fail",
      detail: `Za blisko (${(metrics.skinRatio * 100).toFixed(0)}% ROI) — odsuń.`,
    });
  } else {
    gates.push({
      id: "distance",
      label: "Odległość",
      status: "ok",
      detail: `Wypełnienie ${(metrics.skinRatio * 100).toFixed(0)}%`,
    });
  }

  // 2. Centering
  gates.push({
    id: "position",
    label: "Pozycja",
    status:
      metrics.centerOffset > thresholds.centerOffsetMax
        ? "fail"
        : metrics.centerOffset > thresholds.centerOffsetMax * 0.7
          ? "warn"
          : "ok",
    detail:
      metrics.centerOffset > thresholds.centerOffsetMax
        ? "Wycentruj twarz w owalu"
        : `Δ ${(metrics.centerOffset * 100).toFixed(0)}%`,
  });

  // 3. Exposure — instantaneous luminance
  if (metrics.luminance < thresholds.luminanceMin) {
    gates.push({
      id: "exposure",
      label: "Ekspozycja",
      status: "fail",
      detail: `Za ciemno (${metrics.luminance.toFixed(2)})`,
    });
  } else if (metrics.luminance > thresholds.luminanceMax) {
    gates.push({
      id: "exposure",
      label: "Ekspozycja",
      status: "fail",
      detail: `Za jasno (${metrics.luminance.toFixed(2)})`,
    });
  } else {
    gates.push({
      id: "exposure",
      label: "Ekspozycja",
      status: "ok",
      detail: `Luma ${metrics.luminance.toFixed(2)}`,
    });
  }

  // 4. Clipping
  gates.push({
    id: "clipping",
    label: "Brak przepaleń",
    status: metrics.clipping > thresholds.clippingMax ? "warn" : "ok",
    detail: `${(metrics.clipping * 100).toFixed(1)}% pikseli skrajnych`,
  });

  // 5. Sharpness
  gates.push({
    id: "sharpness",
    label: "Ostrość (LapVar)",
    status: metrics.sharpness < thresholds.sharpnessMin ? "fail" : "ok",
    detail: `${metrics.sharpness.toFixed(0)}`,
  });

  // 6. AE temporal stability
  if (temporal.samples < thresholds.temporalMinSamples) {
    gates.push({
      id: "ae-stable",
      label: "AE stabilne",
      status: "warn",
      detail: `Próbkowanie… (${temporal.samples}/${thresholds.temporalMinSamples})`,
    });
  } else {
    gates.push({
      id: "ae-stable",
      label: "AE stabilne",
      status: temporal.luminanceStd > thresholds.luminanceStdMax ? "fail" : "ok",
      detail: `σL ${temporal.luminanceStd.toFixed(3)}`,
    });
  }

  // 7. AWB temporal stability + cast
  if (temporal.samples < thresholds.temporalMinSamples) {
    gates.push({
      id: "awb-stable",
      label: "AWB stabilne",
      status: "warn",
      detail: `Próbkowanie… (${temporal.samples}/${thresholds.temporalMinSamples})`,
    });
  } else {
    const castFail = metrics.colorCast > thresholds.colorCastMax;
    const driftFail = temporal.colorCastStd > thresholds.colorCastStdMax;
    gates.push({
      id: "awb-stable",
      label: "AWB stabilne",
      status: castFail || driftFail ? (castFail ? "fail" : "warn") : "ok",
      detail: `cast ${(metrics.colorCast * 100).toFixed(1)}% · σ ${temporal.colorCastStd.toFixed(3)}`,
    });
  }

  // 8. Device stability
  if (!stability.available) {
    gates.push({
      id: "stability",
      label: "Stabilizacja",
      status: "warn",
      detail: "Brak żyroskopu",
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
  return { ready, gates, metrics, stability, temporal };
}
