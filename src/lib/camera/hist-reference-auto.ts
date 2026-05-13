/**
 * Auto-selection of the best-matching histogram reference for the current
 * frame and conditions.
 *
 * Composite score (lower = better):
 *   0.50 × histogramL1Norm        — direct distribution similarity
 *   0.25 × evDeltaNorm            — exposure proxy (|ΔEV| vs ref luminance)
 *   0.15 × timeOfDayNorm          — circular hour-of-day distance
 *   0.10 × conditionMissNorm      — token miss-rate on conditions/label
 *
 * All terms are normalized to roughly [0, 1]. The final score is clamped
 * to [0, 1] for display purposes.
 */

import type { StoredHistogramReference } from "./hist-reference-library";

export interface CurrentFrameConditions {
  /** Live histogram (32-bin, sum 1). */
  histogram: number[];
  /** Live mean luminance 0..1. */
  luminance: number;
  /** Wall-clock now (ms epoch). Defaults to Date.now() in helpers. */
  now?: number;
  /**
   * Operator-supplied tokens describing current conditions
   * (e.g. ["okno", "LED", "5500K"]). Matched case-insensitively against
   * each reference's `conditions` and `label` text.
   */
  conditionTokens?: string[];
}

export interface ReferenceMatchScore {
  ref: StoredHistogramReference;
  /** Composite score in [0, 1]. Lower = better. */
  score: number;
  histogramL1: number;
  evDelta: number;
  /** Hour difference (0..12) on a circular 24h clock. */
  hourDiff: number;
  /** Fraction of supplied tokens NOT matched (0 = all matched, 1 = none). */
  conditionMiss: number;
}

const W_HIST = 0.5;
const W_EV = 0.25;
const W_TOD = 0.15;
const W_COND = 0.1;

function histL1(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum; // 0..2 for normalized distros
}

function hourOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60;
}

function circularHourDiff(a: number, b: number): number {
  const raw = Math.abs(a - b) % 24;
  return Math.min(raw, 24 - raw); // 0..12
}

function tokenize(s: string | undefined | null): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
}

function conditionMissRate(
  ref: StoredHistogramReference,
  tokens: string[] | undefined,
): number {
  if (!tokens || tokens.length === 0) return 0;
  const haystack = new Set([
    ...tokenize(ref.conditions),
    ...tokenize(ref.label),
  ]);
  if (haystack.size === 0) return 1;
  let hit = 0;
  for (const t of tokens) {
    if (haystack.has(t.toLowerCase())) hit += 1;
  }
  return 1 - hit / tokens.length;
}

export function scoreReference(
  ref: StoredHistogramReference,
  current: CurrentFrameConditions,
): ReferenceMatchScore {
  const now = current.now ?? Date.now();
  const histogramL1 = histL1(current.histogram, ref.histogram);
  const curLum = Math.max(0.001, current.luminance);
  const refLum = Math.max(0.001, ref.luminance);
  const evDelta = Math.log2(curLum / refLum);
  const hourDiff = circularHourDiff(hourOfDay(now), hourOfDay(ref.createdAt));
  const conditionMiss = conditionMissRate(ref, current.conditionTokens);

  const histNorm = Math.min(1, histogramL1 / 2);
  const evNorm = Math.min(1, Math.abs(evDelta) / 1.0); // 1 EV = saturation
  const todNorm = hourDiff / 12; // 0..1
  const condNorm = conditionMiss; // 0..1

  const score = Math.min(
    1,
    Math.max(
      0,
      W_HIST * histNorm + W_EV * evNorm + W_TOD * todNorm + W_COND * condNorm,
    ),
  );

  return { ref, score, histogramL1, evDelta, hourDiff, conditionMiss };
}

/**
 * Returns scored references sorted by best (lowest score) first, plus a
 * convenience `best` reference. Returns `null` if the library is empty.
 */
export function pickBestReference(
  library: StoredHistogramReference[],
  current: CurrentFrameConditions,
): { best: ReferenceMatchScore; ranked: ReferenceMatchScore[] } | null {
  if (library.length === 0) return null;
  const ranked = library
    .map((ref) => scoreReference(ref, current))
    .sort((a, b) => a.score - b.score);
  return { best: ranked[0], ranked };
}

/**
 * Decide whether to switch from `currentActiveId` to a new best pick.
 * Hysteresis: only switch if the new best is meaningfully better than
 * the currently-active reference (margin > 0.05) AND has an absolute
 * score under `goodEnough`. This prevents UI flicker when two refs are
 * nearly tied.
 */
export function shouldSwitchTo(
  ranked: ReferenceMatchScore[],
  currentActiveId: string | null,
  options: { margin?: number; goodEnough?: number } = {},
): ReferenceMatchScore | null {
  const margin = options.margin ?? 0.05;
  const goodEnough = options.goodEnough ?? 0.6;
  if (ranked.length === 0) return null;
  const best = ranked[0];
  if (best.score > goodEnough) return null;
  if (!currentActiveId) return best;
  if (best.ref.id === currentActiveId) return null;
  const currentScore = ranked.find((r) => r.ref.id === currentActiveId)?.score;
  if (currentScore == null) return best; // active was deleted — switch
  return currentScore - best.score > margin ? best : null;
}

/** Common condition chip suggestions. */
export const CONDITION_TOKEN_SUGGESTIONS: { label: string; token: string }[] = [
  { label: "Okno / dzienne", token: "okno" },
  { label: "LED", token: "led" },
  { label: "Halogen / żarowe", token: "halogen" },
  { label: "Świetlówka", token: "świetlówka" },
  { label: "Studio", token: "studio" },
  { label: "Pochmurno", token: "pochmurno" },
  { label: "Wieczór / sztuczne", token: "wieczór" },
  { label: "Poranek", token: "poranek" },
];
