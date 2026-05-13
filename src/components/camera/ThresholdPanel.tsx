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
import {
  loadActiveRefMatchProfileId,
  loadRefMatchProfiles,
  saveActiveRefMatchProfileId,
  saveRefMatchProfiles,
  type RefMatchProfile,
} from "@/lib/camera/ref-match-profiles";
import { RefMatchProfiles } from "./RefMatchProfiles";
import { RefMatchAutoCalibrate } from "./RefMatchAutoCalibrate";

const STORAGE_KEY = "msc:threshold-overrides:v1";
const REF_MATCH_STORAGE_KEY = "msc:ref-match-thresholds:v1";

type TunableKey =
  | "luminanceMin"
  | "luminanceMax"
  | "clippingLowMax"
  | "clippingHighMax";

export type ThresholdOverrides = Partial<Pick<QualityThresholds, TunableKey>>;

/** Reference-match thresholds (shutter gate vs saved histogram reference). */
export type RefMatchThresholds = {
  /** Max |ΔEV| (in EV) allowed between current frame and reference. */
  alignEv: number;
  /** Max L1 distance between normalized histograms allowed. */
  alignL1: number;
};

export const DEFAULT_REF_MATCH: RefMatchThresholds = {
  alignEv: 1 / 6, // ½ kroku 1/3 EV
  alignL1: 0.45,
};

export function loadRefMatchThresholds(): RefMatchThresholds {
  if (typeof window === "undefined") return { ...DEFAULT_REF_MATCH };
  try {
    const raw = window.localStorage.getItem(REF_MATCH_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_REF_MATCH };
    const parsed = JSON.parse(raw) as Partial<RefMatchThresholds>;
    return {
      alignEv:
        typeof parsed.alignEv === "number" && parsed.alignEv > 0 && parsed.alignEv <= 1
          ? parsed.alignEv
          : DEFAULT_REF_MATCH.alignEv,
      alignL1:
        typeof parsed.alignL1 === "number" && parsed.alignL1 > 0 && parsed.alignL1 <= 2
          ? parsed.alignL1
          : DEFAULT_REF_MATCH.alignL1,
    };
  } catch {
    return { ...DEFAULT_REF_MATCH };
  }
}

function saveRefMatchThresholds(t: RefMatchThresholds) {
  if (typeof window === "undefined") return;
  const isDefault =
    t.alignEv === DEFAULT_REF_MATCH.alignEv && t.alignL1 === DEFAULT_REF_MATCH.alignL1;
  if (isDefault) window.localStorage.removeItem(REF_MATCH_STORAGE_KEY);
  else window.localStorage.setItem(REF_MATCH_STORAGE_KEY, JSON.stringify(t));
}

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
  /** Reference-match thresholds (shutter gate vs saved histogram reference). */
  refMatch?: RefMatchThresholds;
  onRefMatchChange?: (next: RefMatchThresholds) => void;
  /** Live sample {evDelta, l1} from current frame vs active reference (for auto-calibration). */
  liveRefSample?: { evDelta: number; l1: number } | null;
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

