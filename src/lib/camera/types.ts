/**
 * Standardized Camera — portable types.
 * Pure TypeScript, no DOM/RN deps. Safe to share between web (PWA) and React Native.
 */

export interface FrameMetrics {
  /** Mean luminance of the analysed ROI, normalised 0..1 (target ~0.45–0.65). */
  luminance: number;
  /** Variance of the Laplacian on the ROI — sharpness proxy. Higher = sharper. */
  sharpness: number;
  /** Histogram clipping: fraction of pixels at extremes (0 or 255). 0..1, lower better. */
  clipping: number;
  /** Fraction of ROI pixels at the dark extreme (≤2/255). 0..1. */
  clippingLow: number;
  /** Fraction of ROI pixels at the bright extreme (≥253/255). 0..1. */
  clippingHigh: number;
  /** Luminance histogram (32 bins, sums to 1). Bin i covers luma range i/32..(i+1)/32. */
  histogram: number[];
  /** Color cast estimate using gray-world: distance of mean(R,G,B) from neutral, 0..1. */
  colorCast: number;
  /** Signed per-channel deviation from gray-world neutral (R-mean)/mean. Positive = channel above neutral. */
  castR: number;
  castG: number;
  castB: number;
  /** Fraction of ROI pixels classified as skin (HSV heuristic). Proxy for face-fill / distance. */
  skinRatio: number;
  /** Distance of skin centroid from ROI center, normalised by ROI half-diagonal. 0 = perfect. */
  centerOffset: number;
  /** Effective ROI size in pixels analysed. */
  roiPixels: number;
  /** Capture timestamp (ms since epoch). */
  timestamp: number;
}

export interface StabilityMetrics {
  /** Magnitude of recent angular velocity (rad/s) — lower = steadier. */
  angularVelocity: number;
  /** Whether the device sensor is available at all. */
  available: boolean;
}

/** Temporal stability of AE/AWB across the rolling sample window. */
export interface TemporalStability {
  /** Std-dev of luminance across last N frames (0..1). High = AE still adapting. */
  luminanceStd: number;
  /** Std-dev of color cast across last N frames (0..1). High = AWB still adapting. */
  colorCastStd: number;
  /** Number of samples in the window. */
  samples: number;
  /** Recent luminance values (oldest → newest), one per sample. Optional for backward compat. */
  luminanceSeries?: number[];
  /** Recent color-cast values (oldest → newest), one per sample. Optional for backward compat. */
  colorCastSeries?: number[];
}

export type GateStatus = "ok" | "warn" | "fail";

export interface QualityGateResult {
  id: string;
  label: string;
  status: GateStatus;
  detail: string;
}

export interface QualityReport {
  ready: boolean;
  gates: QualityGateResult[];
  metrics: FrameMetrics;
  stability: StabilityMetrics;
  temporal: TemporalStability;
}

/**
 * Thresholds — version-pinned for SaMD audit trail.
 * Bump KB_VERSION on any change.
 */
export const QUALITY_KB_VERSION = "qkb-2026.05.13-002";

export interface QualityThresholds {
  luminanceMin: number;
  luminanceMax: number;
  sharpnessMin: number;
  /** Legacy combined clipping cap (low+high). Kept for backward compatibility / fallback. */
  clippingMax: number;
  /** Max fraction of ROI pixels at the dark extreme (≤2/255). 0..1. */
  clippingLowMax: number;
  /** Max fraction of ROI pixels at the bright extreme (≥253/255). 0..1. */
  clippingHighMax: number;
  colorCastMax: number;
  angularVelocityMax: number; // rad/s
  /** Skin fill in ROI: too low = za daleko, too high = za blisko. */
  skinRatioMin: number;
  skinRatioMax: number;
  /** Max acceptable centroid offset from ROI center (0..1). */
  centerOffsetMax: number;
  /** Temporal AE stability — luminance std-dev across window. */
  luminanceStdMax: number;
  /** Temporal AWB stability — colorCast std-dev across window. */
  colorCastStdMax: number;
  /** Min frames in temporal window before we trust AE/AWB stability gates. */
  temporalMinSamples: number;
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  luminanceMin: 0.42,
  luminanceMax: 0.68,
  sharpnessMin: 120,
  clippingMax: 0.04,
  clippingLowMax: 0.03,
  clippingHighMax: 0.03,
  colorCastMax: 0.08,
  angularVelocityMax: 0.15,
  skinRatioMin: 0.35,
  skinRatioMax: 0.78,
  centerOffsetMax: 0.22,
  luminanceStdMax: 0.025,
  colorCastStdMax: 0.02,
  temporalMinSamples: 6,
};
