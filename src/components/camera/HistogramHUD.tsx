import type { FrameMetrics } from "@/lib/camera/types";
import { DEFAULT_THRESHOLDS } from "@/lib/camera/types";

interface Props {
  metrics: FrameMetrics;
  /** Mean R/G/B of ROI for AWB tint hint (optional — falls back to colorCast only). */
  meanRgb?: { r: number; g: number; b: number };
}

/**
 * Compact AE/AWB HUD widget:
 * - 32-bin luminance histogram with target band overlay (luminanceMin..Max)
 * - Mean luma marker
 * - Low/High clipping pips with %
 *
 * Pure SVG, no canvas, no deps. Re-renders ~5×/s with frame analysis.
 */
export function HistogramHUD({ metrics }: Props) {
  const bins = metrics.histogram;
  const max = Math.max(1e-6, ...bins);
  const W = 220;
  const H = 56;
  const barW = W / bins.length;

  const lo = DEFAULT_THRESHOLDS.luminanceMin;
  const hi = DEFAULT_THRESHOLDS.luminanceMax;
  const meanX = metrics.luminance * W;
  const bandX = lo * W;
  const bandW = (hi - lo) * W;

  const clipLowPct = metrics.clippingLow * 100;
  const clipHighPct = metrics.clippingHigh * 100;
  const clipMaxPct = DEFAULT_THRESHOLDS.clippingMax * 100;
  const lowBad = clipLowPct > clipMaxPct;
  const highBad = clipHighPct > clipMaxPct;
  const inBand = metrics.luminance >= lo && metrics.luminance <= hi;

  return (
    <div className="rounded-md border border-border/40 bg-black/55 px-2 py-1.5 text-[10px] text-white backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between font-medium">
        <span>Histogram (Y)</span>
        <span className={inBand ? "text-emerald-300" : "text-amber-300"}>
          μ {metrics.luminance.toFixed(2)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Histogram luminancji, średnia ${metrics.luminance.toFixed(2)}`}
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
        {/* Bars */}
        {bins.map((v, i) => {
          const h = (v / max) * (H - 4);
          const x = i * barW;
          // Tint extreme bins red if they exceed clipMax
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
        {/* Mean line */}
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
