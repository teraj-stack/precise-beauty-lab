import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Aperture, Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCameraStream } from "@/hooks/useCameraStream";
import { useDeviceStability } from "@/hooks/useDeviceStability";
import { useFrameAnalysis } from "@/hooks/useFrameAnalysis";
import { DEFAULT_FACE_ROI } from "@/lib/camera/quality";
import { QUALITY_KB_VERSION } from "@/lib/camera/types";
import { FaceGuideOverlay } from "./FaceGuideOverlay";
import { QualityHUD } from "./QualityHUD";

interface Props {
  onCapture?: (frame: {
    dataUrl: string;
    width: number;
    height: number;
    metrics: unknown;
    capturedAt: string;
    kbVersion: string;
  }) => void;
}

export function StandardizedCamera({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, error, starting, locked, start, stop, lockHardware, unlockHardware } =
    useCameraStream({ facingMode: "user" });
  const stability = useDeviceStability(!!stream);
  const report = useFrameAnalysis(videoRef, stability, { intervalMs: 220 });
  const [shot, setShot] = useState<string | null>(null);
  const autoLockTried = useRef(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => undefined);
    }
  }, [stream]);

  // Auto-lock hardware AE/AWB once temporal stability is reached.
  useEffect(() => {
    if (!report || locked || autoLockTried.current) return;
    const aeOk = report.gates.find((g) => g.id === "ae-stable")?.status === "ok";
    const awbOk = report.gates.find((g) => g.id === "awb-stable")?.status !== "fail";
    if (aeOk && awbOk) {
      autoLockTried.current = true;
      void lockHardware();
    }
  }, [report, locked, lockHardware]);

  // Reset auto-lock attempt when stream restarts.
  useEffect(() => {
    if (!stream) autoLockTried.current = false;
  }, [stream]);

  const ready = report?.ready ?? false;

  const capture = () => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.92);
    setShot(dataUrl);
    onCapture?.({
      dataUrl,
      width: c.width,
      height: c.height,
      metrics: report?.metrics,
      capturedAt: new Date().toISOString(),
      kbVersion: QUALITY_KB_VERSION,
    });
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
            <FaceGuideOverlay roi={DEFAULT_FACE_ROI} ready={ready} />
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
              disabled={!ready}
              className="flex-1"
              variant={ready ? "default" : "secondary"}
            >
              <Aperture /> {ready ? "Wykonaj zdjęcie" : "Czekam na bramki…"}
            </Button>
          </>
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        KB jakości kadru: <span className="font-mono">{QUALITY_KB_VERSION}</span>
      </p>

      {shot && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Ostatnie zdjęcie</p>
          <img
            src={shot}
            alt="Ostatnio uchwycony kadr w trybie ustandaryzowanej kamery"
            className="w-full rounded-xl border border-border"
          />
        </div>
      )}
    </div>
  );
}
