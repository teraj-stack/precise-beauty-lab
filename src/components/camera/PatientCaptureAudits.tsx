import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, FileJson, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listCaptureAuditsForPatient,
  type CaptureAuditRow,
} from "@/lib/camera/capture-audit-list.functions";

interface Props {
  patientId: string;
}

function decisionTone(decision: string): "default" | "secondary" | "destructive" {
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

export function PatientCaptureAudits({ patientId }: Props) {
  const fetchAudits = useServerFn(listCaptureAuditsForPatient);
  const [rows, setRows] = useState<CaptureAuditRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAudits({ data: { patientId, limit: 20 } });
      setRows(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać audytów");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium">Ostatnie audyty CV</span>
          {rows && (
            <span className="ml-2 text-muted-foreground">({rows.length})</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Odśwież
        </Button>
      </div>

      {error && (
        <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {loading && !rows && (
        <p className="text-xs text-muted-foreground">Ładowanie audytów…</p>
      )}

      {rows && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Brak zapisanych audytów dla tej pacjentki. Zarejestruj zdjęcie z aparatu i
          zapisz audyt — pojawi się tutaj wraz z raportem JSONB.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => {
            const isOpen = !!expanded[r.id];
            return (
              <li key={r.id} className="rounded-lg border border-border bg-card">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((s) => ({ ...s, [r.id]: !s[r.id] }))
                  }
                  className="flex w-full items-center justify-between gap-2 p-3 text-left"
                >
                  <div className="flex items-center gap-2 text-xs">
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <Badge variant={decisionTone(r.decision)} className="uppercase">
                      {r.decision}
                    </Badge>
                    <span className="font-mono">{fmt(r.captured_at)}</span>
                    <span className="text-muted-foreground">
                      · {r.image_width}×{r.image_height} ·{" "}
                      {(r.image_bytes / 1024).toFixed(0)} kB
                    </span>
                  </div>
                  <span className="hidden text-[10px] text-muted-foreground sm:inline">
                    profile {r.profile_version} · thr {r.thresholds_version}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-border p-3">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
                      <Field label="SHA-256" value={r.jpeg_sha256.slice(0, 16) + "…"} />
                      <Field label="Źródło" value={r.source} />
                      <Field label="Profil" value={r.profile_version} />
                      <Field label="Thresholds" value={r.thresholds_version} />
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <FileJson className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">Raport jakości (JSONB)</span>
                      <a
                        href={`data:application/json;charset=utf-8,${encodeURIComponent(
                          JSON.stringify(r.report, null, 2),
                        )}`}
                        download={`audit-${r.id}.json`}
                        className="ml-auto rounded border border-border px-2 py-0.5 hover:bg-muted"
                      >
                        Pobierz JSON
                      </a>
                    </div>
                    <pre className="max-h-80 overflow-auto rounded bg-muted/50 p-2 text-[10px] leading-snug">
                      {JSON.stringify(r.report, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono">{value}</dd>
    </div>
  );
}
