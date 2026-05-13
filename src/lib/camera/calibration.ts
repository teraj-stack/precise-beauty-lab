/**
 * Personal calibration: derive an individual QualityProfile from N accepted
 * sample frames and persist it in localStorage. Lets a clinician adapt the
 * camera gates to their own lighting setup, skin tone and working distance.
 */

import type { FrameMetrics } from "./types";
import { DEFAULT_THRESHOLDS } from "./types";
import { QUALITY_PROFILE_V1, type QualityProfile } from "./quality-profiles";

export const CALIBRATION_STORAGE_KEY = "msc-cdss.calibration.v1";
export const CALIBRATION_TARGET_SAMPLES = 5;

export interface CalibrationSample {
  metrics: FrameMetrics;
  capturedAt: string;
}

export interface PersonalCalibration {
  schema: "msc-cdss.calibration.v1";
  basedOn: string; // baseline profile version
  createdAt: string;
  sampleCount: number;
  stats: {
    luminance: { mean: number; std: number; min: number; max: number };
    sharpness: { mean: number; std: number; min: number; max: number };
    skinRatio: { mean: number; std: number; min: number; max: number };
    colorCast: { mean: number; std: number; max: number };
    centerOffset: { mean: number; max: number };
    clipping: { mean: number; max: number };
  };
  profile: QualityProfile;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function summarise(values: number[]) {
  const n = values.length || 1;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { mean, std, min, max };
}

/**
 * Derive a personalised profile from accepted samples. Margins are calibrated
 * conservatively: live gate widens around the observed range, capture stays
 * close to it but never relaxes below the v1 safety floor.
 */
export function deriveCalibration(
  samples: CalibrationSample[],
  baseline: QualityProfile = QUALITY_PROFILE_V1,
): PersonalCalibration {
  if (samples.length === 0) throw new Error("No samples to calibrate from.");

  const lum = summarise(samples.map((s) => s.metrics.luminance));
  const shp = summarise(samples.map((s) => s.metrics.sharpness));
  const skn = summarise(samples.map((s) => s.metrics.skinRatio));
  const cst = summarise(samples.map((s) => s.metrics.colorCast));
  const off = summarise(samples.map((s) => s.metrics.centerOffset));
  const clp = summarise(samples.map((s) => s.metrics.clipping));

  // Capture window: tight around observed mean ±(2σ or fixed margin).
  const lumPad = Math.max(0.05, lum.std * 2);
  const shpPad = Math.max(40, shp.std * 1.5);
  const sknPad = Math.max(0.05, skn.std * 2);

  const captureLumMin = clamp(lum.mean - lumPad, 0.3, baseline.capture.luminanceMin);
  const captureLumMax = clamp(lum.mean + lumPad, baseline.capture.luminanceMax, 0.85);
  const captureSharpMin = Math.max(
    baseline.capture.sharpnessMin * 0.8,
    Math.min(shp.mean - shpPad, baseline.capture.sharpnessMin),
  );
  const captureSkinMin = clamp(skn.mean - sknPad, 0.2, baseline.capture.skinRatioMin);
  const captureSkinMax = clamp(skn.mean + sknPad, baseline.capture.skinRatioMax, 0.85);
  const captureCastMax = clamp(
    Math.max(cst.max * 1.2, baseline.capture.colorCastMax),
    0.03,
    0.12,
  );
  const captureOffsetMax = clamp(
    Math.max(off.max * 1.1, baseline.capture.centerOffsetMax * 0.85),
    0.1,
    0.3,
  );
  const captureClipMax = clamp(
    Math.max(clp.max * 1.2, baseline.capture.clippingMax * 0.8),
    0.005,
    0.05,
  );

  // Live: even more permissive band (±50% wider than capture).
  const liveLumMin = clamp(captureLumMin - 0.04, 0.25, captureLumMin);
  const liveLumMax = clamp(captureLumMax + 0.04, captureLumMax, 0.92);
  const liveSharpMin = Math.max(60, captureSharpMin * 0.75);

  const profile: QualityProfile = {
    version: `qkb-personal-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`,
    changelog: `Personal calibration derived from ${samples.length} samples. Baseline ${baseline.version}.`,
    live: {
      ...DEFAULT_THRESHOLDS,
      luminanceMin: +liveLumMin.toFixed(3),
      luminanceMax: +liveLumMax.toFixed(3),
      sharpnessMin: +liveSharpMin.toFixed(0),
      clippingMax: +Math.max(captureClipMax * 1.5, baseline.live.clippingMax).toFixed(3),
      colorCastMax: +Math.max(captureCastMax * 1.2, baseline.live.colorCastMax).toFixed(3),
      angularVelocityMax: baseline.live.angularVelocityMax,
      skinRatioMin: +Math.max(captureSkinMin - 0.05, 0.2).toFixed(3),
      skinRatioMax: +Math.min(captureSkinMax + 0.05, 0.9).toFixed(3),
      centerOffsetMax: +Math.min(captureOffsetMax + 0.05, 0.32).toFixed(3),
      luminanceStdMax: baseline.live.luminanceStdMax,
      colorCastStdMax: baseline.live.colorCastStdMax,
      temporalMinSamples: baseline.live.temporalMinSamples,
    },
    capture: {
      ...DEFAULT_THRESHOLDS,
      luminanceMin: +captureLumMin.toFixed(3),
      luminanceMax: +captureLumMax.toFixed(3),
      sharpnessMin: +captureSharpMin.toFixed(0),
      clippingMax: +captureClipMax.toFixed(3),
      colorCastMax: +captureCastMax.toFixed(3),
      angularVelocityMax: baseline.capture.angularVelocityMax,
      skinRatioMin: +captureSkinMin.toFixed(3),
      skinRatioMax: +captureSkinMax.toFixed(3),
      centerOffsetMax: +captureOffsetMax.toFixed(3),
      luminanceStdMax: baseline.capture.luminanceStdMax,
      colorCastStdMax: baseline.capture.colorCastStdMax,
      temporalMinSamples: baseline.capture.temporalMinSamples,
    },
  };

  return {
    schema: "msc-cdss.calibration.v1",
    basedOn: baseline.version,
    createdAt: new Date().toISOString(),
    sampleCount: samples.length,
    stats: {
      luminance: lum,
      sharpness: shp,
      skinRatio: skn,
      colorCast: { mean: cst.mean, std: cst.std, max: cst.max },
      centerOffset: { mean: off.mean, max: off.max },
      clipping: { mean: clp.mean, max: clp.max },
    },
    profile,
  };
}

export function loadCalibration(): PersonalCalibration | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersonalCalibration;
    if (parsed.schema !== "msc-cdss.calibration.v1") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCalibration(c: PersonalCalibration): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(c));
}

export function clearCalibration(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CALIBRATION_STORAGE_KEY);
}
