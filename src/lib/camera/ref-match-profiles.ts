/**
 * Per-device / per-condition ref-match threshold profiles.
 *
 * Stores named bundles of {alignEv, alignL1} (the shutter-gate thresholds
 * that compare a live frame to the saved histogram reference) so the
 * operator can switch between configurations (e.g. "iPhone 15 · gabinet",
 * "iPad Pro · światło dzienne") with a single click instead of dragging
 * sliders.
 */

import type { RefMatchThresholds } from "@/components/camera/ThresholdPanel";

export const REF_MATCH_PROFILES_KEY = "msc:ref-match-profiles:v1";
export const REF_MATCH_ACTIVE_KEY = "msc:ref-match-profile-active:v1";

export interface RefMatchProfile {
  id: string;
  /** Etykieta urządzenia (np. "iPhone 15 Pro · tylna"). */
  deviceLabel: string;
  /** Etykieta warunków (np. "gabinet · LED 5500K"). */
  conditionLabel: string;
  /** Progi dopasowania histogramu / EV. */
  thresholds: RefMatchThresholds;
  createdAt: number;
}

export function makeRefMatchProfileId(): string {
  return `rmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function loadRefMatchProfiles(): RefMatchProfile[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(REF_MATCH_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is RefMatchProfile =>
        p &&
        typeof p.id === "string" &&
        typeof p.deviceLabel === "string" &&
        typeof p.conditionLabel === "string" &&
        p.thresholds &&
        typeof p.thresholds.alignEv === "number" &&
        typeof p.thresholds.alignL1 === "number",
    );
  } catch {
    return [];
  }
}

export function saveRefMatchProfiles(list: RefMatchProfile[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(REF_MATCH_PROFILES_KEY, JSON.stringify(list));
}

export function loadActiveRefMatchProfileId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(REF_MATCH_ACTIVE_KEY);
}

export function saveActiveRefMatchProfileId(id: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (id) localStorage.setItem(REF_MATCH_ACTIVE_KEY, id);
  else localStorage.removeItem(REF_MATCH_ACTIVE_KEY);
}
