/**
 * Quality Knowledge Base — wersja progów v1.
 *
 * SaMD audit: każda zmiana progów wymaga bumpu `version` oraz wpisu w `changelog`.
 * Profile rozdzielają próg LIVE (ułatwia dopasowanie kadru w czasie rzeczywistym)
 * od progu CAPTURE (twardsza walidacja po naciśnięciu migawki, przed wysłaniem do CV).
 *
 * Uzasadnienie kalibracji v1:
 *  - sharpness (LapVar) na pomniejszonym ROI 220px: empirycznie zdjęcia ostre w
 *    dermatologii dają 150–600. 120 (live) odrzuca wyraźny blur, 180 (capture)
 *    egzekwuje rezerwę bezpieczeństwa.
 *  - luminance Rec.709 znormalizowana do 0..1: target 0.50 ±0.10. Capture zawęża
 *    do 0.45–0.62 — eliminuje niedoświetlenia i delikatne przepalenia.
 *  - colorCast (gray-world) > 8% w live = ostrzeżenie; > 6% w capture = odrzucenie,
 *    bo cast utrudnia analizę erytemu/teleangiektazji w CIELAB.
 *  - clipping > 2% w capture = fail (nawet jeśli średnia luma OK, palety LAB tracą
 *    rozdzielczość w skrajnych kanałach).
 *  - skinRatio 35–78% — przy 70mm fragmencie twarzy w ROI to ~30–60 cm dystansu.
 *  - centerOffset 22% w live, 18% w capture — dopuszcza naturalne mikro-ruchy.
 */

import type { QualityThresholds } from "./types";

export interface QualityProfile {
  version: string;
  changelog: string;
  live: QualityThresholds;
  capture: QualityThresholds;
}

export const QUALITY_PROFILE_V1: QualityProfile = {
  version: "qkb-2026.05.13-003",
  changelog:
    "v1: pierwsza kalibracja progów. Rozdzielenie live (HUD) i capture (hard reject przed backendem). Capture wymaga ostrości >=180, luma 0.45–0.62, cast <=6%, clipping <=2%, offset <=18%, AE σ<=0.02, AWB σ<=0.015.",

  live: {
    luminanceMin: 0.42,
    luminanceMax: 0.68,
    sharpnessMin: 120,
    clippingMax: 0.04,
    colorCastMax: 0.08,
    angularVelocityMax: 0.15,
    skinRatioMin: 0.35,
    skinRatioMax: 0.78,
    centerOffsetMax: 0.22,
    luminanceStdMax: 0.025,
    colorCastStdMax: 0.02,
    temporalMinSamples: 6,
  },

  capture: {
    luminanceMin: 0.45,
    luminanceMax: 0.62,
    sharpnessMin: 180,
    clippingMax: 0.02,
    colorCastMax: 0.06,
    angularVelocityMax: 0.12,
    skinRatioMin: 0.38,
    skinRatioMax: 0.74,
    centerOffsetMax: 0.18,
    luminanceStdMax: 0.02,
    colorCastStdMax: 0.015,
    temporalMinSamples: 6,
  },
};
