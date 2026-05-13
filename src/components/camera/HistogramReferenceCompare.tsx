/**
 * Side-by-side comparison of the active histogram reference vs the current
 * live frame: overlaid histograms, per-bin difference, and headline metrics
 * (Δμ luminance, ΔEV, L1, bins changed).
 */

import { useMemo } from "react";
import { GitCompare } from "lucide-react";

interface Props {
  current: { histogram: number[]; luminance: number };
  reference: {
    histogram: number[];
    luminance: number;
    label?: string;
    capturedAt?: number;
  };
  /** Optional alignment threshold for L1 — values above are flagged red. */
  alignL1?: number;
  /** Optional alignment threshold for |ΔEV| — values above are flagged red. */
  alignEv?: number;
}

const BAR_HEIGHT = 56;
const DIFF_HEIGHT = 36;
const SIGNIFICANT_BIN_DIFF = 0.005;

function maxOf(arr: number[]): number {
  let m = 0;
  for (const v of arr) if (v > m) m = v;
  return m;
}

export function HistogramReferenceCompare({
  current,
  reference,
  alignL1 = 0.45,
  alignEv = 1 / 6,
}: Props) {
  const stats = useMemo(() => {
    const a = current.histogram;
    const b = reference.histogram;
    const n = Math.min(a.length, b.length);
    let l1 = 0;
    let binsChanged = 0;
    let maxBin = 0;
    let maxDiff = 0;
    const diff: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const d = a[i] - b[i];
      diff[i] = d;
      const ad = Math.abs(d);
      l1 += ad;
      if (ad >= SIGNIFICANT_BIN_DIFF) binsChanged += 1;
      if (a[i] > maxBin) maxBin = a[i];
      if (b[i] > maxBin) maxBin = b[i];
      if (ad > maxDiff) maxDiff = ad;
    }
    const dMu = current.luminance - reference.luminance;
    const evDelta = Math.log2(
      Math.max(0.001, current.luminance) / Math.max(0.001, reference.luminance),
    );
    return { l1, binsChanged, maxBin, maxDiff, diff, dMu, evDelta, n };
  }, [current.histogram, current.luminance, reference.histogram, reference.luminance]);

  const evHot = Math.abs(stats.evDelta) > alignEv;
  const l1Hot = stats.l1 > alignL1;

  const refDate = reference.capturedAt
    ? new Date(reference.capturedAt).toLocaleString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold flex items-center gap-1.5">
          <GitCompare className="h-3.5 w-3.5" />
          Porównanie z referencją
        </span>
        <span className="truncate text-[10px] text-muted-foreground">
          {reference.label ?? "(bez etykiety)"}
          {refDate ? ` · ${refDate}` : ""}
        </span>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <Cell
          label="Δμ"
          value={`${stats.dMu >= 0 ? "+" : ""}${stats.dMu.toFixed(3)}`}
        />
        <Cell
          label="ΔEV"
          value={`${stats.evDelta >= 0 ? "+" : ""}${stats.evDelta.toFixed(2)}`}
          tone={evHot ? "warn" : "ok"}
        />
        <Cell
          label="L1"
          value={stats.l1.toFixed(3)}
          tone={l1Hot ? "warn" : "ok"}
        />
        <Cell label="Δbiny" value={`${stats.binsChanged}/${stats.n}`} />
      </div>

      {/* Overlaid histograms */}
      <div>
        <div
          className="flex items-end gap-px rounded bg-muted/40 px-1 py-1"
          style={{ height: BAR_HEIGHT }}
          role="img"
          aria-label="Histogram referencyjny i bieżący nałożone"
        >
          {Array.from({ length: stats.n }).map((_, i) => {
            const cur = current.histogram[i] ?? 0;
            const ref = reference.histogram[i] ?? 0;
            const cH = stats.maxBin > 0 ? (cur / stats.maxBin) * 100 : 0;
            const rH = stats.maxBin > 0 ? (ref / stats.maxBin) * 100 : 0;
            return (
              <div key={i} className="relative flex-1" style={{ height: "100%" }}>
                {/* reference (ghost) */}
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-sm bg-muted-foreground/40"
                  style={{ height: `${rH}%` }}
                />
                {/* current (foreground) */}
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-sm bg-primary/70"
                  style={{ height: `${cH}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-primary/70" />
            bieżąca
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/40" />
            referencja
          </span>
        </div>
      </div>

      {/* Per-bin difference (signed: above zero = current > reference) */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
          Różnica per bin (bieżąca − referencja)
        </div>
        <div
          className="relative flex items-center gap-px rounded bg-muted/40 px-1"
          style={{ height: DIFF_HEIGHT }}
          role="img"
          aria-label="Różnica histogramów per bin"
        >
          {/* zero line */}
          <div
            className="absolute left-0 right-0 border-t border-border/70"
            style={{ top: "50%" }}
          />
          {stats.diff.map((d, i) => {
            const h = stats.maxDiff > 0 ? (Math.abs(d) / stats.maxDiff) * 48 : 0;
            const positive = d >= 0;
            return (
              <div
                key={i}
                className="relative flex-1"
                style={{ height: "100%" }}
                title={`bin ${i}: ${d >= 0 ? "+" : ""}${d.toFixed(4)}`}
              >
                <div
                  className={`absolute left-0 right-0 rounded-sm ${
                    positive ? "bg-emerald-500/70" : "bg-amber-500/70"
                  }`}
                  style={{
                    height: `${h}%`,
                    top: positive ? `${50 - h}%` : "50%",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/70" />
            jaśniej niż ref.
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/70" />
            ciemniej niż ref.
          </span>
        </div>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const cls =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : tone === "ok"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "border-border bg-background";
  return (
    <div className={`rounded border px-1.5 py-1 ${cls}`}>
      <div className="text-[9px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="font-mono tabular-nums">{value}</div>
    </div>
  );
}
