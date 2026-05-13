/**
 * Manage multiple saved histogram references (date + conditions),
 * pick which one is the active reference for the next captures.
 *
 * Pure presentation — state (library, activeId) is owned by the parent
 * StandardizedCamera so the active reference can drive ΔEV/L1 gating.
 */

import { useMemo, useState } from "react";
import { ArrowDownAZ, BookmarkPlus, Check, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StoredHistogramReference } from "@/lib/camera/hist-reference-library";

interface Props {
  library: StoredHistogramReference[];
  activeId: string | null;
  /** Whether a current frame is available so "Save" is enabled. */
  canSaveCurrent: boolean;
  onSaveCurrent: (meta: { label: string; conditions: string }) => void;
  onActivate: (id: string | null) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, patch: { label?: string; conditions?: string }) => void;
  /** Optional indicator: external preset takes priority over manual references. */
  presetActive?: boolean;
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

export function HistReferenceLibrary({
  library,
  activeId,
  canSaveCurrent,
  onSaveCurrent,
  onActivate,
  onDelete,
  onRename,
  presetActive,
}: Props) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftConditions, setDraftConditions] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editConditions, setEditConditions] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "label" | "conditions">("newest");

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? library.filter((r) => {
          const label = (r.label ?? "").toLowerCase();
          const cond = (r.conditions ?? "").toLowerCase();
          return label.includes(q) || cond.includes(q);
        })
      : library;
    const arr = [...filtered];
    switch (sortBy) {
      case "oldest":
        arr.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "label":
        arr.sort((a, b) =>
          (a.label ?? "").localeCompare(b.label ?? "", "pl", { sensitivity: "base" }),
        );
        break;
      case "conditions":
        arr.sort((a, b) =>
          (a.conditions ?? "").localeCompare(b.conditions ?? "", "pl", { sensitivity: "base" }),
        );
        break;
      case "newest":
      default:
        arr.sort((a, b) => b.createdAt - a.createdAt);
    }
    return arr;
  }, [library, query, sortBy]);

  function handleSave() {
    const label = draftLabel.trim() || `Próba ${new Date().toLocaleTimeString("pl-PL")}`;
    onSaveCurrent({ label, conditions: draftConditions.trim() });
    setDraftLabel("");
    setDraftConditions("");
  }

  function startEdit(r: StoredHistogramReference) {
    setEditingId(r.id);
    setEditLabel(r.label ?? "");
    setEditConditions(r.conditions ?? "");
  }

  function commitEdit() {
    if (!editingId) return;
    onRename(editingId, {
      label: editLabel.trim() || undefined,
      conditions: editConditions.trim() || undefined,
    });
    setEditingId(null);
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Biblioteka referencji histogramu</div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {library.length} zapisanych
        </span>
      </div>

      {presetActive && (
        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-200">
          Aktywny preset kalibracyjny ma pierwszeństwo nad ręcznymi referencjami.
          Wyłącz preset, aby używać poniższego wyboru.
        </div>
      )}

      {/* Save current frame with metadata */}
      <div className="grid gap-1.5 rounded-md border border-border/70 bg-muted/30 p-2">
        <div className="font-medium">Zapisz bieżącą klatkę jako referencję</div>
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          placeholder='Etykieta (np. „Gabinet — światło dzienne")'
          className="rounded border border-input bg-background px-2 py-1 text-[11px]"
        />
        <input
          type="text"
          value={draftConditions}
          onChange={(e) => setDraftConditions(e.target.value)}
          placeholder='Warunki (np. „Pora poranna, lampa LED 3000K, brak okna")'
          className="rounded border border-input bg-background px-2 py-1 text-[11px]"
        />
        <Button
          size="sm"
          variant="default"
          onClick={handleSave}
          disabled={!canSaveCurrent}
          className="h-7 text-[11px]"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          Dodaj do biblioteki
        </Button>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Brak zapisanych referencji. Zapisz pierwszą referencję na bazie aktualnej klatki.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((r) => {
            const isActive = r.id === activeId;
            const isEditing = editingId === r.id;
            return (
              <li
                key={r.id}
                className={`rounded-md border px-2 py-1.5 transition-colors ${
                  isActive
                    ? "border-primary/60 bg-primary/5"
                    : "border-border/70 bg-background"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Etykieta"
                      className="w-full rounded border border-input bg-background px-2 py-1 text-[11px]"
                    />
                    <input
                      type="text"
                      value={editConditions}
                      onChange={(e) => setEditConditions(e.target.value)}
                      placeholder="Warunki"
                      className="w-full rounded border border-input bg-background px-2 py-1 text-[11px]"
                    />
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-6 px-2 text-[11px]">
                        Anuluj
                      </Button>
                      <Button size="sm" variant="default" onClick={commitEdit} className="h-6 px-2 text-[11px]">
                        Zapisz
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => onActivate(isActive ? null : r.id)}
                      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                        isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                      }`}
                      title={isActive ? "Wyłącz tę referencję" : "Ustaw jako aktywną"}
                      aria-pressed={isActive}
                    >
                      {isActive && <Check className="h-2.5 w-2.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {r.label ?? "(bez etykiety)"}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          μ {r.luminance.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDate(r.createdAt)}
                        {isActive && (
                          <span className="ml-1 rounded bg-primary/15 px-1 py-px text-[9px] font-bold uppercase text-primary">
                            aktywna
                          </span>
                        )}
                      </div>
                      {r.conditions && (
                        <div className="mt-0.5 text-[11px] leading-snug text-foreground/80">
                          {r.conditions}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(r)}
                        title="Edytuj etykietę / warunki"
                        className="h-6 w-6"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(r.id)}
                        title="Usuń referencję"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {activeId && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onActivate(null)}
          className="h-7 text-[11px]"
        >
          <X className="h-3.5 w-3.5" />
          Wyłącz aktywną referencję
        </Button>
      )}
    </div>
  );
}
