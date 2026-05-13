import type { CaptureQualityReport } from "@/lib/camera/capture-metadata";

interface Props {
  report: CaptureQualityReport;
}

const STATUS_STYLES: Record<string, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  fail: "border-destructive/40 bg-destructive/10 text-destructive",
};

function Sparkline({
  values,
  color,
  height = 28,
  width = 120,
}: {
  values: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (!values || values.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground"
        style={{ height, width }}
      >
        za mało próbek
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`)
    .join(" ");
  const meanY = height - ((values.reduce((a, b) => a + b, 0) / values.length - min) / range) * (height - 4) - 2;
  return (
    <svg width={width} height={height} className="block">
      <line
        x1={0}
        x2={width}
        y1={meanY}
        y2={meanY}
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeDasharray="2 3"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HistogramBars({ histogram }: { histogram: number[] }) {
  const max = Math.max(...histogram, 0.001);
  return (
    <div className="flex h-10 items-end gap-[1px] rounded border border-border bg-background/60 p-0.5">
      {histogram.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-foreground/70"
          style={{ height: `${(v / max) * 100}%` }}
          title={`bin ${i}: ${(v * 100).toFixed(2)}%`}
        />
      ))}
    </div>
  );
}

export function CaptureReportDetails({ report }: Props) {
  const m = report.metrics;
  const t = report.temporal;
  const lumSeries = t.luminanceSeries ?? [];
  const castSeries = t.colorCastSeries ?? [];

  const metricRows: Array<[string, string]> = [
    ["Luminancja", m.luminance.toFixed(3)],
    ["Ostrość (LapVar)", m.sharpness.toFixed(0)],
    ["Clipping", `${(m.clipping * 100).toFixed(2)}%`],
    ["  ↳ ciemne", `${(m.clippingLow * 100).toFixed(2)}%`],
    ["  ↳ jasne", `${(m.clippingHigh * 100).toFixed(2)}%`],
    ["Color cast", `${(m.colorCast * 100).toFixed(2)}%`],
    ["Skin ratio", `${(m.skinRatio * 100).toFixed(0)}%`],
    ["Center offset", m.centerOffset.toFixed(3)],
    ["ROI px", m.roiPixels.toLocaleString("pl-PL")],
  ];

  return (
    <details className="rounded-lg border border-border bg-background/60 text-[11px]">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
        Szczegóły raportu jakości
        <span className="ml-2 text-muted-foreground">
          {report.profileVersion} · {report.thresholdsVersion}
        </span>
      </summary>

      <div className="space-y-4 px-3 pb-3 pt-1">
        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Bramki ({report.gates.length})
          </h4>
          <ul className="space-y-1">
            {report.gates.map((g) => (
              <li
                key={g.id}
                className={`flex items-start justify-between gap-2 rounded border px-2 py-1 ${STATUS_STYLES[g.status] ?? STATUS_STYLES.warn}`}
              >
                <div className="min-w-0">
                  <div className="font-medium">{g.label}</div>
                  <div className="truncate text-[10px] opacity-80" title={g.detail}>
                    {g.detail || "—"}
                  </div>
                </div>
                <span className="shrink-0 rounded bg-background/60 px-1.5 py-0.5 text-[10px] font-mono uppercase">
                  {g.status}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Metryki klatki
          </h4>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
            {metricRows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd className="text-right font-mono text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Histogram (32 bins)
          </h4>
          <HistogramBars histogram={m.histogram} />
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                AE — luminancja
              </h4>
              <span className="font-mono text-[10px] text-muted-foreground">
                σ {t.luminanceStd.toFixed(4)}
              </span>
            </div>
            <div className="text-emerald-600 dark:text-emerald-400">
              <Sparkline values={lumSeries} color="currentColor" />
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {t.samples} próbek
            </p>
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                AWB — color cast
              </h4>
              <span className="font-mono text-[10px] text-muted-foreground">
                σ {t.colorCastStd.toFixed(4)}
              </span>
            </div>
            <div className="text-sky-600 dark:text-sky-400">
              <Sparkline values={castSeries} color="currentColor" />
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {t.samples} próbek
            </p>
          </div>
        </section>

        {report.reasons.length > 0 && (
          <section>
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Powody odrzucenia
            </h4>
            <ul className="list-disc pl-4 text-muted-foreground">
              {report.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </details>
  );
}
