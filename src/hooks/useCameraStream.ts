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
}

export function useCameraStream(opts: UseCameraStreamOptions = {}) {
  const { facingMode = "environment", width = 1280, height = 720 } = opts;
  const [state, setState] = useState<CameraStreamState>({
    stream: null,
    error: null,
    starting: false,
  });
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setState((s) => ({ ...s, starting: true, error: null }));
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
      setState({ stream, error: null, starting: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Nie udało się uruchomić kamery.";
      setState({ stream: null, error: msg, starting: false });
    }
  }, [facingMode, width, height]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState({ stream: null, error: null, starting: false });
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { ...state, start, stop };
}
