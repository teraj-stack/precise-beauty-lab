import { useMemo } from "react";
import type { ValidatedCapture } from "@/lib/camera/validate-capture";

interface Props {
  session: ValidatedCapture[];
  /** How many recent captures to display (newest first). Default 8. */
  limit?: number;
}

interface Stats {
  mu: number;
  dMu: number | null;
  l1: number | null;
  emd: number | null;
}

function histogramMean(h: number[]): number {
  // Center-of-mass on [0,1] over bin indices
  const n = h.length;
  if (n === 0) return 0;
  let total = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    total += h[i];
    sum += h[i] * (i / (n - 1));
  }
  return total > 0 ? sum / total : 0;
}

function l1Distance(a: number[], b: number[]): number {
  // Both histograms are expected to be normalized (Σ = 1). L1 ∈ [0, 2].
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s;
}

function earthMoversDistance(a: number[], b: number[]): number {
  // 1D EMD = Σ |CDFa[i] − CDFb[i]| over bins, normalized by (n-1) to [0,1].
  const n = Math.min(a.length, b.length);
  let acc = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    acc += a[i] - b[i];
    total += Math.abs(acc);
  }
  return total / Math.max(1, n - 1);
}

function fmtSigned(v: number, digits = 3) {
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}` : s;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return {
    time: d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    date: d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" }),
  };
}

function MiniHistogram({ histogram }: { histogram: number[] }) {
  const max = Math.max(...histogram, 0.001);
  return (
    <div className="flex h-6 w-20 items-end gap-[1px] rounded-sm border border-border bg-background/60 p-[1px]">
      {histogram.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] bg-foreground/70"
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function deltaTone(v: number, soft: number, hard: number): string {
  const a = Math.abs(v);
  if (a >= hard) return "text-destructive";
  if (a >= soft) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

export function HistogramHistory({ session, limit = 8 }: Props) {
  const rows = useMemo(() => {
    // Newest last → take last `limit`, then display newest first
    const tail = session.slice(-limit);
    const stats: Array<{ frame: ValidatedCapture; stats: Stats }> = tail.map((frame, idx) => {
      const cur = frame.qualityReport.metrics.histogram;
      const mu = histogramMean(cur);
      if (idx === 0) {
        return { frame, stats: { mu, dMu: null, l1: null, emd: null } };
      }
      const prev = tail[idx - 1].qualityReport.metrics.histogram;
      const prevMu = histogramMean(prev);
      return {
        frame,
        stats: {
          mu,
          dMu: mu - prevMu,
          l1: l1Distance(cur, prev),
          emd: earthMoversDistance(cur, prev),
        },
      };
    });
    return stats.reverse(); // newest first
  }, [session, limit]);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-md border border-border bg-background/60 p-3">
      <header className="mb-2 flex items-baseline justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Historia histogramów ({rows.length}/{limit})
        </h4>
        <p className="text-[10px] text-muted-foreground">
          Δ względem poprzedniego ujęcia · μ ∈ [0,1]
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[11px]">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="py-1 pr-2 text-left font-medium">#</th>
              <th className="py-1 pr-2 text-left font-medium">Czas</th>
              <th className="py-1 pr-2 text-left font-medium">Histogram</th>
              <th className="py-1 pr-2 text-right font-medium">μ</th>
              <th className="py-1 pr-2 text-right font-medium">Δμ</th>
              <th className="py-1 pr-2 text-right font-medium">L1</th>
              <th className="py-1 text-right font-medium">EMD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ frame, stats }, i) => {
              const t = fmtTime(frame.capturedAt);
              const ord = rows.length - i;
              return (
                <tr
                  key={frame.capturedAt + i}
                  className="border-b border-border/40 last:border-0"
                >
                  <td className="py-1.5 pr-2 font-mono text-muted-foreground">
                    {String(ord).padStart(2, "0")}
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="font-mono text-foreground">{t.time}</div>
                    <div className="text-[10px] text-muted-foreground">{t.date}</div>
                  </td>
                  <td className="py-1.5 pr-2">
                    <MiniHistogram histogram={frame.qualityReport.metrics.histogram} />
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono">{stats.mu.toFixed(3)}</td>
                  <td
                    className={`py-1.5 pr-2 text-right font-mono ${
                      stats.dMu === null ? "text-muted-foreground" : deltaTone(stats.dMu, 0.02, 0.05)
                    }`}
                  >
                    {stats.dMu === null ? "—" : fmtSigned(stats.dMu, 3)}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right font-mono ${
                      stats.l1 === null ? "text-muted-foreground" : deltaTone(stats.l1, 0.15, 0.35)
                    }`}
                  >
                    {stats.l1 === null ? "—" : stats.l1.toFixed(3)}
                  </td>
                  <td
                    className={`py-1.5 text-right font-mono ${
                      stats.emd === null ? "text-muted-foreground" : deltaTone(stats.emd, 0.02, 0.05)
                    }`}
                  >
                    {stats.emd === null ? "—" : stats.emd.toFixed(3)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        Próg podpowiedzi (orient.): Δμ ≥ 0.02 / EMD ≥ 0.02 → drift; L1 ≥ 0.15 →
        zmiana rozkładu. Wartości czerwone sygnalizują istotne odchylenie między
        kolejnymi ujęciami.
      </p>
    </section>
  );
}