export function ThresholdPanel({ current, baseline, onChange, refMatch, onRefMatchChange, liveRefSample }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ThresholdOverrides>(() => loadOverrides());
  const [refDraft, setRefDraft] = useState<RefMatchThresholds>(
    () => refMatch ?? loadRefMatchThresholds(),
  );
  const [profiles, setProfiles] = useState<RefMatchProfile[]>(() => loadRefMatchProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string | null>(
    () => loadActiveRefMatchProfileId(),
  );

  // Re-sync draft if external `current` changes (e.g. profile swap).
  useEffect(() => {
    setDraft(loadOverrides());
  }, []);
  useEffect(() => {
    if (refMatch) setRefDraft(refMatch);
  }, [refMatch?.alignEv, refMatch?.alignL1]);

  const base = baseline ?? QUALITY_PROFILE_V1.live;
  const dirty = Object.keys(draft).length > 0;
  const refDirty =
    refDraft.alignEv !== DEFAULT_REF_MATCH.alignEv ||
    refDraft.alignL1 !== DEFAULT_REF_MATCH.alignL1;

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

  function updateRef(key: keyof RefMatchThresholds, value: number) {
    const next = { ...refDraft, [key]: value };
    setRefDraft(next);
    saveRefMatchThresholds(next);
    onRefMatchChange?.(next);
    if (activeProfileId) {
      setActiveProfileId(null);
      saveActiveRefMatchProfileId(null);
    }
  }

  function resetRef() {
    const next = { ...DEFAULT_REF_MATCH };
    setRefDraft(next);
    saveRefMatchThresholds(next);
    onRefMatchChange?.(next);
    if (activeProfileId) {
      setActiveProfileId(null);
      saveActiveRefMatchProfileId(null);
    }
  }

  function handleProfileSave(p: RefMatchProfile) {
    const next = [...profiles, p];
    setProfiles(next);
    saveRefMatchProfiles(next);
  }

  function handleProfileActivate(id: string | null) {
    setActiveProfileId(id);
    saveActiveRefMatchProfileId(id);
    if (id) {
      const p = profiles.find((x) => x.id === id);
      if (p) {
        setRefDraft(p.thresholds);
        saveRefMatchThresholds(p.thresholds);
        onRefMatchChange?.(p.thresholds);
      }
    }
  }

  function handleProfileDelete(id: string) {
    const next = profiles.filter((p) => p.id !== id);
    setProfiles(next);
    saveRefMatchProfiles(next);
    if (activeProfileId === id) {
      setActiveProfileId(null);
      saveActiveRefMatchProfileId(null);
    }
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
        Progi {dirty || refDirty ? "(custom)" : ""}
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

      {onRefMatchChange && (
        <div className="rounded-md border border-border/70 bg-muted/30 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5" />
              Dopasowanie do referencji (blokada migawki)
              {refDirty && (
                <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-300">
                  custom
                </span>
              )}
            </div>
            {refDirty && (
              <Button variant="ghost" size="sm" onClick={resetRef} className="h-7 px-2 text-[11px]">
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            )}
          </div>

          {[
            {
              key: "alignEv" as const,
              label: "Maks. |ΔEV| do referencji",
              min: 0.05,
              max: 0.6,
              step: 0.01,
              hint: "Mniej = ostrzejsza blokada (1/6 EV ≈ ½ kroku 1/3 EV).",
            },
            {
              key: "alignL1" as const,
              label: "Maks. L1 histogramów",
              min: 0.1,
              max: 1.5,
              step: 0.01,
              hint: "Mniej = wymaga ściślejszej zgodności rozkładu jasności.",
            },
          ].map((f) => {
            const value = refDraft[f.key];
            const baseVal = DEFAULT_REF_MATCH[f.key];
            const isOverridden = value !== baseVal;
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
                    onChange={(e) => updateRef(f.key, parseFloat(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <input
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={value}
                    onChange={(e) => updateRef(f.key, parseFloat(e.target.value))}
                    className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-right text-[11px] tabular-nums"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{f.hint}</span>
              </label>
            );
          })}

          <p className="text-[10px] leading-snug text-muted-foreground">
            Telefony z mocnym auto-HDR / silną stabilizacją scen wymagają zwykle
            łagodniejszych progów (większe wartości). Dla precyzyjnej kalibracji
            studyjnej zmniejsz oba progi.
          </p>

          <RefMatchAutoCalibrate
            liveSample={liveRefSample ?? null}
            onApply={(t) => {
              setRefDraft(t);
              saveRefMatchThresholds(t);
              onRefMatchChange?.(t);
              if (activeProfileId) {
                setActiveProfileId(null);
                saveActiveRefMatchProfileId(null);
              }
            }}
          />

          <RefMatchProfiles
            profiles={profiles}
            activeId={activeProfileId}
            current={refDraft}
            onSave={handleProfileSave}
            onActivate={handleProfileActivate}
            onDelete={handleProfileDelete}
            onReplaceAll={(next, nextActiveId) => {
              setProfiles(next);
              saveRefMatchProfiles(next);
              setActiveProfileId(nextActiveId);
              saveActiveRefMatchProfileId(nextActiveId);
            }}
            onApplyThresholds={(t) => {
              setRefDraft(t);
              saveRefMatchThresholds(t);
              onRefMatchChange?.(t);
            }}
          />
        </div>
      )}
    </div>
  );
}
