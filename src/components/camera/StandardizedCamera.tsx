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
import { FaceGuideOverlay } from "./FaceGuideOverlay";
import { QualityHUD } from "./QualityHUD";
import { HistogramHUD, type HistogramReference } from "./HistogramHUD";

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
  clipping: "Usuń źródła silnego światła z kadru (przepalenia/cienie).",
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
    case "clipping": {
      if (!m) break;
      if (m.clippingHigh > m.clippingLow)
        return `Przepalenia ${(m.clippingHigh * 100).toFixed(1)}% pikseli — usuń silne światło/odbicia w kadrze.`;
      return `Niedoświetlone cienie ${(m.clippingLow * 100).toFixed(1)}% — dodaj światło wypełniające.`;
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
  const profile = profileProp ?? calibration?.profile ?? QUALITY_PROFILE_V1;
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, error, starting, locked, start, stop, lockHardware, unlockHardware } =
    useCameraStream({ facingMode: "user" });
  const stability = useDeviceStability(!!stream);
  const report = useFrameAnalysis(videoRef, stability, { intervalMs: 220, profile });
  const [shot, setShot] = useState<ValidatedCapture | null>(null);
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
  const [histRef, setHistRef] = useState<HistogramReference | null>(() =>
    loadHistReference(),
  );

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
    setHistRef(ref);
    saveHistReference(ref);
    toast.success(`Histogram zarejestrowany (μ ${ref.luminance.toFixed(2)})`);
  }, [report]);

  const clearHistRef = useCallback(() => {
    setHistRef(null);
    saveHistReference(null);
    toast.message("Referencja histogramu wyczyszczona");
  }, []);

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
    setLastRejection(null);
    onAccepted?.(frame);
    return "accepted";
  }, [report, stability, onAccepted, profile]);

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
    if (!autoRetry || !liveReady) return;
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
                disabled={!report}
                className="flex-1"
                variant={liveReady ? "default" : "secondary"}
              >
                <Aperture />{" "}
                {liveReady ? "Wykonaj zdjęcie" : "Spróbuj — włączę auto-retry"}
              </Button>
            )}
          </>
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Profil progów: <span className="font-mono">{profile.version}</span>
      </p>

      {/* Last rejection details — clear, persistent until accepted */}
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
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground">
            Pełny raport jakości (luminancja, ostrość, skóra, histogram, AE/AWB
            temporal, gates) zapisany w segmencie JPEG COM oraz dostępny jako
            sidecar.
          </p>
        </div>
      )}

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
