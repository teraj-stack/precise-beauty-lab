import { useCallback, useEffect, useRef, useState } from "react";

export interface UseCameraStreamOptions {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
}

export interface CameraStreamState {
  stream: MediaStream | null;
  error: string | null;
  starting: boolean;
  /** True after a successful hardware AE/AWB lock attempt. */
  locked: boolean;
}

/** Subset of advanced MediaTrack constraints not in lib.dom. */
interface AdvancedConstraints {
  exposureMode?: "manual" | "continuous";
  whiteBalanceMode?: "manual" | "continuous";
  focusMode?: "manual" | "continuous" | "single-shot";
}

export function useCameraStream(opts: UseCameraStreamOptions = {}) {
  const { facingMode = "environment", width = 1280, height = 720 } = opts;
  const [state, setState] = useState<CameraStreamState>({
    stream: null,
    error: null,
    starting: false,
    locked: false,
  });
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setState((s) => ({ ...s, starting: true, error: null, locked: false }));
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Brak dostępu do API kamery (przeglądarka).");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: width },
          height: { ideal: height },
        },
      });
      streamRef.current = stream;
      setState({ stream, error: null, starting: false, locked: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Nie udało się uruchomić kamery.";
      setState({ stream: null, error: msg, starting: false, locked: false });
    }
  }, [facingMode, width, height]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState({ stream: null, error: null, starting: false, locked: false });
  }, []);

  /**
   * Try to hard-lock exposure / white-balance / focus on the underlying track.
   * Silently no-ops on browsers that don't expose these constraints.
   */
  const lockHardware = useCallback(async (): Promise<boolean> => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return false;
    try {
      const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
      const advanced: AdvancedConstraints = {};
      const exposureModes = caps.exposureMode as string[] | undefined;
      if (exposureModes?.includes("manual")) advanced.exposureMode = "manual";
      const wbModes = caps.whiteBalanceMode as string[] | undefined;
      if (wbModes?.includes("manual")) advanced.whiteBalanceMode = "manual";
      const focusModes = caps.focusMode as string[] | undefined;
      if (focusModes?.includes("manual")) advanced.focusMode = "manual";
      if (Object.keys(advanced).length === 0) return false;
      await track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints);
      setState((s) => ({ ...s, locked: true }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const unlockHardware = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [
          {
            exposureMode: "continuous",
            whiteBalanceMode: "continuous",
            focusMode: "continuous",
          } as AdvancedConstraints,
        ],
      } as MediaTrackConstraints);
    } catch {
      /* noop */
    }
    setState((s) => ({ ...s, locked: false }));
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { ...state, start, stop, lockHardware, unlockHardware };
}
