import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileJson,
  Filter,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  searchCaptureAudits,
  type AuditSearchResult,
} from "@/lib/camera/capture-audit-search.functions";
import type { CaptureAuditRow } from "@/lib/camera/capture-audit-list.functions";
import { IntegrityBadge } from "@/components/camera/IntegrityBadge";

type AuditsSearch = { sha?: string; open?: string };

export const Route = createFileRoute("/audits")({
  validateSearch: (s: Record<string, unknown>): AuditsSearch => {
    const sha = typeof s.sha === "string" ? s.sha.replace(/[^a-fA-F0-9]/g, "").slice(0, 64) : undefined;
    const open = typeof s.open === "string" ? s.open.slice(0, 64) : undefined;
    return { sha: sha || undefined, open: open || undefined };
  },
  head: () => ({
    meta: [
      { title: "Audyt jakości — MySkinCode" },
      {
        name: "description",
        content:
          "Przeglądaj audyty jakości capture: filtruj po dacie, decyzji, źródle oraz wyszukuj po SHA-256.",
      },
    ],
  }),
  component: AuditsPage,
});

const DECISIONS = ["accept", "review", "reject"] as const;
const SOURCES = ["jpeg-com", "manual", "import"] as const;

type FiltersState = {
  from: string;
  to: string;
  decision: string;
  source: string;
  sha256: string;
};

const EMPTY: FiltersState = {
  from: "",
  to: "",
  decision: "",
  source: "",
  sha256: "",
};

