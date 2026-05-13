import type { FrameMetrics } from "@/lib/camera/types";
import { DEFAULT_THRESHOLDS } from "@/lib/camera/types";

export interface HistogramReference {
  /** 32-bin normalized luminance histogram (sums to 1). */
  histogram: number[];
  /** Mean luminance 0..1 of the reference frame. */
  luminance: number;
  /** Capture timestamp (ms epoch). */
  capturedAt: number;
  /** Optional human label, e.g. "Próba 1". */
  label?: string;
}

interface Props {
  metrics: FrameMetrics;
  /** Optional reference histogram from a previous attempt to overlay + diff. */
  reference?: HistogramReference | null;
}

/** L1 (Manhattan) distance between two normalized histograms — 0 = identical, 2 = disjoint. */
function l1Distance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s;
}

/** Earth Mover's Distance for 1D normalized histograms (assumes equal binning). */
function emd1d(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let cum = 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    cum += a[i] - b[i];
    s += Math.abs(cum);
  }
  // Normalise by number of bins so 0..1
  return s / n;
}

/**
 * Compact AE/AWB HUD:
 * - 32-bin luminance histogram with target band overlay
 * - Mean luma marker
 * - Optional reference histogram overlay (line) + Δμ, L1, EMD diff metrics
 */
export function HistogramHUD({ metrics, reference }: Props) {
  const bins = metrics.histogram;
  const refBins = reference?.histogram;
  const max = Math.max(1e-6, ...bins, ...(refBins ?? []));
  const W = 220;
  const H = 56;
  const barW = W / bins.length;

  const lo = DEFAULT_THRESHOLDS.luminanceMin;
  const hi = DEFAULT_THRESHOLDS.luminanceMax;
  const target = (lo + hi) / 2;
  const meanX = metrics.luminance * W;
  const bandX = lo * W;
  const bandW = (hi - lo) * W;

  // Relative EV offset vs band midpoint. Negative = under, positive = over.
  // Clamp luminance to avoid log(0).
  const evOffset = Math.log2(Math.max(0.001, metrics.luminance) / target);
  const evRefOffset = reference
    ? Math.log2(Math.max(0.001, reference.luminance) / target)
    : null;

  const clipLowPct = metrics.clippingLow * 100;
  const clipHighPct = metrics.clippingHigh * 100;
  const clipMaxPct = DEFAULT_THRESHOLDS.clippingMax * 100;
  const lowBad = clipLowPct > clipMaxPct;
  const highBad = clipHighPct > clipMaxPct;
  const inBand = metrics.luminance >= lo && metrics.luminance <= hi;

  // ---- Per-side mass: split histogram into dark (lewa) and bright (prawa) halves.
  const half = Math.floor(bins.length / 2);
  let darkMass = 0;
  let brightMass = 0;
  for (let i = 0; i < bins.length; i++) {
    if (i < half) darkMass += bins[i];
    else brightMass += bins[i];
  }
  const darkPct = darkMass * 100;
  const brightPct = brightMass * 100;
  // Heavy = >60% masy w jednej połowie — wyraźna asymetria histogramu.
  const darkHeavy = darkMass > 0.6;
  const brightHeavy = brightMass > 0.6;
  const darkSkewed = darkMass > 0.5 && !darkHeavy;
  const brightSkewed = brightMass > 0.5 && !brightHeavy;

  // Diagnostic verdict: czy problem to cienie czy prześwietlenia?
  const sideHint: { text: string; tone: "ok" | "warn" | "fail" } = (() => {
    if (lowBad && highBad)
      return {
        text: "Skrajne cienie i prześwietlenia jednocześnie — scena ma za duży kontrast.",
        tone: "fail",
      };
    if (highBad)
      return {
        text: "Prześwietlenia w jasnych partiach — usuń odbicia / przyciemnij światło.",
        tone: "fail",
      };
    if (lowBad)
      return {
        text: "Głębokie cienie — dodaj światło wypełniające od przodu.",
        tone: "fail",
      };
    if (brightHeavy)
      return {
        text: "Histogram zepchnięty w prawo — kadr za jasny, zmniejsz ekspozycję.",
        tone: "warn",
      };
    if (darkHeavy)
      return {
        text: "Histogram zepchnięty w lewo — kadr za ciemny, zwiększ ekspozycję.",
        tone: "warn",
      };
    if (brightSkewed)
      return { text: "Lekka przewaga jasnych tonów — pilnuj prześwietleń.", tone: "warn" };
    if (darkSkewed)
      return { text: "Lekka przewaga cieni — pilnuj niedoświetlenia.", tone: "warn" };
    return { text: "Rozkład tonów zrównoważony.", tone: "ok" };
  })();
  const sideToneCls =
    sideHint.tone === "ok"
      ? "bg-emerald-500/15 text-emerald-100 border-emerald-400/30"
      : sideHint.tone === "fail"
        ? "bg-red-500/20 text-red-50 border-red-400/40"
        : "bg-amber-500/15 text-amber-50 border-amber-400/40";


  // Reference overlay polyline points
  const refPoints =
    refBins && refBins.length === bins.length
      ? refBins
          .map((v, i) => {
            const x = i * barW + barW / 2;
            const y = H - (v / max) * (H - 4);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  // Diff stats
  const dMean = reference ? metrics.luminance - reference.luminance : 0;
  const l1 = refBins ? l1Distance(bins, refBins) : 0;
  const emd = refBins ? emd1d(bins, refBins) : 0;

  // Direction hint: how to move exposure to match reference
  const dirHint = reference
    ? Math.abs(dMean) < 0.02
      ? "≈ trafione"
      : dMean > 0
        ? "obniż ekspozycję"
        : "podnieś ekspozycję"
    : null;

  // Direction arrow + actionable label for the AE pill
  const evAbs = Math.abs(evOffset);
  const aeStatus: "ok" | "warn" | "fail" = inBand
    ? "ok"
    : evAbs > 1
      ? "fail"
      : "warn";
  const aeColor =
    aeStatus === "ok"
      ? "bg-emerald-500/20 text-emerald-100 border-emerald-400/40"
      : aeStatus === "fail"
        ? "bg-red-500/25 text-red-50 border-red-400/50"
        : "bg-amber-500/20 text-amber-50 border-amber-400/40";
  const aeArrow = inBand ? "•" : evOffset > 0 ? "▼" : "▲";
  const aeAction = inBand
    ? "w paśmie"
    : evOffset > 0
      ? "przyciemnij scenę"
      : "rozjaśnij scenę";

  return (
    <div className="rounded-md border border-border/40 bg-black/55 px-2 py-1.5 text-[10px] text-white backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between gap-2 font-medium">
        <span className="shrink-0">Histogram (Y){reference ? " · vs ref" : ""}</span>
        <span className={`tabular-nums ${inBand ? "text-emerald-300" : "text-amber-300"}`}>
          μ {metrics.luminance.toFixed(2)} · target {target.toFixed(2)}
        </span>
      </div>
      <div
        className={`mb-1.5 flex items-center justify-between gap-2 rounded border px-1.5 py-1 text-[10px] tabular-nums ${aeColor}`}
        role="status"
        aria-label={`AE offset ${evOffset >= 0 ? "+" : ""}${evOffset.toFixed(1)} EV, ${aeAction}`}
      >
        <span className="font-semibold">
          AE {evOffset >= 0 ? "+" : ""}
          {evOffset.toFixed(1)} EV
        </span>
        <span className="opacity-90">
          <span className="mr-1 text-[12px] leading-none">{aeArrow}</span>
          {aeAction}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Histogram luminancji, średnia ${metrics.luminance.toFixed(2)}${
          reference ? `, referencja ${reference.luminance.toFixed(2)}` : ""
        }`}
      >
        {/* Target band */}
        <rect
          x={bandX}
          y={0}
          width={bandW}
          height={H}
          fill="rgb(16 185 129 / 0.18)"
          stroke="rgb(16 185 129 / 0.45)"
          strokeDasharray="2 2"
        />
        {/* Bars (current) */}
        {bins.map((v, i) => {
          const h = (v / max) * (H - 4);
          const x = i * barW;
          const isExtreme =
            (i === 0 && lowBad) || (i === bins.length - 1 && highBad);
          return (
            <rect
              key={i}
              x={x + 0.5}
              y={H - h}
              width={Math.max(0.5, barW - 1)}
              height={h}
              fill={isExtreme ? "rgb(248 113 113)" : "rgb(226 232 240 / 0.92)"}
            />
          );
        })}
        {/* Reference overlay (polyline) */}
        {refPoints && (
          <polyline
            points={refPoints}
            fill="none"
            stroke="rgb(56 189 248)"
            strokeWidth={1.25}
            strokeLinejoin="round"
            opacity={0.9}
          />
        )}
        {/* Reference mean line */}
        {reference && (
          <line
            x1={reference.luminance * W}
            x2={reference.luminance * W}
            y1={0}
            y2={H}
            stroke="rgb(56 189 248)"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        )}
        {/* Current mean line */}
        <line
          x1={meanX}
          x2={meanX}
          y1={0}
          y2={H}
          stroke={inBand ? "rgb(52 211 153)" : "rgb(251 191 36)"}
          strokeWidth={1.5}
        />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums">
        <ClipPip label="LOW" pct={clipLowPct} bad={lowBad} />
        <span className="text-white/60">
          band {lo.toFixed(2)}–{hi.toFixed(2)}
        </span>
        <ClipPip label="HIGH" pct={clipHighPct} bad={highBad} />
      </div>
      {reference && (
        <div className="mt-1 flex items-center justify-between gap-2 rounded bg-sky-500/10 px-1.5 py-1 text-[10px] tabular-nums text-sky-100">
          <span className="font-medium">
            Δμ{" "}
            <span
              className={
                Math.abs(dMean) < 0.02
                  ? "text-emerald-300"
                  : "text-amber-200"
              }
            >
              {dMean >= 0 ? "+" : ""}
              {dMean.toFixed(2)}
            </span>
          </span>
          <span>L1 {l1.toFixed(2)}</span>
          <span>EMD {emd.toFixed(3)}</span>
          {evRefOffset != null && (
            <span title="Różnica EV vs referencja">
              ΔEV {evOffset - evRefOffset >= 0 ? "+" : ""}
              {(evOffset - evRefOffset).toFixed(1)}
            </span>
          )}
          <span className="font-medium text-white/90">{dirHint}</span>
        </div>
      )}
    </div>
  );
}

function ClipPip({ label, pct, bad }: { label: string; pct: number; bad: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium " +
        (bad
          ? "bg-red-500/25 text-red-100"
          : pct > 0
            ? "bg-amber-500/15 text-amber-100"
            : "bg-emerald-500/15 text-emerald-100")
      }
    >
      <span className="opacity-80">{label}</span>
      <span>{pct.toFixed(1)}%</span>
    </span>
  );
}
