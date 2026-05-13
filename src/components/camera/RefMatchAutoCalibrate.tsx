import { useEffect, useRef, useState } from "react";
import { Wand2, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  computeRefMatchSuggestion,
  MIN_SAMPLES_FOR_CALIBRATION,
  RECOMMENDED_SAMPLES,
  type RefMatchSample,
  type RefMatchSuggestion,
} from "@/lib/camera/ref-match-autocalibrate";
import type { RefMatchThresholds } from "./ThresholdPanel";

interface Props {
  /** Live sample from StandardizedCamera (current frame vs active reference). null = brak referencji. */
  liveSample: RefMatchSample | null;
  /** Apply suggested thresholds. */
  onApply: (t: RefMatchThresholds) => void;
}

export function RefMatchAutoCalibrate({ liveSample, onApply }: Props) {
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState<RefMatchSample[]>([]);
  const [suggestion, setSuggestion] = useState<RefMatchSuggestion | null>(null);
  const lastTsRef = useRef(0);

  // Throttle to ~5 Hz to avoid duplicate identical samples in a tight render loop.
  useEffect(() => {
    if (!running || !liveSample) return;
    const now = performance.now();
    if (now - lastTsRef.current < 180) return;
    lastTsRef.current = now;
    setSamples((prev) => {
      if (prev.length >= RECOMMENDED_SAMPLES) return prev;
      return [...prev, liveSample];
    });
  }, [liveSample, running]);

  // Auto-stop once we hit the recommended count.
  useEffect(() => {
    if (running && samples.length >= RECOMMENDED_SAMPLES) {
      finishCalibration(samples);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples.length, running]);

  function startCalibration() {
    if (!liveSample) {
      toast.error("Brak aktywnej referencji histogramu — wybierz lub zapisz referencję.");
      return;
    }
    setSamples([]);
    setSuggestion(null);
    setRunning(true);
    toast.info("Auto-kalibracja: trzymaj kadr w typowej pozycji ~5 s.");
  }

  function stopEarly() {
    if (samples.length < MIN_SAMPLES_FOR_CALIBRATION) {
      setRunning(false);
      setSamples([]);
      toast.error(
        `Za mało próbek (${samples.length}/${MIN_SAMPLES_FOR_CALIBRATION}). Spróbuj ponownie.`,
      );
      return;
    }
    finishCalibration(samples);
  }

  function finishCalibration(buf: RefMatchSample[]) {
    setRunning(false);
    const s = computeRefMatchSuggestion(buf);
    if (!s) {
      toast.error("Nie udało się wyliczyć progów.");
      return;
    }
    setSuggestion(s);
  }

  function applySuggestion() {
    if (!suggestion) return;
    onApply(suggestion.thresholds);
    toast.success(
      `Zastosowano: ΔEV ≤ ${suggestion.thresholds.alignEv.toFixed(3)} · L1 ≤ ${suggestion.thresholds.alignL1.toFixed(3)}`,
    );
    setSuggestion(null);
  }

  function dismiss() {
    setSuggestion(null);
    setSamples([]);
  }

  if (suggestion) {
    const acc = (suggestion.predictedAcceptance * 100).toFixed(0);
    const tight = suggestion.predictedAcceptance < 0.85;
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 p-2.5 space-y-2 text-[11px]">
        <div className="flex items-center gap-1.5 font-semibold">
          <Wand2 className="h-3.5 w-3.5" />
          Sugerowane progi (n={suggestion.n})
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-muted-foreground">|ΔEV|</div>
            <div className="font-mono tabular-nums text-sm">
              ≤ {suggestion.thresholds.alignEv.toFixed(3)}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              P50 {suggestion.evStats.p50.toFixed(3)} · P90{" "}
              {suggestion.evStats.p90.toFixed(3)} · max{" "}
              {suggestion.evStats.max.toFixed(3)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">L1</div>
            <div className="font-mono tabular-nums text-sm">
              ≤ {suggestion.thresholds.alignL1.toFixed(3)}
            </div>
            <div className="text-[10px] text-muted-foreground tabular-nums">
              P50 {suggestion.l1Stats.p50.toFixed(3)} · P90{" "}
              {suggestion.l1Stats.p90.toFixed(3)} · max{" "}
              {suggestion.l1Stats.max.toFixed(3)}
            </div>
          </div>
        </div>
        <div
          className={`rounded px-2 py-1 text-[10px] ${
            tight
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          Przewidywana akceptacja: {acc}%{" "}
          {tight && "— próbki niespójne, rozważ powtórzenie kalibracji."}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" onClick={applySuggestion} className="flex-1">
            <Check className="h-3.5 w-3.5" /> Zastosuj
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            <X className="h-3.5 w-3.5" /> Odrzuć
          </Button>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Sugestia = P90 × 1.10 (margines bezpieczeństwa). Możesz ją następnie
          zapisać jako profil urządzenia.
        </p>
      </div>
    );
  }

  if (running) {
    const pct = Math.min(100, (samples.length / RECOMMENDED_SAMPLES) * 100);
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 p-2.5 space-y-2 text-[11px]">
        <div className="flex items-center gap-1.5 font-semibold">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Zbieram próbki ({samples.length}/{RECOMMENDED_SAMPLES})
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded bg-background">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Trzymaj kadr w typowej pozycji roboczej. Ruch / zmiana sceny zaburzy
          wynik.
        </p>
        <Button size="sm" variant="outline" onClick={stopEarly} className="w-full">
          Zakończ teraz
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-border p-2.5 space-y-1.5 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <Wand2 className="h-3.5 w-3.5" />
          Auto-kalibracja progów
        </span>
        <Button size="sm" variant="outline" onClick={startCalibration} className="h-7 text-[11px]">
          Start
        </Button>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Zbierze ~{RECOMMENDED_SAMPLES} próbek (|ΔEV|, L1) z bieżącej sceny i
        zaproponuje progi dające stabilną blokadę migawki dla tego urządzenia /
        warunków.
      </p>
    </div>
  );
}
