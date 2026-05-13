import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Aperture,
  Lock,
  LockOpen,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  BookmarkPlus,
  Download,
  Upload,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCameraStream } from "@/hooks/useCameraStream";
import { useDeviceStability } from "@/hooks/useDeviceStability";
import { useFrameAnalysis } from "@/hooks/useFrameAnalysis";
import { DEFAULT_FACE_ROI } from "@/lib/camera/quality";
import { validateCapture, type CaptureValidation } from "@/lib/camera/validate-capture";
import { QUALITY_PROFILE_V1, type QualityProfile } from "@/lib/camera/quality-profiles";
import { loadCalibration } from "@/lib/camera/calibration";
import {
  buildCaptureMetadata,
  embedQualityReportInJpeg,
  type CaptureQualityReport,
} from "@/lib/camera/capture-metadata";
import { validateQualityReport } from "@/lib/camera/quality-report-schema";
import { FaceGuideOverlay } from "./FaceGuideOverlay";
import { QualityHUD } from "./QualityHUD";
import { HistogramHUD, type HistogramReference } from "./HistogramHUD";
import {
  ThresholdPanel,
  applyOverrides,
  loadOverrides,
  loadRefMatchThresholds,
  type ThresholdOverrides,
  type RefMatchThresholds,
} from "./ThresholdPanel";
import { CaptureReportDetails } from "./CaptureReportDetails";
import { HistogramHistory } from "./HistogramHistory";
import { CalibrationPresets } from "./CalibrationPresets";
import {
  loadPresets,
  savePresets,
  loadActivePresetId,
  saveActivePresetId,
  matchPreset,
  type CapturePreset,
} from "@/lib/camera/capture-presets";

const HIST_REF_STORAGE_KEY = "msc:hist-reference:v1";

function loadHistReference(): HistogramReference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HIST_REF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HistogramReference;
    if (
      parsed &&
      Array.isArray(parsed.histogram) &&
      typeof parsed.luminance === "number"
    )
      return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveHistReference(ref: HistogramReference | null) {
  if (typeof window === "undefined") return;
  if (ref) window.localStorage.setItem(HIST_REF_STORAGE_KEY, JSON.stringify(ref));
  else window.localStorage.removeItem(HIST_REF_STORAGE_KEY);
}

const MAX_AUTO_RETRIES = 5;
const RETRY_DEBOUNCE_MS = 350;

/** Static fallback hint per gate. Dynamic hints (AE/AWB direction, clipping side) override these. */
const GATE_HINTS: Record<string, string> = {
  distance: "Dostosuj odległość — zbliż lub oddal twarz, aż owal wypełni ramkę.",
  position: "Wycentruj twarz w ramce — kieruj nos na środek owalu.",
  sharpness: "Trzymaj telefon nieruchomo i poczekaj na ostrość.",
  exposure: "Zmień oświetlenie — kadr za jasny lub za ciemny.",
  "clipping-low": "Dodaj światło wypełniające — zbyt wiele pikseli ROI w cieniach.",
  "clipping-high": "Usuń silne światło/odbicia z kadru — przepalenia w ROI.",
  "ae-stable": "Czekam, aż auto-ekspozycja się ustabilizuje…",
  "awb-stable": "Czekam, aż balans bieli się ustabilizuje (neutralne światło).",
  stability: "Trzymaj telefon nieruchomo (lub oprzyj na statywie).",
};

/** Build a contextual hint that explains *why* a gate fails and *what to do*. */
function gateHint(
  gate: { id: string; status: string; detail: string },
  metrics?: import("@/lib/camera/types").FrameMetrics,
  temporal?: import("@/lib/camera/types").TemporalStability,
): string {
  const m = metrics;
  switch (gate.id) {
    case "exposure": {
      if (!m) break;
      if (m.luminance < 0.35)
        return `Za ciemno (luma ${m.luminance.toFixed(2)}). Dodaj światło rozproszone od przodu lub przejdź bliżej okna.`;
      if (m.luminance > 0.7)
        return `Za jasno (luma ${m.luminance.toFixed(2)}). Odsuń się od źródła światła lub przyciemnij lampę.`;
      break;
    }
    case "clipping-low": {
      if (!m) break;
      return `Niedoświetlone cienie ${(m.clippingLow * 100).toFixed(2)}% w ROI — dodaj światło wypełniające.`;
    }
    case "clipping-high": {
      if (!m) break;
      return `Przepalenia ${(m.clippingHigh * 100).toFixed(2)}% w ROI — usuń silne światło/odbicia w kadrze.`;
    }
    case "ae-stable": {
      if (!temporal) break;
      if (temporal.samples < 8)
        return `Zbieram próbki AE… (${temporal.samples}). Trzymaj kadr nieruchomo.`;
      return `Auto-ekspozycja jeszcze się waha (σL ${temporal.luminanceStd.toFixed(3)}). Ustabilizuj światło i nie ruszaj telefonem.`;
    }
    case "awb-stable": {
      if (!m || !temporal) break;
      const dirs: string[] = [];
      const TH = 0.04;
      // castR/G/B are signed deltas vs gray-world neutral
      if (m.castR > TH && m.castB < -TH) dirs.push("ciepły (czerwony/żółty)");
      else if (m.castB > TH && m.castR < -TH) dirs.push("zimny (niebieski)");
      if (m.castG > TH) dirs.push("zielony");
      else if (m.castG < -TH && m.castR > 0 && m.castB > 0) dirs.push("magenta");
      const driftHint =
        temporal.colorCastStd > 0.02
          ? ` AWB wciąż się waha (σ ${temporal.colorCastStd.toFixed(3)}).`
          : "";
      const dirText = dirs.length ? ` Wykryty cast: ${dirs.join(", ")}.` : "";
      return `Niezbalansowane światło (cast ${(m.colorCast * 100).toFixed(1)}%).${dirText}${driftHint} Użyj jednolitego, neutralnego źródła (5000–6500 K).`;
    }
    case "distance": {
      if (!m) break;
      const pct = (m.skinRatio * 100).toFixed(0);
      if (m.skinRatio < 0.15) return `Twarz za mała (${pct}% ROI) — przybliż telefon.`;
      return `Twarz za blisko (${pct}% ROI) — odsuń telefon.`;
    }
    case "position":
      return `Wycentruj twarz w owalu (${m ? `Δ ${(m.centerOffset * 100).toFixed(0)}%` : ""}).`;
    case "sharpness":
      return `Obraz nieostry (LapVar ${m ? m.sharpness.toFixed(0) : "—"}). Trzymaj telefon nieruchomo i poczekaj na AF.`;
    case "stability":
      return "Telefon się rusza — oprzyj łokcie lub użyj statywu.";
  }
  return GATE_HINTS[gate.id] ?? gate.detail;
}

