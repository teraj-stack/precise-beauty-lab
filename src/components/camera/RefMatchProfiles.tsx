import { useRef, useState } from "react";
import { Save, Trash2, CheckCircle2, Smartphone, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  type RefMatchProfile,
  makeRefMatchProfileId,
} from "@/lib/camera/ref-match-profiles";
import {
  buildRefMatchBundle,
  defaultRefMatchExportFilename,
  mergeProfiles,
  parseRefMatchBundle,
  RefMatchImportError,
  serializeRefMatchBundle,
} from "@/lib/camera/ref-match-io";
import type { RefMatchThresholds } from "./ThresholdPanel";

interface Props {
  profiles: RefMatchProfile[];
  activeId: string | null;
  current: RefMatchThresholds;
  onSave: (profile: RefMatchProfile) => void;
  onActivate: (id: string | null) => void;
  onDelete: (id: string) => void;
  /** Replace profile list (used by import). */
  onReplaceAll: (profiles: RefMatchProfile[], activeId: string | null) => void;
  /** Apply imported `current` thresholds. */
  onApplyThresholds: (t: RefMatchThresholds) => void;
}

export function RefMatchProfiles({
  profiles,
  activeId,
  current,
  onSave,
  onActivate,
  onDelete,
  onReplaceAll,
  onApplyThresholds,
}: Props) {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState("");
  const [cond, setCond] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = profiles.find((p) => p.id === activeId) ?? null;

  function handleExport() {
    try {
      const bundle = buildRefMatchBundle(current);
      const json = serializeRefMatchBundle(bundle);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultRefMatchExportFilename();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(
        `Wyeksportowano ${bundle.profiles.length} ${bundle.profiles.length === 1 ? "profil" : "profili"} + bieżące progi.`,
      );
    } catch (e) {
      toast.error(`Eksport nie powiódł się: ${(e as Error).message}`);
    }
  }

  function triggerImport() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const parsed = parseRefMatchBundle(text);
      const replace = window.confirm(
        `Import: ${parsed.profiles.length} profili, progi ΔEV ≤ ${parsed.current.alignEv.toFixed(3)} · L1 ≤ ${parsed.current.alignL1.toFixed(3)}.\n\nOK = ZASTĄP istniejące profile (${profiles.length}).\nAnuluj = SCAL z istniejącymi (zachowa obecne).`,
      );
      if (replace) {
        onReplaceAll(parsed.profiles, parsed.activeProfileId);
        onApplyThresholds(parsed.current);
        toast.success(
          `Zaimportowano (zastąpiono): ${parsed.profiles.length} ${parsed.profiles.length === 1 ? "profil" : "profili"}.`,
        );
      } else {
        const merged = mergeProfiles(profiles, parsed.profiles);
        onReplaceAll(merged.profiles, activeId);
        onApplyThresholds(parsed.current);
        toast.success(
          `Scalono: dodano ${merged.added}, pominięto ${merged.skipped} (duplikaty po ID).`,
        );
      }
    } catch (e) {
      if (e instanceof RefMatchImportError) toast.error(`Import: ${e.message}`);
      else toast.error(`Import nie powiódł się: ${(e as Error).message}`);
    }
  }

  const handleSave = () => {
    if (!device.trim() || !cond.trim()) {
      toast.error("Podaj urządzenie i warunki.");
      return;
    }
    const profile: RefMatchProfile = {
      id: makeRefMatchProfileId(),
      deviceLabel: device.trim(),
      conditionLabel: cond.trim(),
      thresholds: { alignEv: current.alignEv, alignL1: current.alignL1 },
      createdAt: Date.now(),
    };
    onSave(profile);
    onActivate(profile.id);
    setDevice("");
    setCond("");
    toast.success(`Profil zapisany: ${profile.deviceLabel} · ${profile.conditionLabel}`);
  };

  return (
    <div className="rounded-md border border-border/70 bg-background/60 p-2.5 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-[11px] font-semibold"
      >
        <span className="flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5" />
          Profile dopasowania (urządzenie · warunki)
        </span>
        <span className="text-[10px] font-normal text-muted-foreground">
          {active ? `aktywny: ${active.deviceLabel} · ${active.conditionLabel}` : "brak"}
        </span>
      </button>

      {profiles.length > 0 && (
        <ul className="space-y-1">
          {profiles.map((p) => {
            const isActive = p.id === activeId;
            return (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-[11px] ${
                  isActive
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onActivate(isActive ? null : p.id)}
                  className="flex-1 text-left"
                  title={isActive ? "Kliknij, aby dezaktywować" : "Aktywuj profil"}
                >
                  <div className="flex items-center gap-1 font-medium">
                    {isActive && <CheckCircle2 className="h-3 w-3 text-primary" />}
                    {p.deviceLabel} · {p.conditionLabel}
                  </div>
                  <div className="text-muted-foreground tabular-nums">
                    ΔEV ≤ {p.thresholds.alignEv.toFixed(3)} · L1 ≤{" "}
                    {p.thresholds.alignL1.toFixed(3)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Usuń profil"
                  aria-label={`Usuń profil ${p.deviceLabel}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="rmp-dev" className="text-[10px]">
                Urządzenie
              </Label>
              <Input
                id="rmp-dev"
                placeholder="np. iPhone 15 Pro"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rmp-cond" className="text-[10px]">
                Warunki
              </Label>
              <Input
                id="rmp-cond"
                placeholder="np. gabinet · LED 5500K"
                value={cond}
                onChange={(e) => setCond(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <Button type="button" size="sm" onClick={handleSave} className="w-full">
            <Save className="h-3.5 w-3.5" /> Zapisz bieżące progi jako profil
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Aktualne: ΔEV ≤ {current.alignEv.toFixed(3)} · L1 ≤{" "}
            {current.alignL1.toFixed(3)}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[10px] text-primary hover:underline"
        >
          {open ? "Ukryj formularz" : "+ Dodaj nowy profil z bieżących progów"}
        </button>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleExport}
            className="h-6 px-1.5 text-[10px]"
            title="Eksportuj progi i profile do pliku JSON"
          >
            <Download className="h-3 w-3" /> Eksport
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={triggerImport}
            className="h-6 px-1.5 text-[10px]"
            title="Importuj progi i profile z pliku JSON"
          >
            <Upload className="h-3 w-3" /> Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}
