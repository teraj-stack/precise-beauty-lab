/**
 * Live-tunable thresholds overlay for the Standardized Camera.
 *
 * Lets the operator override luminanceMin/Max and clippingLowMax/HighMax
 * for the LIVE profile (HUD gates) without leaving the capture screen.
 * Persists overrides in localStorage; CAPTURE-time thresholds are NOT
 * mutated — final reject/accept decision keeps the audited profile.
 */

import { useEffect, useState } from "react";
import { Sliders, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  QUALITY_PROFILE_V1,
  type QualityProfile,
} from "@/lib/camera/quality-profiles";
import type { QualityThresholds } from "@/lib/camera/types";

const STORAGE_KEY = "msc:threshold-overrides:v1";

type TunableKey =
  | "luminanceMin"
  | "luminanceMax"
  | "clippingLowMax"
  | "clippingHighMax";

export type ThresholdOverrides = Partial<Pick<QualityThresholds, TunableKey>>;

export function loadOverrides(): ThresholdOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ThresholdOverrides;
  } catch {
    return {};
  }
}

function saveOverrides(o: ThresholdOverrides) {
  if (typeof window === "undefined") return;
  if (Object.keys(o).length === 0) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
}

export function applyOverrides(
  base: QualityProfile,
  overrides: ThresholdOverrides,
): QualityProfile {
  if (!overrides || Object.keys(overrides).length === 0) return base;
  return {
    ...base,
    version: `${base.version}+ovr`,
    live: { ...base.live, ...overrides },
    // CAPTURE thresholds are intentionally untouched (audit-pinned).
    capture: base.capture,
  };
}

interface Props {
  /** Current effective LIVE thresholds (after overrides). Used to seed inputs. */
  current: QualityThresholds;
  /** Profile being mutated (defaults to QUALITY_PROFILE_V1.live for the reset baseline). */
  baseline?: QualityThresholds;
  onChange: (next: ThresholdOverrides) => void;
}

const FIELDS: Array<{
  key: TunableKey;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}> = [
  {
    key: "luminanceMin",
    label: "Luminancja MIN (ROI)",
    min: 0.1,
    max: 0.6,
    step: 0.01,
    hint: "Poniżej = za ciemno",
  },
  {
    key: "luminanceMax",
    label: "Luminancja MAX (ROI)",
    min: 0.4,
    max: 0.95,
    step: 0.01,
    hint: "Powyżej = za jasno",
  },
  {
    key: "clippingLowMax",
    label: "Clipping LOW MAX (ROI)",
    min: 0,
    max: 0.2,
    step: 0.005,
    hint: "Frakcja pikseli ≤2/255",
  },
  {
    key: "clippingHighMax",
    label: "Clipping HIGH MAX (ROI)",
    min: 0,
    max: 0.2,
    step: 0.005,
    hint: "Frakcja pikseli ≥253/255",
  },
];

export function ThresholdPanel({ current, baseline, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ThresholdOverrides>(() => loadOverrides());

  // Re-sync draft if external `current` changes (e.g. profile swap).
  useEffect(() => {
    setDraft(loadOverrides());
  }, []);

  const base = baseline ?? QUALITY_PROFILE_V1.live;
  const dirty = Object.keys(draft).length > 0;

  function update(key: TunableKey, value: number) {
    const next: ThresholdOverrides = { ...draft, [key]: value };
    // Enforce min < max ordering.
    if (key === "luminanceMin" && next.luminanceMax != null && value >= next.luminanceMax) {
      next.luminanceMax = Math.min(0.95, value + 0.05);
    }
    if (key === "luminanceMax" && next.luminanceMin != null && value <= next.luminanceMin) {
      next.luminanceMin = Math.max(0.1, value - 0.05);
    }
    setDraft(next);
    saveOverrides(next);
    onChange(next);
  }

  function resetAll() {
    setDraft({});
    saveOverrides({});
    onChange({});
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-xs"
      >
        <Sliders className="h-3.5 w-3.5" />
        Progi {dirty ? "(custom)" : ""}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-semibold flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5" />
          Progi LIVE (HUD) — ROI
        </div>
        <div className="flex items-center gap-1">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={resetAll} className="h-7 px-2 text-[11px]">
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            className="h-7 px-2"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid gap-2.5">
        {FIELDS.map((f) => {
          const value = (draft[f.key] ?? current[f.key]) as number;
          const baseVal = base[f.key];
          const isOverridden = draft[f.key] != null && draft[f.key] !== baseVal;
          return (
            <label key={f.key} className="grid gap-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {f.label}
                  {isOverridden && (
                    <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-300">
                      override
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {value.toFixed(3)}
                  {isOverridden && (
                    <span className="ml-1 text-[10px] opacity-70">
                      (base {baseVal.toFixed(3)})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={value}
                  onChange={(e) => update(f.key, parseFloat(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={value}
                  onChange={(e) => update(f.key, parseFloat(e.target.value))}
                  className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-right text-[11px] tabular-nums"
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{f.hint}</span>
            </label>
          );
        })}
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground">
        Zmiany dotyczą tylko progów LIVE (HUD). Progi CAPTURE (final reject) są
        wersjonowane w profilu jakości i nie mogą być nadpisane z UI.
      </p>
    </div>
  );
}