function blockingHint(gateIds: string[], reasons: string[]): string {
  const id = gateIds[0];
  const hint = id ? GATE_HINTS[id] : undefined;
  return hint ?? reasons[0] ?? "Bramka jakości nieaktywna.";
}

export interface ValidatedCapture {
  /** JPEG data URL with the quality report embedded as a JPEG COM marker. */
  dataUrl: string;
  width: number;
  height: number;
  validation: CaptureValidation;
  capturedAt: string;
  profileVersion: string;
  /** Full structured quality report — same data embedded in the JPEG. */
  qualityReport: CaptureQualityReport;
  /** Stand-alone JSON sidecar (UTF-8) for archive/export. */
  qualityReportJson: string;
}

interface Props {
  /**
   * Called ONLY for accepted captures. Use it to POST to backend.
   * Rejected captures never reach this callback.
   */
  onAccepted?: (frame: ValidatedCapture) => void;
  /** Override the default quality profile (e.g. personal calibration). */
  profile?: QualityProfile;
}

export function StandardizedCamera({ onAccepted, profile: profileProp }: Props) {
  const calibration = profileProp ? null : loadCalibration();
  const baseProfile = profileProp ?? calibration?.profile ?? QUALITY_PROFILE_V1;
  const [overrides, setOverrides] = useState<ThresholdOverrides>(() => loadOverrides());
  const [refMatchThresholds, setRefMatchThresholds] = useState<RefMatchThresholds>(
    () => loadRefMatchThresholds(),
  );
  const profile = applyOverrides(baseProfile, overrides);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, error, starting, locked, start, stop, lockHardware, unlockHardware } =
    useCameraStream({ facingMode: "user" });
  const stability = useDeviceStability(!!stream);
  const report = useFrameAnalysis(videoRef, stability, { intervalMs: 220, profile });
  const [shot, setShot] = useState<ValidatedCapture | null>(null);
  const [auditState, setAuditState] = useState<"idle" | "saving" | "saved">("idle");
  const [auditError, setAuditError] = useState<{
    code: string;
    title: string;
    message: string;
    hint?: string;
  } | null>(null);
  const [session, setSession] = useState<ValidatedCapture[]>([]);
  const [zipping, setZipping] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const autoLockTried = useRef(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  useEffect(() => {
    if (!report || locked || autoLockTried.current) return;
    const aeOk = report.gates.find((g) => g.id === "ae-stable")?.status === "ok";
    const awbOk = report.gates.find((g) => g.id === "awb-stable")?.status !== "fail";
    if (aeOk && awbOk) {
      autoLockTried.current = true;
      void lockHardware();
    }
  }, [report, locked, lockHardware]);

  useEffect(() => {
    if (!stream) autoLockTried.current = false;
  }, [stream]);

  const liveReady = report?.ready ?? false;

  // ---- Auto-retry state ----
  const [autoRetry, setAutoRetry] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [lastRejection, setLastRejection] = useState<{
    gateIds: string[];
    reasons: string[];
  } | null>(null);
  const lastAttemptAt = useRef(0);

  // ---- Histogram reference (persistent across reloads) ----
  const [manualHistRef, setManualHistRef] = useState<HistogramReference | null>(() =>
    loadHistReference(),
  );

  // ---- Calibration presets (per device + mode) ----
  const [presets, setPresets] = useState<CapturePreset[]>(() => loadPresets());
  const [activePresetId, setActivePresetId] = useState<string | null>(() =>
    loadActivePresetId(),
  );
  const activePreset = presets.find((p) => p.id === activePresetId) ?? null;

  // Active preset overrides manual reference for histogram comparison.
  const histRef: HistogramReference | null = activePreset
    ? {
        histogram: activePreset.histogram,
        luminance: activePreset.luminance,
        capturedAt: activePreset.createdAt,
        label: `${activePreset.deviceLabel} · ${activePreset.modeLabel}`,
      }
    : manualHistRef;

  const presetMatch =
    activePreset && report ? matchPreset(activePreset, report.metrics) : null;
  const presetBlocked = !!presetMatch && !presetMatch.distanceOk;

  const captureHistRef = useCallback(() => {
    if (!report) {
      toast.error("Brak metryk — uruchom kamerę i poczekaj na pierwszy frame.");
      return;
    }
    const ref: HistogramReference = {
      histogram: [...report.metrics.histogram],
      luminance: report.metrics.luminance,
      capturedAt: Date.now(),
      label: `Próba ${new Date().toLocaleTimeString()}`,
    };
    setManualHistRef(ref);
    saveHistReference(ref);
    toast.success(`Histogram zarejestrowany (μ ${ref.luminance.toFixed(2)})`);
  }, [report]);

  const clearHistRef = useCallback(() => {
    setManualHistRef(null);
    saveHistReference(null);
    toast.message("Referencja histogramu wyczyszczona");
  }, []);

  const exportHistRef = useCallback(() => {
    if (!histRef) {
      toast.error("Brak referencji do wyeksportowania.");
      return;
    }
    const payload = {
      schema: "msc:hist-reference:v1",
      exportedAt: new Date().toISOString(),
      reference: histRef,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date(histRef.capturedAt)
      .toISOString()
      .replace(/[:.]/g, "-");
    a.href = url;
    a.download = `hist-reference-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast.success("Referencja wyeksportowana (JSON)");
  }, [histRef]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importHistRef = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const ref: HistogramReference | undefined = parsed?.reference ?? parsed;
      if (
        !ref ||
        !Array.isArray(ref.histogram) ||
        ref.histogram.length === 0 ||
        typeof ref.luminance !== "number"
      ) {
        toast.error("Nieprawidłowy plik referencji histogramu.");
        return;
      }
      const sum = ref.histogram.reduce((a, b) => a + (Number(b) || 0), 0);
      if (Math.abs(sum - 1) > 0.05) {
        toast.warning("Histogram nie jest znormalizowany (suma ≠ 1) — importuję mimo to.");
      }
      const clean: HistogramReference = {
        histogram: ref.histogram.map((v) => Number(v) || 0),
        luminance: ref.luminance,
        capturedAt: ref.capturedAt ?? Date.now(),
        label: ref.label ?? `Import ${new Date().toLocaleString()}`,
      };
      setManualHistRef(clean);
      saveHistReference(clean);
      toast.success(`Referencja zaimportowana (μ ${clean.luminance.toFixed(2)})`);
    } catch (e) {
      console.error(e);
      toast.error("Nie udało się odczytać pliku JSON.");
    }
  }, []);

  const handleSavePreset = useCallback((p: CapturePreset) => {
    setPresets((prev) => {
      const next = [...prev, p];
      savePresets(next);
      return next;
    });
  }, []);

  const handleActivatePreset = useCallback((id: string | null) => {
    setActivePresetId(id);
    saveActivePresetId(id);
    if (id) toast.success("Preset aktywny — wymuszam zgodność na sesji.");
    else toast.message("Preset dezaktywowany.");
  }, []);

  const handleDeletePreset = useCallback(
    (id: string) => {
      setPresets((prev) => {
        const next = prev.filter((p) => p.id !== id);
        savePresets(next);
        return next;
      });
      if (activePresetId === id) {
        setActivePresetId(null);
        saveActivePresetId(null);
      }
      toast.message("Preset usunięty.");
    },
    [activePresetId],
  );

  // ---- Auto-comparison vs reference (live exposure guidance) ----
  // 1 "step" = 1/3 EV (typowy krok kompensacji ekspozycji w aparatach).
  // Aligned when |ΔEV| ≤ 1/6 EV (½ kroku) AND L1 między histogramami < 0.45.
  const STEP_EV = 1 / 3;
  const ALIGN_EV = refMatchThresholds.alignEv;
  const ALIGN_L1 = refMatchThresholds.alignL1;
  const refMatch = (() => {
    if (!histRef || !report) return null;
    const curLum = Math.max(0.001, report.metrics.luminance);
    const refLum = Math.max(0.001, histRef.luminance);
    const evDelta = Math.log2(curLum / refLum);
    const steps = Math.round(evDelta / STEP_EV);
    const a = report.metrics.histogram;
    const b = histRef.histogram;
    let l1 = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) l1 += Math.abs(a[i] - b[i]);
    const aligned = Math.abs(evDelta) <= ALIGN_EV && l1 <= ALIGN_L1;
    return { evDelta, steps, l1, aligned };
  })();
  const refBlocked = (!!refMatch && !refMatch.aligned) || presetBlocked;

  // ---- Trend history of ΔEV / L1 vs reference (last N samples) ----
  type RefSample = { t: number; evDelta: number; l1: number; aligned: boolean };
  const REF_HISTORY_MAX = 24;
  const REF_HISTORY_MIN_INTERVAL_MS = 350;
  const [refHistory, setRefHistory] = useState<RefSample[]>([]);
  const lastRefSampleAt = useRef(0);
  // Reset history when reference identity changes (preset switch, manual save, clear)
  const refKey = histRef ? `${histRef.label ?? ""}@${histRef.capturedAt}` : null;
  useEffect(() => {
    setRefHistory([]);
    lastRefSampleAt.current = 0;
  }, [refKey]);
  useEffect(() => {
    if (!refMatch) return;
    const now = Date.now();
    if (now - lastRefSampleAt.current < REF_HISTORY_MIN_INTERVAL_MS) return;
    lastRefSampleAt.current = now;
    setRefHistory((prev) => {
      const last = prev[prev.length - 1];
      // Skip near-duplicates to keep the trend meaningful
      if (
        last &&
        Math.abs(last.evDelta - refMatch.evDelta) < 0.01 &&
        Math.abs(last.l1 - refMatch.l1) < 0.005 &&
        last.aligned === refMatch.aligned
      ) {
        return prev;
      }
      const next = [...prev, { t: now, evDelta: refMatch.evDelta, l1: refMatch.l1, aligned: refMatch.aligned }];
      return next.length > REF_HISTORY_MAX ? next.slice(-REF_HISTORY_MAX) : next;
    });
  }, [refMatch?.evDelta, refMatch?.l1, refMatch?.aligned]);
  const refTrend = (() => {
    if (refHistory.length < 2) return null;
    const first = refHistory[0];
    const last = refHistory[refHistory.length - 1];
    const dEv = Math.abs(last.evDelta) - Math.abs(first.evDelta);
    const dL1 = last.l1 - first.l1;
    const evImproving = dEv < -0.02;
    const evWorsening = dEv > 0.02;
    const l1Improving = dL1 < -0.02;
    const l1Worsening = dL1 > 0.02;
    return { dEv, dL1, evImproving, evWorsening, l1Improving, l1Worsening };
  })();

  // ---- Contextual lighting/exposure hints (kierunek + magnituda + anomalie) ----
  type RefHint = { icon: "sun" | "moon" | "lamp" | "shadow" | "burn" | "frame" | "wb" | "wait"; tone: "info" | "warn" | "act"; text: string };
  const refHints: RefHint[] = (() => {
    if (!refMatch || !report) return [];
    const m = report.metrics;
    const t = report.temporal;
    const out: RefHint[] = [];
    const absEv = Math.abs(refMatch.evDelta);
    const tooDark = refMatch.evDelta < 0;
    const tooBright = refMatch.evDelta > 0;

    if (absEv > ALIGN_EV) {
      if (tooDark) {
        if (absEv > 0.66) out.push({ icon: "lamp", tone: "act", text: "Za ciemno o ponad ⅔ EV — podejdź bliżej do źródła światła lub włącz dodatkową lampę." });
        else if (absEv > 0.33) out.push({ icon: "lamp", tone: "act", text: "Wyraźnie za ciemno (~⅓–⅔ EV) — odsłoń okno lub skieruj lampę bezpośrednio na obszar." });
        else out.push({ icon: "sun", tone: "info", text: "Lekko za ciemno — delikatnie podnieś jasność (kompensacja EV +) albo zbliż źródło światła." });
      } else if (tooBright) {
        if (absEv > 0.66) out.push({ icon: "moon", tone: "act", text: "Za jasno o ponad ⅔ EV — odsuń się od źródła światła lub przygaś lampę." });
        else if (absEv > 0.33) out.push({ icon: "moon", tone: "act", text: "Wyraźnie za jasno (~⅓–⅔ EV) — zasłoń część okna albo zmień kąt względem światła." });
        else out.push({ icon: "sun", tone: "info", text: "Lekko za jasno — delikatnie obniż jasność (kompensacja EV −) lub odejdź od lampy." });
      }
    }

    const clipHigh = m.clippingHigh ?? 0;
    const clipLow = m.clippingLow ?? 0;
    if (clipHigh > 0.04) out.push({ icon: "burn", tone: "act", text: `Przepalenia w jasnych partiach (${(clipHigh * 100).toFixed(1)}%) — odsuń lampę albo unikaj bezpośredniego refleksu na skórze.` });
    if (clipLow > 0.04) out.push({ icon: "shadow", tone: "act", text: `Głębokie cienie (${(clipLow * 100).toFixed(1)}% pikseli czarnych) — doświetl od strony cienia lub zmień kąt o ~30°.` });

    if (refMatch.l1 > ALIGN_L1 && absEv <= ALIGN_EV) {
      out.push({ icon: "shadow", tone: "warn", text: "Średnia jasność OK, ale rozkład odbiega od referencji — sprawdź kierunek światła i unikaj cieni połowicznych (jedna strona twarzy ciemniejsza)." });
    }

    if ((m.colorCast ?? 0) > 0.06) {
      const dominant =
        Math.abs(m.castR) >= Math.abs(m.castG) && Math.abs(m.castR) >= Math.abs(m.castB)
          ? m.castR > 0 ? "ciepły (czerwony/żółty)" : "chłodny (cyan)"
          : Math.abs(m.castB) >= Math.abs(m.castG)
            ? m.castB > 0 ? "chłodny (niebieski)" : "ciepły (żółty)"
            : m.castG > 0 ? "zielonkawy (LED)" : "magentowy";
      out.push({ icon: "wb", tone: "warn", text: `Dominujący odcień ${dominant} — użyj jednego, neutralnego źródła światła (unikaj mieszania żarówek z dziennym).` });
    }

    if (m.skinRatio > 0 && m.skinRatio < 0.18) out.push({ icon: "frame", tone: "info", text: "Twarz/obszar zajmuje za mało kadru — podejdź bliżej (~10–20 cm)." });
    else if (m.skinRatio > 0.7) out.push({ icon: "frame", tone: "info", text: "Za blisko — odsuń telefon o ~10 cm, żeby uzyskać proporcje jak w referencji." });
    if (m.centerOffset > 0.35) out.push({ icon: "frame", tone: "info", text: "Obszar zainteresowania jest poza środkiem — wyśrodkuj kadr." });

    if (t && t.luminanceStd > 0.025 && t.samples >= 4) {
      out.push({ icon: "wait", tone: "info", text: "Auto-ekspozycja jeszcze się stabilizuje — wstrzymaj korektę ~2 s i nie ruszaj telefonem." });
    }

    const seen = new Set<string>();
    return out.filter((h) => (seen.has(h.text) ? false : (seen.add(h.text), true))).slice(0, 4);
  })();


  // Blocking gates (live HUD): all currently failing, plus warnings if no fails
  const blockingGates = (() => {
    if (!report) return [];
    const fails = report.gates.filter((g) => g.status === "fail");
    if (fails.length) return fails;
    return report.gates.filter((g) => g.status === "warn");
  })();

  const capture = useCallback((): "accepted" | "rejected" | "skipped" => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0 || !report) return "skipped";

    // Hard-block capture while preset (zoom/odległość) doesn't match.
    if (presetMatch && !presetMatch.distanceOk) {
      setLastRejection({
        gateIds: ["preset-distance"],
        reasons: [`Niezgodność z presetem kalibracji: ${presetMatch.hint}`],
      });
      return "rejected";
    }

    // Hard-block capture while exposure is not aligned with the saved reference.
    if (refMatch && !refMatch.aligned) {
      const dir = refMatch.steps > 0 ? "obniż" : "podnieś";
      const n = Math.abs(refMatch.steps);
      setLastRejection({
        gateIds: ["histogram-ref"],
        reasons: [
          `Histogram odbiega od referencji o ${refMatch.evDelta >= 0 ? "+" : ""}${refMatch.evDelta.toFixed(2)} EV (L1 ${refMatch.l1.toFixed(2)}). ${dir} ekspozycję o ${n} ${n === 1 ? "krok" : "kroków"} (1/3 EV każdy).`,
        ],
      });
      return "rejected";
    }

    lastAttemptAt.current = Date.now();

    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return "skipped";
    ctx.drawImage(v, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);

    const validation = validateCapture({
      rgba: img.data,
      width: c.width,
      height: c.height,
      roi: DEFAULT_FACE_ROI,
      stability,
      temporal: report.temporal,
      profile,
    });

    if (validation.status === "rejected") {
      const failingIds = validation.report.gates
        .filter((g) => g.status === "fail")
        .map((g) => g.id);
      setLastRejection({ gateIds: failingIds, reasons: validation.reasons });
      console.warn("[capture-rejected]", {
        profile: validation.profileVersion,
        reasons: validation.reasons,
        gateIds: failingIds,
        metrics: validation.report.metrics,
      });
      return "rejected";
    }

    const rawDataUrl = c.toDataURL("image/jpeg", 0.92);
    const capturedAt = new Date().toISOString();
    const qualityReport = buildCaptureMetadata({
      capturedAt,
      width: c.width,
      height: c.height,
      validation,
    });
    const schemaCheck = validateQualityReport(qualityReport);
    if (!schemaCheck.ok) {
      setSchemaError(`${schemaCheck.message}${schemaCheck.issues?.length ? ` — ${schemaCheck.issues.join("; ")}` : ""}`);
      toast.error("Raport jakości niezgodny ze schematem", {
        description: schemaCheck.message,
      });
      console.error("[capture-schema-invalid]", schemaCheck);
      return "rejected";
    }
    if (schemaCheck.warnings.length) {
      toast.warning("Ostrzeżenie schematu raportu", {
        description: schemaCheck.warnings.join(" • "),
      });
    }
    setSchemaError(null);
    const qualityReportJson = JSON.stringify(qualityReport, null, 2);
    const { dataUrl } = embedQualityReportInJpeg(rawDataUrl, qualityReport);

    const frame: ValidatedCapture = {
      dataUrl,
      width: c.width,
      height: c.height,
      validation,
      capturedAt,
      profileVersion: validation.profileVersion,
      qualityReport,
      qualityReportJson,
    };
    setShot(frame);
    setAuditState("idle");
    setSession((s) => [...s, frame]);
    setLastRejection(null);
    onAccepted?.(frame);
    return "accepted";
  }, [report, stability, onAccepted, profile, refMatch, presetMatch]);

  // Manual shutter — also enables auto-retry mode if rejected.
  const onShutter = () => {
    setRetryAttempt(0);
    const result = capture();
    if (result === "accepted") {
      toast.success("Zdjęcie zaakceptowane", {
        description: `Profil ${profile.version}.`,
      });
      setAutoRetry(false);
    } else if (result === "rejected") {
      setAutoRetry(true);
      toast.info("Auto-retry włączone", {
        description: "Spróbuję ponownie, gdy bramki będą OK.",
        duration: 3500,
      });
    }
  };

  // Auto-retry: when shutter was rejected, keep trying as soon as live gates pass.
  useEffect(() => {
    if (!autoRetry || !liveReady || refBlocked) return;
    if (Date.now() - lastAttemptAt.current < RETRY_DEBOUNCE_MS) return;
    if (retryAttempt >= MAX_AUTO_RETRIES) {
      setAutoRetry(false);
      toast.error("Auto-retry przerwane", {
        description: `Wykonano ${MAX_AUTO_RETRIES} prób. Skoryguj kadr i spróbuj ponownie.`,
      });
      return;
    }
    const result = capture();
    if (result === "accepted") {
      toast.success("Zdjęcie zaakceptowane (auto-retry)", {
        description: `Próba ${retryAttempt + 1}/${MAX_AUTO_RETRIES}.`,
      });
      setAutoRetry(false);
      setRetryAttempt(0);
    } else if (result === "rejected") {
      setRetryAttempt((n) => n + 1);
    }
  }, [autoRetry, liveReady, retryAttempt, capture]);

  // Stop auto-retry if user stops the camera
  useEffect(() => {
    if (!stream) {
      setAutoRetry(false);
      setRetryAttempt(0);
      setLastRejection(null);
    }
  }, [stream]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border bg-black">
        {!stream && !error && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Camera className="h-10 w-10 opacity-60" />
            <p className="text-sm">Kamera wyłączona</p>
          </div>
        )}
        {error && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-red-200">
            <CameraOff className="h-10 w-10" />
            <p className="text-sm">{error}</p>
          </div>
        )}
        {stream && (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
            <FaceGuideOverlay roi={DEFAULT_FACE_ROI} ready={liveReady} />
            {report && (
              <div className="absolute inset-x-2 top-2 space-y-1.5">
                <QualityHUD gates={report.gates} />
                <HistogramHUD metrics={report.metrics} reference={histRef} />
                {refMatch && (
                  <div
                    className={`rounded-md border px-2.5 py-1.5 text-[11px] backdrop-blur-md ${
                      refMatch.aligned
                        ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-50"
                        : "border-amber-400/50 bg-amber-500/25 text-amber-50"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {refMatch.aligned ? (
                      <span className="font-semibold">
                        ✓ Ekspozycja zgodna z referencją — możesz robić zdjęcie
                      </span>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {refMatch.steps > 0 ? "▼" : "▲"} Skoryguj{" "}
                          {refMatch.steps > 0 ? "w dół" : "w górę"} o{" "}
                          <span className="tabular-nums">
                            {Math.max(1, Math.abs(refMatch.steps))}
                          </span>{" "}
                          {Math.max(1, Math.abs(refMatch.steps)) === 1 ? "krok" : "kroków"} (1/3 EV)
                        </span>
                        <span className="tabular-nums opacity-90">
                          ΔEV {refMatch.evDelta >= 0 ? "+" : ""}
                          {refMatch.evDelta.toFixed(2)} · L1 {refMatch.l1.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {refHistory.length >= 2 && (
                      <div className="mt-1.5 border-t border-white/10 pt-1.5">
                        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide opacity-80">
                          <span>Trend ostatnich {refHistory.length} klatek</span>
                          {refTrend && (
                            <span className="tabular-nums normal-case tracking-normal">
                              <span className={refTrend.evImproving ? "text-emerald-300" : refTrend.evWorsening ? "text-red-300" : "opacity-80"}>
                                ΔEV {refTrend.evImproving ? "↘" : refTrend.evWorsening ? "↗" : "→"} {refTrend.dEv >= 0 ? "+" : ""}{refTrend.dEv.toFixed(2)}
                              </span>
                              {" · "}
                              <span className={refTrend.l1Improving ? "text-emerald-300" : refTrend.l1Worsening ? "text-red-300" : "opacity-80"}>
                                L1 {refTrend.l1Improving ? "↘" : refTrend.l1Worsening ? "↗" : "→"} {refTrend.dL1 >= 0 ? "+" : ""}{refTrend.dL1.toFixed(2)}
                              </span>
                            </span>
                          )}
                        </div>
                        {(() => {
                          // Twin sparklines: |ΔEV| and L1, normalized independently
                          const W = 160;
                          const H = 22;
                          const n = refHistory.length;
                          const evVals = refHistory.map((s) => Math.abs(s.evDelta));
                          const l1Vals = refHistory.map((s) => s.l1);
                          const evMax = Math.max(ALIGN_EV * 2, ...evVals, 0.01);
                          const l1Max = Math.max(ALIGN_L1 * 1.3, ...l1Vals, 0.01);
                          const xAt = (i: number) => (n === 1 ? 0 : (i / (n - 1)) * W);
                          const evPath = evVals.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${(H - (v / evMax) * H).toFixed(1)}`).join(" ");
                          const l1Path = l1Vals.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${(H - (v / l1Max) * H).toFixed(1)}`).join(" ");
                          const evThreshY = H - (ALIGN_EV / evMax) * H;
                          const l1ThreshY = H - (ALIGN_L1 / l1Max) * H;
                          return (
                            <div className="mt-1 flex items-center gap-2">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] opacity-70 w-6">|ΔEV|</span>
                                <svg width={W} height={H} className="overflow-visible">
                                  <line x1={0} x2={W} y1={evThreshY} y2={evThreshY} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 2" />
                                  <path d={evPath} fill="none" stroke="currentColor" strokeWidth={1.25} className="text-emerald-300" />
                                  {refHistory.map((s, i) => (
                                    <circle key={i} cx={xAt(i)} cy={H - (Math.abs(s.evDelta) / evMax) * H} r={1.5} className={s.aligned ? "fill-emerald-300" : "fill-amber-300"} />
                                  ))}
                                </svg>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] opacity-70 w-4">L1</span>
                                <svg width={W} height={H} className="overflow-visible">
                                  <line x1={0} x2={W} y1={l1ThreshY} y2={l1ThreshY} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 2" />
                                  <path d={l1Path} fill="none" stroke="currentColor" strokeWidth={1.25} className="text-sky-300" />
                                  {refHistory.map((s, i) => (
                                    <circle key={i} cx={xAt(i)} cy={H - (s.l1 / l1Max) * H} r={1.5} className={s.aligned ? "fill-emerald-300" : "fill-amber-300"} />
                                  ))}
                                </svg>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {locked && (
              <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-50 backdrop-blur">
                <Lock className="h-3 w-3" /> AE/AWB lock
              </div>
            )}
            {/* Blocking-gate banner (live) — lists all gates currently blocking the shutter */}
            {!liveReady && blockingGates.length > 0 && (
              <div className="absolute inset-x-2 bottom-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-[12px] text-amber-50 backdrop-blur-md max-h-[45%] overflow-y-auto">
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Migawka zablokowana ({blockingGates.length}):
                </div>
                <ul className="space-y-1">
                  {blockingGates.map((g) => (
                    <li key={g.id} className="leading-snug">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 mr-1.5 text-[10px] font-bold uppercase tracking-wide ${
                          g.status === "fail"
                            ? "bg-red-500/30 text-red-50"
                            : "bg-amber-400/30 text-amber-50"
                        }`}
                      >
                        {g.label}
                      </span>
                      <span className="opacity-95">
                        {gateHint(g, report?.metrics, report?.temporal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Auto-retry overlay */}
            {autoRetry && (
              <div className="absolute left-2 bottom-2 flex items-center gap-1.5 rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-1 text-[11px] font-medium text-sky-50 backdrop-blur">
                <Loader2 className="h-3 w-3 animate-spin" />
                Auto-retry {retryAttempt}/{MAX_AUTO_RETRIES}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!stream ? (
          <Button onClick={start} disabled={starting} className="flex-1">
            <Camera /> {starting ? "Uruchamianie…" : "Włącz kamerę"}
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={stop}>
              <CameraOff /> Stop
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => (locked ? unlockHardware() : lockHardware())}
              title={locked ? "Odblokuj AE/AWB" : "Zablokuj AE/AWB"}
            >
              {locked ? <Lock /> : <LockOpen />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={captureHistRef}
              disabled={!report}
              title="Zapisz histogram bieżącej klatki jako referencję"
            >
              <BookmarkPlus />
            </Button>
            {histRef && (
              <Button
                variant="outline"
                size="icon"
                onClick={exportHistRef}
                title="Eksportuj referencję histogramu (JSON)"
              >
                <Download />
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              title="Importuj referencję histogramu z pliku JSON"
            >
              <Upload />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importHistRef(f);
                e.target.value = "";
              }}
            />
            {histRef && (
              <Button
                variant="outline"
                size="icon"
                onClick={clearHistRef}
                title="Wyczyść referencję histogramu"
              >
                <XIcon />
              </Button>
            )}
            {autoRetry ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setAutoRetry(false);
                  setRetryAttempt(0);
                }}
                className="flex-1"
              >
                <RefreshCw /> Anuluj auto-retry
              </Button>
            ) : (
              <Button
                onClick={onShutter}
                disabled={!report || refBlocked}
                className="flex-1"
                variant={liveReady && !refBlocked ? "default" : "secondary"}
                title={
                  refBlocked && refMatch
                    ? `Skoryguj ekspozycję o ${Math.max(1, Math.abs(refMatch.steps))} krok(ów) 1/3 EV (${refMatch.steps > 0 ? "w dół" : "w górę"})`
                    : undefined
                }
              >
                <Aperture />{" "}
                {refBlocked && refMatch
                  ? `Skoryguj o ${Math.max(1, Math.abs(refMatch.steps))} ${Math.max(1, Math.abs(refMatch.steps)) === 1 ? "krok" : "kroków"} (1/3 EV)`
                  : liveReady
                    ? "Wykonaj zdjęcie"
                    : "Spróbuj — włączę auto-retry"}
              </Button>
            )}
          </>
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Profil progów: <span className="font-mono">{profile.version}</span>
      </p>

      <ThresholdPanel
        current={profile.live}
        baseline={baseProfile.live}
        onChange={setOverrides}
        refMatch={refMatchThresholds}
        onRefMatchChange={setRefMatchThresholds}
      />

      <CalibrationPresets
        presets={presets}
        activeId={activePresetId}
        metrics={report?.metrics ?? null}
        deviceLabel={stream?.getVideoTracks()[0]?.label}
        onSave={handleSavePreset}
        onActivate={handleActivatePreset}
        onDelete={handleDeletePreset}
      />

      {/* Last rejection details — clear, persistent until accepted */}
      {schemaError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          <p className="font-medium">Niezgodny schemat raportu jakości</p>
          <p className="mt-0.5 leading-snug opacity-90">{schemaError}</p>
        </div>
      )}

      {lastRejection && !shot && (
        <div className="space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" />
            Ostatnia migawka odrzucona
          </div>
          <p className="text-amber-800 dark:text-amber-200">
            {blockingHint(lastRejection.gateIds, lastRejection.reasons)}
          </p>
          {lastRejection.reasons.length > 0 && (
            <ul className="space-y-0.5 pt-1 text-[11px] text-muted-foreground">
              {lastRejection.reasons.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {shot && (
        <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Zaakceptowano · gotowe do wysłania do CV
          </div>
          <img
            src={shot.dataUrl}
            alt="Zaakceptowany kadr diagnostyczny"
            className="w-full rounded-lg border border-border"
          />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <dt>LapVar</dt>
            <dd className="text-right font-mono">
              {shot.validation.report.metrics.sharpness.toFixed(0)}
            </dd>
            <dt>Luma</dt>
            <dd className="text-right font-mono">
              {shot.validation.report.metrics.luminance.toFixed(3)}
            </dd>
            <dt>Cast</dt>
            <dd className="text-right font-mono">
              {(shot.validation.report.metrics.colorCast * 100).toFixed(2)}%
            </dd>
            <dt>Skin</dt>
            <dd className="text-right font-mono">
              {(shot.validation.report.metrics.skinRatio * 100).toFixed(0)}%
            </dd>
            <dt>AE σ</dt>
            <dd className="text-right font-mono">
              {shot.validation.report.temporal.luminanceStd.toFixed(4)}
            </dd>
            <dt>AWB σ</dt>
            <dd className="text-right font-mono">
              {shot.validation.report.temporal.colorCastStd.toFixed(4)}
            </dd>
          </dl>
          <CaptureReportDetails report={shot.qualityReport} />
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={shot.dataUrl}
              download={`capture-${shot.capturedAt.replace(/[:.]/g, "-")}.jpg`}
              className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted"
            >
              JPG + raport (COM)
            </a>
            <a
              href={`data:application/json;charset=utf-8,${encodeURIComponent(shot.qualityReportJson)}`}
              download={`capture-${shot.capturedAt.replace(/[:.]/g, "-")}.quality.json`}
              className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted"
            >
              Sidecar JSON
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  const { exportQualityReportPdf } = await import(
                    "@/lib/camera/quality-report-pdf"
                  );
                  const { blob, filename } = await exportQualityReportPdf({
                    report: shot.qualityReport,
                    jpegDataUrl: shot.dataUrl,
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1500);
                  toast.success("Raport PDF wygenerowany");
                } catch (e) {
                  console.error(e);
                  toast.error("Nie udało się wygenerować PDF");
                }
              }}
              className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
            >
              Raport PDF
            </button>
            <button
              type="button"
              disabled={auditState === "saving" || auditState === "saved"}
              onClick={async () => {
                setAuditState("saving");
                setAuditError(null);
                try {
                  const { submitCaptureAudit } = await import(
                    "@/lib/camera/capture-audit.functions"
                  );
                  const base64 = shot.dataUrl.slice(shot.dataUrl.indexOf(",") + 1);
                  const res = await submitCaptureAudit({ data: { jpegBase64: base64 } });
                  setAuditState("saved");
                  if (res.deduplicated) {
                    toast.info("Audyt już istniał — pominięto duplikat", {
                      description: `SHA-256 ${res.sha256.slice(0, 12)}…`,
                    });
                  } else {
                    toast.success("Audyt zapisany", {
                      description: `SHA-256 ${res.sha256.slice(0, 12)}…`,
                    });
                  }
                } catch (e) {
                  console.error(e);
                  setAuditState("idle");
                  const raw = e instanceof Error ? e.message : String(e);
                  const m = raw.match(/^\[(E_[A-Z_]+)\]\s*(.*)$/);
                  const code = m?.[1] ?? "E_UNKNOWN";
                  const msg = m?.[2] ?? raw;
                  const meta: Record<string, { title: string; hint: string }> = {
                    E_NO_COM: {
                      title: "Brak segmentu COM w pliku JPEG",
                      hint: "Użyj aparatu MSC do zrobienia zdjęcia. Zdjęcia zewnętrzne lub przekonwertowane tracą metadane jakości.",
                    },
                    E_REPORT_MISSING: {
                      title: "Raport jakości jest pusty",
                      hint: "Powtórz capture — segment COM istnieje, ale nie zawiera ładunku JSON.",
                    },
                    E_SCHEMA_MISMATCH: {
                      title: "Niezgodna wersja schematu raportu",
                      hint: "Zdjęcie pochodzi ze starszej/nowszej wersji aparatu MSC. Zaktualizuj aplikację lub powtórz capture.",
                    },
                    E_SCHEMA_INVALID: {
                      title: "Raport nie spełnia schematu MSC CDSS v1",
                      hint: "Pola raportu są uszkodzone lub niekompletne. Powtórz capture; szczegóły walidacji poniżej.",
                    },
                    E_JPEG_INVALID: {
                      title: "Plik nie jest poprawnym JPEG",
                      hint: "Sprawdź źródło pliku — oczekiwany jest JPEG (FFD8…).",
                    },
                    E_UNKNOWN: {
                      title: "Nie udało się zapisać audytu",
                      hint: "Skopiuj kod błędu i prześlij go do wsparcia.",
                    },
                  };
                  const info = meta[code] ?? meta.E_UNKNOWN;
                  setAuditError({ code, title: info.title, message: msg, hint: info.hint });
                  toast.error(`${info.title} (${code})`, { description: msg });
                }
              }}
              className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-60"
            >
              {auditState === "saving"
                ? "Zapisuję…"
                : auditState === "saved"
                  ? "Audyt zapisany ✓"
                  : "Zapisz audyt"}
            </button>
          </div>
          {auditError && (
            <div
              role="alert"
              className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{auditError.title}</p>
                <code className="rounded bg-destructive/20 px-1.5 py-0.5 font-mono text-[10px]">
                  {auditError.code}
                </code>
              </div>
              <p className="mt-1 break-words opacity-90">{auditError.message}</p>
              {auditError.hint && (
                <p className="mt-1 text-[10px] opacity-80">→ {auditError.hint}</p>
              )}
              <button
                type="button"
                onClick={() => setAuditError(null)}
                className="mt-1.5 text-[10px] underline opacity-70 hover:opacity-100"
              >
                Zamknij
              </button>
            </div>
          )}
          <p className="text-[10px] leading-snug text-muted-foreground">
            Pełny raport jakości (luminancja, ostrość, skóra, histogram, AE/AWB
            temporal, gates) zapisany w segmencie JPEG COM oraz dostępny jako
            sidecar.
          </p>
        </div>
      )}

      {session.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px]">
          <span className="font-medium">
            Sesja: {session.length} {session.length === 1 ? "ujęcie" : "ujęć"}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={zipping}
              onClick={async () => {
                setZipping(true);
                try {
                  const { buildSessionZip } = await import("@/lib/camera/session-zip");
                  const { blob, filename, count } = await buildSessionZip(session);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1500);
                  toast.success(`Sesja wyeksportowana (${count})`, {
                    description: filename,
                  });
                } catch (e) {
                  console.error(e);
                  toast.error("Nie udało się spakować sesji", {
                    description: e instanceof Error ? e.message : undefined,
                  });
                } finally {
                  setZipping(false);
                }
              }}
              className="inline-flex items-center rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
            >
              {zipping ? "Pakuję…" : "Eksport sesji ZIP"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSession([]);
                toast.info("Sesja wyczyszczona");
              }}
              className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted"
            >
              Wyczyść
            </button>
          </div>
        </div>
      )}

      {session.length >= 2 && <HistogramHistory session={session} limit={8} />}

      {!shot && !lastRejection && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          Bramki LIVE odblokowują migawkę; finalna walidacja używa progów CAPTURE
          (ostrzejszych). Jeśli zdjęcie nie przejdzie — auto-retry powtórzy próbę, gdy bramki
          znów będą OK.
        </p>
      )}
    </div>
  );
}
