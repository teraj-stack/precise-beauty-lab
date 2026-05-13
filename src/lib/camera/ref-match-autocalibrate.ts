/**
 * Auto-calibration for ref-match shutter thresholds.
 *
 * Given a series of {evDelta, l1} samples from the live camera vs. the
 * active histogram reference, suggest |ΔEV| and L1 cut-offs that would
 * yield a stable shutter lock (i.e. high acceptance rate on frames the
 * operator considers "good") with a safety margin against jitter.
 *
 * Strategy:
 *   1. Compute |ΔEV| series and L1 series.
 *   2. Take a high percentile (P90) — this is the "natural ceiling" for
 *      good frames captured during calibration. Anything stricter would
 *      reject many of the operator's own shots.
 *   3. Apply a small safety margin (×1.10) and clamp to allowed range.
 *   4. Round to a sensible step (0.005 / 0.01).
 *
 * The operator collects samples by holding the camera in their typical
 * shooting pose for ~5 s. We assume the reference is already loaded and
 * the operator is intentionally aligning — i.e. the captured distribution
 * represents "intended" frames, not noise.
 */

import type { RefMatchThresholds } from "@/components/camera/ThresholdPanel";

export interface RefMatchSample {
  evDelta: number;
  l1: number;
}

export interface RefMatchSuggestion {
  thresholds: RefMatchThresholds;
  /** Sample count used for the suggestion. */
  n: number;
  /** P50 / P90 / max of |ΔEV| in the sample series. */
  evStats: { p50: number; p90: number; max: number };
  /** P50 / P90 / max of L1 in the sample series. */
  l1Stats: { p50: number; p90: number; max: number };
  /** Predicted acceptance rate (fraction of samples that would pass). */
  predictedAcceptance: number;
}

export const MIN_SAMPLES_FOR_CALIBRATION = 20;
export const RECOMMENDED_SAMPLES = 60;

const EV_RANGE = { min: 0.05, max: 0.6 } as const;
const L1_RANGE = { min: 0.1, max: 1.5 } as const;
const SAFETY_MARGIN = 1.1;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function computeRefMatchSuggestion(
  samples: readonly RefMatchSample[],
): RefMatchSuggestion | null {
  if (samples.length < MIN_SAMPLES_FOR_CALIBRATION) return null;

  const evAbs = samples.map((s) => Math.abs(s.evDelta)).sort((a, b) => a - b);
  const l1s = samples.map((s) => s.l1).sort((a, b) => a - b);

  const evP50 = percentile(evAbs, 0.5);
  const evP90 = percentile(evAbs, 0.9);
  const evMax = evAbs[evAbs.length - 1];

  const l1P50 = percentile(l1s, 0.5);
  const l1P90 = percentile(l1s, 0.9);
  const l1Max = l1s[l1s.length - 1];

  const alignEv = clamp(
    roundTo(evP90 * SAFETY_MARGIN, 0.01),
    EV_RANGE.min,
    EV_RANGE.max,
  );
  const alignL1 = clamp(
    roundTo(l1P90 * SAFETY_MARGIN, 0.01),
    L1_RANGE.min,
    L1_RANGE.max,
  );

  const accepted = samples.filter(
    (s) => Math.abs(s.evDelta) <= alignEv && s.l1 <= alignL1,
  ).length;

  return {
    thresholds: { alignEv, alignL1 },
    n: samples.length,
    evStats: { p50: evP50, p90: evP90, max: evMax },
    l1Stats: { p50: l1P50, p90: l1P90, max: l1Max },
    predictedAcceptance: accepted / samples.length,
  };
}
