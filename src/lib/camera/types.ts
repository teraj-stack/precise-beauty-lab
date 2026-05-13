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
  /** Color cast estimate using gray-world: distance of mean(R,G,B) from neutral, 0..1. */
  colorCast: number;
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
}

/**
 * Thresholds — version-pinned for SaMD audit trail.
 * Bump KB_VERSION on any change.
 */
export const QUALITY_KB_VERSION = "qkb-2026.05.13-001";

export interface QualityThresholds {
  luminanceMin: number;
  luminanceMax: number;
  sharpnessMin: number;
  clippingMax: number;
  colorCastMax: number;
  angularVelocityMax: number; // rad/s
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  luminanceMin: 0.42,
  luminanceMax: 0.68,
  sharpnessMin: 120, // empirical for downsampled 256px ROI
  clippingMax: 0.04,
  colorCastMax: 0.08,
  angularVelocityMax: 0.15,
};