function decisionTone(
  decision: string,
): "default" | "secondary" | "destructive" {
  const d = decision.toLowerCase();
  if (d.includes("accept") || d === "ok") return "default";
  if (d.includes("reject") || d.includes("fail")) return "destructive";
  return "secondary";
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString("pl-PL");
  } catch {
    return ts;
  }
}

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function AuditsPage() {
  const search = useServerFn(searchCaptureAudits);
  const { sha: shaParam, open: openParam } = Route.useSearch();
  const initial: FiltersState = useMemo(
    () => (shaParam ? { ...EMPTY, sha256: shaParam } : EMPTY),
    [shaParam],
  );
  const [filters, setFilters] = useState<FiltersState>(initial);
  const [applied, setApplied] = useState<FiltersState>(initial);
  const [result, setResult] = useState<AuditSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    openParam ? { [openParam]: true } : {},
  );
  const highlightId = openParam ?? null;
  const highlightRef = useRef<HTMLLIElement | null>(null);

  const run = async (f: FiltersState) => {
    setLoading(true);
    setError(null);
    try {
      const res = await search({
        data: {
          from: toIso(f.from),
          to: toIso(f.to),
          decision: f.decision || undefined,
          source: f.source || undefined,
          sha256: f.sha256.trim() || undefined,
          limit: 100,
        },
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd zapytania");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.sha256]);

  // Scroll to highlighted row once results land
  useEffect(() => {
    if (!highlightId || !result) return;
    const t = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => clearTimeout(t);
  }, [highlightId, result]);

  const activeCount = useMemo(
    () => Object.values(applied).filter((v) => v && v.length > 0).length,
    [applied],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied(filters);
    void run(filters);
  };

  const reset = () => {
    setFilters(EMPTY);
    setApplied(EMPTY);
    void run(EMPTY);
  };

  return (
    <div className="min-h-full bg-beige-soft">
      <header className="hairline border-x-0 border-t-0 bg-background/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-navy">
                Audyt jakości
              </h1>
              <p className="text-xs text-muted-foreground">
                Przegląd capture_audits z filtrami i wyszukiwaniem po SHA-256
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void run(applied)}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Odśwież
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-6 py-6">
        <Card className="p-4">
          <form
            onSubmit={onSubmit}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
          >
            <div className="space-y-1">
              <Label htmlFor="f-from" className="text-xs">
                Od
              </Label>
              <Input
                id="f-from"
                type="datetime-local"
                value={filters.from}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, from: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="f-to" className="text-xs">
                Do
              </Label>
              <Input
                id="f-to"
                type="datetime-local"
                value={filters.to}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, to: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Decyzja</Label>
              <Select
                value={filters.decision || "__all"}
                onValueChange={(v) =>
                  setFilters((s) => ({ ...s, decision: v === "__all" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wszystkie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Wszystkie</SelectItem>
                  {DECISIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Źródło</Label>
              <Select
                value={filters.source || "__all"}
                onValueChange={(v) =>
                  setFilters((s) => ({ ...s, source: v === "__all" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wszystkie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Wszystkie</SelectItem>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="f-sha" className="text-xs">
                SHA-256 (prefiks lub pełny)
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="f-sha"
                  placeholder="np. 9f3ac1…"
                  value={filters.sha256}
                  onChange={(e) =>
                    setFilters((s) => ({
                      ...s,
                      sha256: e.target.value.replace(/[^a-fA-F0-9]/g, ""),
                    }))
                  }
                  className="pl-7 font-mono text-xs"
                  maxLength={64}
                />
              </div>
            </div>

            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
              <Button type="submit" disabled={loading}>
                <Filter className="h-3.5 w-3.5" />
                Zastosuj filtry
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                disabled={loading}
              >
                <X className="h-3.5 w-3.5" />
                Wyczyść
              </Button>
              {activeCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  Aktywnych filtrów: {activeCount}
                </span>
              )}
              <div className="ml-auto text-xs text-muted-foreground">
                {result ? (
                  <>
                    Wyników: <span className="font-semibold">{result.rows.length}</span>
                    {result.truncated && " (limit 100)"}
                  </>
                ) : null}
              </div>
            </div>
          </form>
        </Card>

        {error && (
          <p className="rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}

        {loading && !result && (
          <p className="text-xs text-muted-foreground">Ładowanie audytów…</p>
        )}

        {result && result.rows.length === 0 && !loading && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Brak audytów pasujących do wybranych filtrów.
          </Card>
        )}

        {result && result.rows.length > 0 && (
          <ul className="space-y-2">
            {result.rows.map((r) => (
              <AuditRow
                key={r.id}
                row={r}
                open={!!expanded[r.id]}
                onToggle={() =>
                  setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))
                }
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function AuditRow({
  row,
  open,
  onToggle,
}: {
  row: CaptureAuditRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <Badge variant={decisionTone(row.decision)} className="uppercase">
            {row.decision}
          </Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            {row.source}
          </Badge>
          <span className="font-mono">{fmt(row.captured_at)}</span>
          <span className="text-muted-foreground">
            · {row.image_width}×{row.image_height} ·{" "}
            {(row.image_bytes / 1024).toFixed(0)} kB
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {row.jpeg_sha256.slice(0, 12)}…
          </span>
        </div>
        <span className="hidden text-[10px] text-muted-foreground sm:inline">
          profile {row.profile_version} · thr {row.thresholds_version}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
            <Field label="SHA-256 (full)" value={row.jpeg_sha256} />
            <Field label="Źródło" value={row.source} />
            <Field label="Profil" value={row.profile_version} />
            <Field label="Thresholds" value={row.thresholds_version} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <FileJson className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">Raport jakości (JSONB)</span>
            <IntegrityBadge report={row.report} />
            <a
              href={`data:application/json;charset=utf-8,${encodeURIComponent(
                JSON.stringify(row.report, null, 2),
              )}`}
              download={`audit-${row.id}.json`}
              className="ml-auto rounded border border-border px-2 py-0.5 hover:bg-muted"
            >
              Pobierz JSON
            </a>
          </div>
          <pre className="max-h-80 overflow-auto rounded bg-muted/50 p-2 text-[10px] leading-snug">
            {JSON.stringify(row.report, null, 2)}
          </pre>
        </div>
      )}
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono">{value}</dd>
    </div>
  );
}
