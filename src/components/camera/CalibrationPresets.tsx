import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Trash2, CheckCircle2, Crosshair } from "lucide-react";
import { toast } from "sonner";
import {
  type CapturePreset,
  makePresetId,
  matchPreset,
} from "@/lib/camera/capture-presets";
import type { FrameMetrics } from "@/lib/camera/types";

interface Props {
  presets: CapturePreset[];
  activeId: string | null;
  metrics?: FrameMetrics | null;
  deviceLabel?: string;
  onSave: (preset: CapturePreset) => void;
  onActivate: (id: string | null) => void;
  onDelete: (id: string) => void;
}

export function CalibrationPresets({
  presets,
  activeId,
  metrics,
  deviceLabel,
  onSave,
  onActivate,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState(deviceLabel ?? "");
  const [mode, setMode] = useState("");

  const active = presets.find((p) => p.id === activeId) ?? null;
  const match = active && metrics ? matchPreset(active, metrics) : null;

  const handleSave = () => {
    if (!metrics) {
      toast.error("Brak metryk — uruchom kamerę i poczekaj na pierwszy frame.");
      return;
    }
    if (!device.trim() || !mode.trim()) {
      toast.error("Podaj urządzenie i tryb (np. zoom / odległość).");
      return;
    }
    const preset: CapturePreset = {
      id: makePresetId(),
      deviceLabel: device.trim(),
      modeLabel: mode.trim(),
      histogram: [...metrics.histogram],
      luminance: metrics.luminance,
      skinRatio: metrics.skinRatio,
      centerOffset: metrics.centerOffset,
      createdAt: Date.now(),
    };
    onSave(preset);
    onActivate(preset.id);
    setMode("");
    toast.success(`Preset zapisany: ${preset.deviceLabel} · ${preset.modeLabel}`);
  };

  return (
    <div className="rounded-xl border border-border bg-card/50 p-3 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-sm font-semibold"
      >
        <span className="flex items-center gap-1.5">
          <Crosshair className="h-4 w-4" />
          Kalibracja: presety urządzenia / trybu
        </span>
        <span className="text-[11px] font-normal text-muted-foreground">
          {active ? `aktywny: ${active.deviceLabel} · ${active.modeLabel}` : "brak aktywnego"}
        </span>
      </button>

      {active && match && (
        <div
          className={`rounded-md border px-2.5 py-1.5 text-[11px] ${
            match.distanceOk
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
          aria-live="polite"
        >
          <span className="font-medium">
            {match.distanceOk ? "✓ Odległość/zoom OK" : "▲ Niezgodność z presetem"}
          </span>
          <span className="ml-1 opacity-90">{match.hint}</span>
        </div>
      )}

      {open && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="cal-device" className="text-[11px]">
                Urządzenie
              </Label>
              <Input
                id="cal-device"
                placeholder="np. iPad Pro · tylna"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cal-mode" className="text-[11px]">
                Tryb (zoom / odległość)
              </Label>
              <Input
                id="cal-mode"
                placeholder="np. 1x · 30 cm"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!metrics}
            size="sm"
            className="w-full"
          >
            <Save className="h-3.5 w-3.5" /> Zapisz bieżący kadr jako preset
          </Button>

          {presets.length > 0 && (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {presets.map((p) => {
                const isActive = p.id === activeId;
                return (
                  <li
                    key={p.id}
                    className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px] ${
                      isActive
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-background"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onActivate(isActive ? null : p.id)}
                      className="flex-1 text-left"
                      title={isActive ? "Kliknij, aby dezaktywować" : "Aktywuj preset"}
                    >
                      <div className="flex items-center gap-1 font-medium">
                        {isActive && <CheckCircle2 className="h-3 w-3 text-primary" />}
                        {p.deviceLabel} · {p.modeLabel}
                      </div>
                      <div className="text-muted-foreground tabular-nums">
                        μ {p.luminance.toFixed(2)} · skin {(p.skinRatio * 100).toFixed(0)}% ·{" "}
                        {new Date(p.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(p.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Usuń preset"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {presets.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Brak zapisanych presetów. Ustaw zoom/odległość, poczekaj na zielone bramki i
              zapisz preset — kolejne sesje będą wymuszać tę samą konfigurację.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
