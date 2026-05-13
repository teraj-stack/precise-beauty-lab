/**
 * Library of saved histogram references with metadata (date, conditions).
 * Lets the operator keep multiple "good" reference frames per device/setup
 * and switch between them without losing previous calibrations.
 *
 * Backwards-compatible with the legacy single-key store
 * `msc:hist-reference:v1` — on first load it migrates that entry into the
 * library and removes the legacy key.
 */

import type { HistogramReference } from "@/components/camera/HistogramHUD";

export interface StoredHistogramReference extends HistogramReference {
  /** Stable identifier (UUID-ish). */
  id: string;
  /** Free-text conditions: lighting, room, device, time of day. */
  conditions?: string;
  /** Created at (ms epoch). Defaults to capturedAt. */
  createdAt: number;
}

const LIBRARY_KEY = "msc:hist-reference-library:v1";
const ACTIVE_KEY = "msc:hist-reference-library:active:v1";
const LEGACY_KEY = "msc:hist-reference:v1";
const MAX_ENTRIES = 24;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fallthrough */
    }
  }
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValid(ref: unknown): ref is StoredHistogramReference {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    Array.isArray(r.histogram) &&
    typeof r.luminance === "number" &&
    typeof r.capturedAt === "number"
  );
}

function readLegacy(): StoredHistogramReference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HistogramReference;
    if (!parsed || !Array.isArray(parsed.histogram) || typeof parsed.luminance !== "number") {
      return null;
    }
    return {
      id: uuid(),
      histogram: parsed.histogram.map((v) => Number(v) || 0),
      luminance: parsed.luminance,
      capturedAt: parsed.capturedAt ?? Date.now(),
      label: parsed.label ?? "Migracja (legacy)",
      conditions: undefined,
      createdAt: parsed.capturedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export function loadLibrary(): StoredHistogramReference[] {
  if (typeof window === "undefined") return [];
  let library: StoredHistogramReference[] = [];
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) library = parsed.filter(isValid);
    }
  } catch {
    library = [];
  }
  // One-time migration of legacy single ref.
  if (library.length === 0) {
    const legacy = readLegacy();
    if (legacy) {
      library = [legacy];
      saveLibrary(library);
      setActiveId(legacy.id);
      try {
        window.localStorage.removeItem(LEGACY_KEY);
      } catch {
        /* ignore */
      }
    }
  }
  return library;
}

export function saveLibrary(library: StoredHistogramReference[]): void {
  if (typeof window === "undefined") return;
  try {
    if (library.length === 0) window.localStorage.removeItem(LIBRARY_KEY);
    else window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    /* quota / serialization — ignore */
  }
}

export function loadActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

/** Append a new reference; oldest entries are dropped when over MAX_ENTRIES. */
export function addReference(
  library: StoredHistogramReference[],
  ref: Omit<StoredHistogramReference, "id" | "createdAt"> & {
    id?: string;
    createdAt?: number;
  },
): { library: StoredHistogramReference[]; entry: StoredHistogramReference } {
  const entry: StoredHistogramReference = {
    id: ref.id ?? uuid(),
    histogram: ref.histogram.map((v) => Number(v) || 0),
    luminance: ref.luminance,
    capturedAt: ref.capturedAt ?? Date.now(),
    label: ref.label,
    conditions: ref.conditions,
    createdAt: ref.createdAt ?? Date.now(),
  };
  const next = [entry, ...library].slice(0, MAX_ENTRIES);
  return { library: next, entry };
}

export function removeReference(
  library: StoredHistogramReference[],
  id: string,
): StoredHistogramReference[] {
  return library.filter((r) => r.id !== id);
}

/**
 * Duplicate an existing reference (histogram + luminance + conditions are
 * cloned). Optional patch lets the caller override label/conditions to
 * support quick variants ("Gabinet — wariant B"). Returns the new entry.
 */
export function duplicateReference(
  library: StoredHistogramReference[],
  id: string,
  patch?: Partial<Pick<StoredHistogramReference, "label" | "conditions">>,
): { library: StoredHistogramReference[]; entry: StoredHistogramReference } | null {
  const src = library.find((r) => r.id === id);
  if (!src) return null;
  const baseLabel = patch?.label ?? `${src.label ?? "Referencja"} (kopia)`;
  return addReference(library, {
    histogram: [...src.histogram],
    luminance: src.luminance,
    capturedAt: Date.now(),
    label: baseLabel,
    conditions: patch?.conditions ?? src.conditions,
  });

export function updateReference(
  library: StoredHistogramReference[],
  id: string,
  patch: Partial<Pick<StoredHistogramReference, "label" | "conditions">>,
): StoredHistogramReference[] {
  return library.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export function findById(
  library: StoredHistogramReference[],
  id: string | null,
): StoredHistogramReference | null {
  if (!id) return null;
  return library.find((r) => r.id === id) ?? null;
}
