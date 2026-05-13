import { Timer, TrendingDown, TrendingUp, Minus, CheckCircle2, Loader2 } from "lucide-react";
import {
  summarizeAttempts,
  type AlignmentTrackerState,
} from "@/lib/camera/alignment-tracker";

interface Props {
  state: AlignmentTrackerState;
  /** Optional — used when no attempt is active to indicate "ready". */
  refAligned?: boolean;
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

export function AlignmentSummary({ state, refAligned }: Props) {
  const { current, last, history } = state;
  const stats = summarizeAttempts(history);

  // Hide entirely when there's nothing to show.
  if (!current && !last && history.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-border bg-card/60 p-2.5 space-y-2 text-[11px]"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" />
          Korekta dopasowania (przed migawką)
        </span>
        {!current && refAligned && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> gotowe
          </span>
        )}
      </div>

      {current && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-1.5 font-medium">
            <Loader2 className="h-3 w-3 animate-spin" /> Trwa korekta…
          </div>
          <div className="tabular-nums">
            {current.frames} {current.frames === 1 ? "klatka" : "klatek"} ·{" "}
            {fmtMs(current.durationMs)}
          </div>
        </div>
      )}

      {last && !current && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-emerald-700 dark:text-emerald-300">
          <div className="font-medium">Ostatnia korekta</div>
          <div className="tabular-nums">
            {last.frames} {last.frames === 1 ? "klatka" : "klatek"} ·{" "}
            {fmtMs(last.durationMs)} · ΔEV {last.finalEvAbs.toFixed(2)} · L1{" "}
            {last.finalL1.toFixed(2)}
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <Cell label="Korekt" value={`${stats.count}`} />
          <Cell
            label="Średnio"
            value={`${stats.avgFrames.toFixed(1)} kl. · ${fmtMs(stats.avgMs)}`}
          />
          <Cell
            label="Najlepiej"
            value={`${stats.bestFrames} kl. · ${fmtMs(stats.bestMs)}`}
          />
        </div>
      )}

      {stats && history.length >= 2 && (
        <SparkBars history={history.map((h) => h.frames)} slope={stats.framesSlope} />
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono tabular-nums">{value}</div>
    </div>
  );
}

function SparkBars({ history, slope }: { history: number[]; slope: number }) {
  const max = Math.max(1, ...history);
  const trendIcon =
    slope < -0.25 ? (
      <TrendingDown className="h-3 w-3 text-emerald-600 dark:text-emerald-300" />
    ) : slope > 0.25 ? (
      <TrendingUp className="h-3 w-3 text-amber-600 dark:text-amber-300" />
    ) : (
      <Minus className="h-3 w-3 text-muted-foreground" />
    );
  const trendLabel =
    slope < -0.25
      ? "skracasz korektę"
      : slope > 0.25
        ? "korekta wydłuża się"
        : "stabilnie";
  return (
    <div className="space-y-1">
      <div className="flex items-end gap-0.5 h-8" role="img" aria-label="Trend liczby klatek na korektę">
        {history.map((v, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${
              i === history.length - 1 ? "bg-primary" : "bg-primary/40"
            }`}
            style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
            title={`#${i + 1}: ${v} klatek`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Trend (klatki / korekta)</span>
        <span className="flex items-center gap-1">
          {trendIcon} {trendLabel}
        </span>
      </div>
    </div>
  );
}
