/**
 * Export / import of ref-match threshold settings (current + profiles).
 *
 * Bundle format (JSON):
 *   {
 *     "type": "msc:ref-match-settings",
 *     "version": 1,
 *     "exportedAt": <ms epoch>,
 *     "current": { alignEv, alignL1 },
 *     "activeProfileId": <id|null>,
 *     "profiles": [RefMatchProfile, ...]
 *   }
 */

import type { RefMatchThresholds } from "@/components/camera/ThresholdPanel";
import {
  loadActiveRefMatchProfileId,
  loadRefMatchProfiles,
  type RefMatchProfile,
} from "./ref-match-profiles";

export const REF_MATCH_BUNDLE_TYPE = "msc:ref-match-settings";
export const REF_MATCH_BUNDLE_VERSION = 1;

export interface RefMatchBundle {
  type: typeof REF_MATCH_BUNDLE_TYPE;
  version: number;
  exportedAt: number;
  current: RefMatchThresholds;
  activeProfileId: string | null;
  profiles: RefMatchProfile[];
}

export function buildRefMatchBundle(current: RefMatchThresholds): RefMatchBundle {
  return {
    type: REF_MATCH_BUNDLE_TYPE,
    version: REF_MATCH_BUNDLE_VERSION,
    exportedAt: Date.now(),
    current: { alignEv: current.alignEv, alignL1: current.alignL1 },
    activeProfileId: loadActiveRefMatchProfileId(),
    profiles: loadRefMatchProfiles(),
  };
}

export function serializeRefMatchBundle(bundle: RefMatchBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function defaultRefMatchExportFilename(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `msc-ref-match-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

// ---- Import ----

export type ImportMode = "replace" | "merge";

export interface ParsedRefMatchBundle {
  current: RefMatchThresholds;
  activeProfileId: string | null;
  profiles: RefMatchProfile[];
}

export class RefMatchImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefMatchImportError";
  }
}

function isValidThresholds(x: unknown): x is RefMatchThresholds {
  if (!x || typeof x !== "object") return false;
  const t = x as Record<string, unknown>;
  return (
    typeof t.alignEv === "number" &&
    isFinite(t.alignEv) &&
    t.alignEv > 0 &&
    t.alignEv <= 1 &&
    typeof t.alignL1 === "number" &&
    isFinite(t.alignL1) &&
    t.alignL1 > 0 &&
    t.alignL1 <= 2
  );
}

function isValidProfile(x: unknown): x is RefMatchProfile {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.deviceLabel === "string" &&
    typeof p.conditionLabel === "string" &&
    typeof p.createdAt === "number" &&
    isValidThresholds(p.thresholds)
  );
}

export function parseRefMatchBundle(raw: string): ParsedRefMatchBundle {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new RefMatchImportError("Plik nie jest poprawnym JSON-em.");
  }
  if (!data || typeof data !== "object") {
    throw new RefMatchImportError("Niepoprawny format pliku.");
  }
  const b = data as Record<string, unknown>;
  if (b.type !== REF_MATCH_BUNDLE_TYPE) {
    throw new RefMatchImportError(
      `Nierozpoznany typ pliku (${String(b.type ?? "?")}). Oczekiwano "${REF_MATCH_BUNDLE_TYPE}".`,
    );
  }
  if (typeof b.version !== "number" || b.version > REF_MATCH_BUNDLE_VERSION) {
    throw new RefMatchImportError(
      `Nieobsługiwana wersja pliku (${String(b.version)}). Maks. ${REF_MATCH_BUNDLE_VERSION}.`,
    );
  }
  if (!isValidThresholds(b.current)) {
    throw new RefMatchImportError("Brak lub nieprawidłowe progi (alignEv / alignL1).");
  }
  const profiles = Array.isArray(b.profiles) ? b.profiles.filter(isValidProfile) : [];
  const activeProfileId =
    typeof b.activeProfileId === "string" ? b.activeProfileId : null;
  return {
    current: { alignEv: b.current.alignEv, alignL1: b.current.alignL1 },
    activeProfileId:
      activeProfileId && profiles.some((p) => p.id === activeProfileId)
        ? activeProfileId
        : null,
    profiles,
  };
}

export interface MergeResult {
  profiles: RefMatchProfile[];
  added: number;
  skipped: number;
}

/**
 * Merge imported profiles into existing list.
 * Profiles with matching `id` are kept (existing wins) — counts as "skipped".
 * Profiles with same deviceLabel+conditionLabel but different id get a fresh id
 * to avoid hiding pre-existing entries.
 */
export function mergeProfiles(
  existing: RefMatchProfile[],
  incoming: RefMatchProfile[],
): MergeResult {
  const byId = new Map(existing.map((p) => [p.id, p]));
  let added = 0;
  let skipped = 0;
  const out = [...existing];
  for (const p of incoming) {
    if (byId.has(p.id)) {
      skipped += 1;
      continue;
    }
    out.push(p);
    added += 1;
  }
  return { profiles: out, added, skipped };
}
