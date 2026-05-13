import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { verifyReportIntegrity } from "@/lib/camera/parser-integrity";

interface Props {
  report: unknown;
}

export function IntegrityBadge({ report }: Props) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; signature: string; parserVersion: string }
    | { kind: "missing" }
    | { kind: "mismatch"; expected?: string; got?: string }
    | { kind: "unknown-algo" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    verifyReportIntegrity(report).then((v) => {
      if (cancelled) return;
      if (v.ok) {
        setState({ kind: "ok", signature: v.signature, parserVersion: v.parserVersion });
      } else if (v.reason === "no-envelope") {
        setState({ kind: "missing" });
      } else if (v.reason === "mismatch") {
        setState({ kind: "mismatch", expected: v.expected, got: v.got });
      } else {
        setState({ kind: "unknown-algo" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [report]);

  if (state.kind === "loading") {
    return <span className="text-[10px] text-muted-foreground">Weryfikuję…</span>;
  }
  if (state.kind === "ok") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700"
        title={`Podpis: ${state.signature}\nParser: ${state.parserVersion}`}
      >
        <ShieldCheck className="h-3 w-3" />
        Integralność OK · {state.parserVersion} · {state.signature.slice(0, 10)}…
      </span>
    );
  }
  if (state.kind === "missing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
        <ShieldQuestion className="h-3 w-3" />
        Brak podpisu (rekord sprzed v1)
      </span>
    );
  }
  if (state.kind === "unknown-algo") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
        <ShieldQuestion className="h-3 w-3" />
        Nieznany algorytm podpisu
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-destructive/50 bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive"
      title={`Oczekiwano: ${state.expected ?? "?"}\nW rekordzie: ${state.got ?? "?"}`}
    >
      <ShieldAlert className="h-3 w-3" />
      Niezgodny podpis — rekord zmodyfikowany
    </span>
  );
}
