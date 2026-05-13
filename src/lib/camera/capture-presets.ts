/**
 * Calibration presets — saved per device + mode (e.g. "iPad Pro · 1x · 30 cm").
 * Each preset captures the histogram, luminance and skinRatio (distance/zoom proxy)
 * of a reference frame, and is enforced on subsequent sessions to keep ujęcia
 * powtarzalne między urządzeniami i wizytami.
 */

export const PRESETS_STORAGE_KEY = "msc:capture-presets:v1";
export const ACTIVE_PRESET_STORAGE_KEY = "msc:capture-preset-active:v1";

export interface CapturePreset {
  id: string;
  /** Etykieta urządzenia (np. "iPad Pro · kamera tylna"). */
  deviceLabel: string;
  /** Etykieta trybu (np. "1x zoom · 30 cm · światło dzienne"). */
  modeLabel: string;
  /** 32-binowy histogram luminancji (suma 1). */
  histogram: number[];
  /** Średnia luminancja 0..1. */
  luminance: number;
  /** Udział pikseli skóry w ROI (proxy dla odległości / zoomu). */
  skinRatio: number;
  /** Odległość środka twarzy od centrum ROI (0..1). */
  centerOffset: number;
  /** Kiedy zarejestrowano (ms epoch). */
  createdAt: number;
}

export function loadPresets(): CapturePreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) =>
        p &&
        typeof p.id === "string" &&
        Array.isArray(p.histogram) &&
        typeof p.luminance === "number",
    );
  } catch {
    return [];
  }
}

export function savePresets(list: CapturePreset[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(list));
}

export function loadActivePresetId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACTIVE_PRESET_STORAGE_KEY);
}

export function saveActivePresetId(id: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (id) localStorage.setItem(ACTIVE_PRESET_STORAGE_KEY, id);
  else localStorage.removeItem(ACTIVE_PRESET_STORAGE_KEY);
}

export interface PresetMatch {
  /** Różnica skinRatio (current - preset). |Δ| > tolerance => za blisko/daleko. */
  skinDelta: number;
  /** Tolerancja skinRatio. */
  skinTol: number;
  /** Czy odległość/zoom mieści się w tolerancji. */
  distanceOk: boolean;
  /** Wskazówka dla użytkownika. */
  hint: string;
}

const SKIN_TOL = 0.04; // ±4 pp w wypełnieniu kadru

export function matchPreset(
  preset: CapturePreset,
  current: { skinRatio: number },
): PresetMatch {
  const skinDelta = current.skinRatio - preset.skinRatio;
  const distanceOk = Math.abs(skinDelta) <= SKIN_TOL;
  let hint = "Odległość / zoom zgodne z presetem.";
  if (!distanceOk) {
    if (skinDelta < 0) {
      hint = `Twarz mniejsza niż w presecie (${(current.skinRatio * 100).toFixed(0)}% vs ${(preset.skinRatio * 100).toFixed(0)}%) — przybliż się lub zwiększ zoom.`;
    } else {
      hint = `Twarz większa niż w presecie (${(current.skinRatio * 100).toFixed(0)}% vs ${(preset.skinRatio * 100).toFixed(0)}%) — odsuń się lub zmniejsz zoom.`;
    }
  }
  return { skinDelta, skinTol: SKIN_TOL, distanceOk, hint };
}

export function makePresetId(): string {
  return `pst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
