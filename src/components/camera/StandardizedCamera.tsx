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
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCameraStream } from "@/hooks/useCameraStream";
import { useDeviceStability } from "@/hooks/useDeviceStability";
import { useFrameAnalysis } from "@/hooks/useFrameAnalysis";
import { DEFAULT_FACE_ROI } from "@/lib/camera/quality";
import { validateCapture, type CaptureValidation } from "@/lib/camera/validate-capture";
import { QUALITY_PROFILE_V1 } from "@/lib/camera/quality-profiles";
import { FaceGuideOverlay } from "./FaceGuideOverlay";
import { QualityHUD } from "./QualityHUD";

const MAX_AUTO_RETRIES = 5;
const RETRY_DEBOUNCE_MS = 350;

/** Human-readable hint per gate, shown when that gate is the blocker. */
const GATE_HINTS: Record<string, string> = {
  "face-fill": "Zbliż lub oddal twarz, aż owal wypełni ramkę.",
  "face-center": "Wycentruj twarz w ramce — kieruj nos na środek.",
  sharpness: "Trzymaj telefon nieruchomo i poczekaj na ostrość.",
  luminance: "Zmień oświetlenie — za jasno lub za ciemno.",
  clipping: "Usuń źródła silnego światła z kadru.",
  "color-cast": "Neutralne oświetlenie — odsuń się od kolorowych lamp.",
  stability: "Trzymaj telefon nieruchomo (lub oprzyj na statywie).",
  "ae-stable": "Czekam, aż auto-ekspozycja się ustabilizuje…",
  "awb-stable": "Czekam, aż balans bieli się ustabilizuje…",
};

function blockingHint(gateIds: string[], reasons: string[]): string {
  const id = gateIds[0];
  const hint = id ? GATE_HINTS[id] : undefined;
  return hint ?? reasons[0] ?? "Bramka jakości nieaktywna.";
}

export interface ValidatedCapture {
  dataUrl: string;
  width: number;
  height: number;
  validation: CaptureValidation;
  capturedAt: string;
  profileVersion: string;
}

interface Props {
  /**
   * Called ONLY for accepted captures. Use it to POST to backend.
   * Rejected captures never reach this callback.
   */
  onAccepted?: (frame: ValidatedCapture) => void;
}

export function StandardizedCamera({ onAccepted }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, error, starting, locked, start, stop, lockHardware, unlockHardware } =
    useCameraStream({ facingMode: "user" });
  const stability = useDeviceStability(!!stream);
  const report = useFrameAnalysis(videoRef, stability, { intervalMs: 220 });
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

  const capture = () => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0 || !report) return;

    // 1. Pull full-resolution pixels
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);

    // 2. Re-validate with STRICT capture profile
    const validation = validateCapture({
      rgba: img.data,
      width: c.width,
      height: c.height,
      roi: DEFAULT_FACE_ROI,
      stability,
      temporal: report.temporal,
      profile: QUALITY_PROFILE_V1,
    });

    // 3. Reject path — DO NOT call onAccepted, do not surface dataUrl
    if (validation.status === "rejected") {
      toast.error("Zdjęcie odrzucone", {
        description: validation.reasons.join(" · "),
        duration: 6000,
      });
      console.warn("[capture-rejected]", {
        profile: validation.profileVersion,
        reasons: validation.reasons,
        metrics: validation.report.metrics,
      });
      return;
    }

    // 4. Accept path
    const dataUrl = c.toDataURL("image/jpeg", 0.92);
    const frame: ValidatedCapture = {
      dataUrl,
      width: c.width,
      height: c.height,
      validation,
      capturedAt: new Date().toISOString(),
      profileVersion: validation.profileVersion,
    };
    setShot(frame);
    toast.success("Zdjęcie zaakceptowane", {
      description: `Profil ${validation.profileVersion} — gotowe do analizy CV.`,
    });
    onAccepted?.(frame);
  };

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
              <div className="absolute inset-x-2 top-2">
                <QualityHUD gates={report.gates} />
              </div>
            )}
            {locked && (
              <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-50 backdrop-blur">
                <Lock className="h-3 w-3" /> AE/AWB lock
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
              onClick={capture}
              disabled={!liveReady}
              className="flex-1"
              variant={liveReady ? "default" : "secondary"}
            >
              <Aperture /> {liveReady ? "Wykonaj zdjęcie" : "Czekam na bramki…"}
            </Button>
          </>
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Profil progów: <span className="font-mono">{QUALITY_PROFILE_V1.version}</span>
      </p>

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
          </dl>
        </div>
      )}

      {!shot && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          Bramki LIVE odblokowują migawkę, ale finalna walidacja używa progów CAPTURE
          (ostrzejszych). Zdjęcia, które nie przejdą, są odrzucane lokalnie i nie trafiają do
          backendu.
        </p>
      )}
    </div>
  );
}
