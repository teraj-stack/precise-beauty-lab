import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Circle,
  RefreshCw,
  Save,
  Trash2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCameraStream } from "@/hooks/useCameraStream";
import { useDeviceStability } from "@/hooks/useDeviceStability";
import { useFrameAnalysis } from "@/hooks/useFrameAnalysis";
import { DEFAULT_FACE_ROI } from "@/lib/camera/quality";
import { FaceGuideOverlay } from "@/components/camera/FaceGuideOverlay";
import { QualityHUD } from "@/components/camera/QualityHUD";
import { HistogramHUD } from "@/components/camera/HistogramHUD";
import { QUALITY_PROFILE_V1 } from "@/lib/camera/quality-profiles";
import {
  CALIBRATION_TARGET_SAMPLES,
  clearCalibration,
  deriveCalibration,
  loadCalibration,
  saveCalibration,
  type CalibrationSample,
  type PersonalCalibration,
} from "@/lib/camera/calibration";

export const Route = createFileRoute("/calibrate")({
  head: () => ({
    meta: [
      { title: "Kalibracja kamery — MSC CDSS" },
      {
        name: "description",
        content:
          "Tryb kalibracji z instrukcjami live (pozycja twarzy, ostrość, światło). Zapisuje indywidualne progi jakości na podstawie kilku poprawnych ujęć.",
      },
    ],
  }),
  component: CalibratePage,
});

const HOLD_FRAMES_REQUIRED = 4; // ~ 4 × 220ms ≈ 0.9 s steady acceptance
const SAMPLE_COOLDOWN_MS = 600;

interface Step {
  id: "position" | "sharpness" | "exposure";
  label: string;
  hint: string;
  /** Returns true when this step is currently satisfied. */
  ok: (gateById: Record<string, "ok" | "warn" | "fail">) => boolean;
}

const STEPS: Step[] = [
  {
    id: "position",
    label: "Pozycja twarzy",
    hint: "Wycentruj twarz w owalu i utrzymaj odległość ~30–50 cm.",
    ok: (g) => g.distance === "ok" && g.position === "ok",
  },
  {
    id: "sharpness",
    label: "Ostrość",
    hint: "Trzymaj telefon nieruchomo aż zniknie blur — oprzyj łokcie.",
    ok: (g) => g.sharpness === "ok" && g.stability !== "fail",
  },
  {
    id: "exposure",
    label: "Światło i balans",
    hint: "Stań przodem do równomiernego, neutralnego światła. Bez przepaleń.",
    ok: (g) =>
      g.exposure === "ok" &&
      g.clipping !== "fail" &&
      g["ae-stable"] !== "fail" &&
      g["awb-stable"] !== "fail",
  },
];

function CalibratePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, error, starting, start, stop } = useCameraStream({ facingMode: "user" });
  const stability = useDeviceStability(!!stream);
  const report = useFrameAnalysis(videoRef, stability, {
    intervalMs: 220,
    profile: QUALITY_PROFILE_V1, // calibration always uses baseline thresholds
  });

  const [samples, setSamples] = useState<CalibrationSample[]>([]);
  const [holdCount, setHoldCount] = useState(0);
  const lastSampleAt = useRef(0);
  const [existing, setExisting] = useState<PersonalCalibration | null>(() =>
    loadCalibration(),
  );

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  const gateById = useMemo(() => {
    const map: Record<string, "ok" | "warn" | "fail"> = {};
    report?.gates.forEach((g) => {
      map[g.id] = g.status;
    });
    return map;
  }, [report]);

  const allReady = !!report?.ready;

  // Increment hold counter while ready; capture sample on threshold reach.
  useEffect(() => {
    if (!report) return;
    if (!allReady) {
      if (holdCount !== 0) setHoldCount(0);
      return;
    }
    const now = Date.now();
    if (now - lastSampleAt.current < SAMPLE_COOLDOWN_MS) return;

    setHoldCount((c) => {
      const next = c + 1;
      if (next >= HOLD_FRAMES_REQUIRED && samples.length < CALIBRATION_TARGET_SAMPLES) {
        lastSampleAt.current = now;
        setSamples((prev) => [
          ...prev,
          { metrics: report.metrics, capturedAt: new Date().toISOString() },
        ]);
        toast.success(`Próbka ${samples.length + 1}/${CALIBRATION_TARGET_SAMPLES} zapisana`);
        return 0;
      }
      return next;
    });
  }, [report, allReady, samples.length, holdCount]);

  const reset = useCallback(() => {
    setSamples([]);
    setHoldCount(0);
    lastSampleAt.current = 0;
  }, []);

  const onSave = useCallback(() => {
    if (samples.length < CALIBRATION_TARGET_SAMPLES) return;
    const calib = deriveCalibration(samples, QUALITY_PROFILE_V1);
    saveCalibration(calib);
    setExisting(calib);
    toast.success("Profil osobisty zapisany", {
      description: `Wersja ${calib.profile.version}.`,
    });
  }, [samples]);

  const onClear = useCallback(() => {
    clearCalibration();
    setExisting(null);
    toast.info("Profil osobisty usunięty — wracam do baseline.");
  }, []);

  const blockingStep = STEPS.find((s) => !s.ok(gateById)) ?? null;

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-md space-y-5">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Wróć
        </Link>

        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Moduł 1 · Kalibracja
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Tryb kalibracji</h1>
          <p className="text-sm text-muted-foreground">
            Złap {CALIBRATION_TARGET_SAMPLES} poprawnych ujęć — system wyliczy
            indywidualne progi (luminancja, ostrość, skin, AE/AWB) dopasowane do
            Twojej twarzy i światła.
          </p>
        </header>

        {existing && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-4 w-4" />
                Aktywny profil osobisty
              </div>
              <button
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
              >
                <Trash2 className="h-3 w-3" /> Usuń
              </button>
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {existing.profile.version} · {existing.sampleCount} próbek · baseline{" "}
              {existing.basedOn}
            </p>
          </div>
        )}

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
              <FaceGuideOverlay roi={DEFAULT_FACE_ROI} ready={allReady} />
              {report && (
                <div className="absolute inset-x-2 top-2 space-y-1.5">
                  <QualityHUD gates={report.gates} />
                  <HistogramHUD metrics={report.metrics} />
                </div>
              )}
              <div className="absolute inset-x-2 bottom-2 rounded-lg border border-white/10 bg-black/55 px-3 py-2 text-[12px] text-white backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    Próbka {samples.length}/{CALIBRATION_TARGET_SAMPLES}
                  </span>
                  <span className="font-mono opacity-80">
                    hold {holdCount}/{HOLD_FRAMES_REQUIRED}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-white/15">
                  <div
                    className="h-full bg-emerald-400 transition-all"
                    style={{
                      width: `${(samples.length / CALIBRATION_TARGET_SAMPLES) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!stream ? (
            <Button onClick={start} disabled={starting} className="flex-1">
              <Camera /> {starting ? "Uruchamianie…" : "Włącz kamerę"}
            </Button>
          ) : (
            <Button variant="outline" onClick={stop}>
              <CameraOff /> Stop
            </Button>
          )}
          <Button variant="outline" onClick={reset} disabled={samples.length === 0}>
            <RefreshCw /> Reset
          </Button>
          <Button
            onClick={onSave}
            disabled={samples.length < CALIBRATION_TARGET_SAMPLES}
            className="flex-1"
          >
            <Save /> Zapisz profil
          </Button>
        </div>

        {/* Live step instructions */}
        <ol className="space-y-2">
          {STEPS.map((step) => {
            const ok = step.ok(gateById);
            const active = !ok && step === blockingStep;
            return (
              <li
                key={step.id}
                className={`flex gap-2.5 rounded-xl border p-3 text-sm transition-colors ${
                  ok
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : active
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-border bg-muted/30"
                }`}
              >
                {ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-amber-600" : "text-muted-foreground"}`}
                  />
                )}
                <div className="space-y-0.5">
                  <div className="font-medium">{step.label}</div>
                  <p className="text-xs text-muted-foreground">{step.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {samples.length === CALIBRATION_TARGET_SAMPLES && (
          <CalibrationPreview samples={samples} />
        )}

        <p className="text-[11px] leading-snug text-muted-foreground">
          Profil bazowy podczas kalibracji: <span className="font-mono">{QUALITY_PROFILE_V1.version}</span>.
          Zapisany profil osobisty będzie automatycznie używany w trybie zdjęć.
        </p>
      </div>
    </main>
  );
}

function CalibrationPreview({ samples }: { samples: CalibrationSample[] }) {
  const calib = useMemo(() => deriveCalibration(samples, QUALITY_PROFILE_V1), [samples]);
  const c = calib.profile.capture;
  const baseline = QUALITY_PROFILE_V1.capture;

  const Row = ({
    label,
    value,
    base,
  }: {
    label: string;
    value: string;
    base: string;
  }) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono">{value}</dd>
      <dd className="text-right font-mono text-muted-foreground">{base}</dd>
    </>
  );

  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4" /> Podgląd progów capture (osobiste vs baseline)
      </div>
      <dl className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-[11px]">
        <dt />
        <dd className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
          Ty
        </dd>
        <dd className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
          Baza
        </dd>
        <Row
          label="Luma min/max"
          value={`${c.luminanceMin.toFixed(2)}–${c.luminanceMax.toFixed(2)}`}
          base={`${baseline.luminanceMin.toFixed(2)}–${baseline.luminanceMax.toFixed(2)}`}
        />
        <Row
          label="Sharp min"
          value={c.sharpnessMin.toFixed(0)}
          base={baseline.sharpnessMin.toFixed(0)}
        />
        <Row
          label="Skin min/max"
          value={`${(c.skinRatioMin * 100).toFixed(0)}–${(c.skinRatioMax * 100).toFixed(0)}%`}
          base={`${(baseline.skinRatioMin * 100).toFixed(0)}–${(baseline.skinRatioMax * 100).toFixed(0)}%`}
        />
        <Row
          label="Cast max"
          value={`${(c.colorCastMax * 100).toFixed(1)}%`}
          base={`${(baseline.colorCastMax * 100).toFixed(1)}%`}
        />
        <Row
          label="Clip max"
          value={`${(c.clippingMax * 100).toFixed(1)}%`}
          base={`${(baseline.clippingMax * 100).toFixed(1)}%`}
        />
        <Row
          label="Offset max"
          value={`${(c.centerOffsetMax * 100).toFixed(0)}%`}
          base={`${(baseline.centerOffsetMax * 100).toFixed(0)}%`}
        />
      </dl>
    </div>
  );
}
