import { useEffect, useMemo, useState } from "react";
import { Wand2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CONDITION_TOKEN_SUGGESTIONS,
  pickBestReference,
  shouldSwitchTo,
  type CurrentFrameConditions,
  type ReferenceMatchScore,
} from "@/lib/camera/hist-reference-auto";
import type { StoredHistogramReference } from "@/lib/camera/hist-reference-library";

const STORAGE_ENABLED = "msc:hist-ref-auto:enabled:v1";
const STORAGE_TOKENS = "msc:hist-ref-auto:tokens:v1";

interface Props {
  library: StoredHistogramReference[];
  activeId: string | null;
  /** Current frame metrics (null when no frame yet). */
  current: { histogram: number[]; luminance: number } | null;
  onActivate: (id: string | null) => void;
  /** Hide entirely when external preset overrides everything. */
  disabled?: boolean;
}

function loadEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_ENABLED) === "1";
}

function loadTokens(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_TOKENS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function AutoReferenceSelector({
  library,
  activeId,
  current,
  onActivate,
  disabled,
}: Props) {
  const [enabled, setEnabled] = useState<boolean>(() => loadEnabled());
  const [tokens, setTokens] = useState<string[]>(() => loadTokens());

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_ENABLED, enabled ? "1" : "0");
  }, [enabled]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_TOKENS, JSON.stringify(tokens));
  }, [tokens]);

  const conditions = useMemo<CurrentFrameConditions | null>(() => {
    if (!current) return null;
    return {
      histogram: current.histogram,
      luminance: current.luminance,
      conditionTokens: tokens,
    };
  }, [current, tokens]);

  const pick = useMemo(() => {
    if (!conditions) return null;
    return pickBestReference(library, conditions);
  }, [library, conditions]);

  // Apply selection (with hysteresis) when enabled.
  useEffect(() => {
    if (!enabled || disabled || !pick) return;
    const next = shouldSwitchTo(pick.ranked, activeId);
    if (next && next.ref.id !== activeId) onActivate(next.ref.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, disabled, pick?.best.ref.id, pick?.best.score, activeId]);

  function toggleToken(token: string) {
    setTokens((prev) =>
      prev.includes(token) ? prev.filter((t) => t !== token) : [...prev, token],
    );
  }

  const bestScore = pick?.best;
  const isActiveBest = bestScore && bestScore.ref.id === activeId;

  return (
    <div className="rounded-md border border-border/70 bg-muted/30 p-2.5 space-y-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <Wand2 className="h-3.5 w-3.5" />
          Auto-wybór referencji
        </span>
        <Button
          type="button"
          size="sm"
          variant={enabled ? "default" : "outline"}
          onClick={() => setEnabled((e) => !e)}
          disabled={disabled || library.length === 0}
          className="h-7 px-2 text-[11px]"
        >
          {enabled ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Włączony
            </>
          ) : (
            "Włącz"
          )}
        </Button>
      </div>

      {disabled && (
        <p className="text-amber-600 dark:text-amber-300">
          Aktywny preset kalibracyjny — auto-wybór nieaktywny.
        </p>
      )}

      {library.length === 0 && (
        <p className="text-muted-foreground">
          Dodaj co najmniej jedną referencję, aby włączyć auto-wybór.
        </p>
      )}

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Aktualne warunki (wskazówka dla doboru):
        </div>
        <div className="flex flex-wrap gap-1">
          {CONDITION_TOKEN_SUGGESTIONS.map((s) => {
            const on = tokens.includes(s.token);
            return (
              <button
                key={s.token}
                type="button"
                onClick={() => toggleToken(s.token)}
                className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
                aria-pressed={on}
              >
                {s.label}
                {on && <X className="ml-1 inline h-2.5 w-2.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {bestScore && (
        <div
          className={`rounded border px-2 py-1.5 ${
            isActiveBest
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-background"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">
              Sugestia: {bestScore.ref.label ?? "(bez etykiety)"}
            </span>
            <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
              score {bestScore.score.toFixed(2)}
            </span>
          </div>
          <div className="text-[10px] tabular-nums text-muted-foreground">
            L1 {bestScore.histogramL1.toFixed(2)} · ΔEV{" "}
            {bestScore.evDelta >= 0 ? "+" : ""}
            {bestScore.evDelta.toFixed(2)} · pora {bestScore.hourDiff.toFixed(1)} h
            {tokens.length > 0 && (
              <>
                {" "}· trafienia tagów{" "}
                {Math.round((1 - bestScore.conditionMiss) * tokens.length)}/
                {tokens.length}
              </>
            )}
          </div>
          {!enabled && !isActiveBest && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onActivate(bestScore.ref.id)}
              className="mt-1 h-6 text-[10px]"
            >
              Aktywuj sugerowaną
            </Button>
          )}
          {isActiveBest && (
            <div className="mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-300">
              ✓ Aktywna referencja jest aktualnie najlepszym dopasowaniem.
            </div>
          )}
        </div>
      )}

      {pick && pick.ranked.length > 1 && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Pokaż ranking ({pick.ranked.length})
          </summary>
          <ol className="mt-1 space-y-0.5">
            {pick.ranked.slice(0, 5).map((r, i) => (
              <li
                key={r.ref.id}
                className="flex items-center justify-between gap-2 tabular-nums"
              >
                <span className="truncate">
                  {i + 1}. {r.ref.label ?? "(bez etykiety)"}
                </span>
                <span className="text-muted-foreground">{r.score.toFixed(2)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <p className="leading-snug text-[10px] text-muted-foreground">
        Łączy podobieństwo histogramu, |ΔEV|, porę dnia i tagi warunków. Włączone
        — przełącza referencję automatycznie z histerezą (zapobiega skakaniu).
      </p>
    </div>
  );
}
