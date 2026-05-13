import { useEffect, useRef, useState } from "react";
import type { StabilityMetrics } from "@/lib/camera/types";

/**
 * Reads DeviceMotion (rotationRate). Requires permission on iOS Safari.
 * Returns smoothed angular-velocity magnitude (rad/s).
 */
export function useDeviceStability(active: boolean) {
  const [metrics, setMetrics] = useState<StabilityMetrics>({
    angularVelocity: 0,
    available: false,
  });
  const smoothed = useRef(0);

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setMetrics({ angularVelocity: 0, available: false });
      return;
    }

    const handler = (e: DeviceMotionEvent) => {
      const r = e.rotationRate;
      if (!r || r.alpha == null) return;
      // deg/s → rad/s magnitude
      const mag =
        Math.sqrt((r.alpha ?? 0) ** 2 + (r.beta ?? 0) ** 2 + (r.gamma ?? 0) ** 2) *
        (Math.PI / 180);
      smoothed.current = smoothed.current * 0.7 + mag * 0.3;
      setMetrics({ angularVelocity: smoothed.current, available: true });
    };

    // iOS permission
    type IosMotion = { requestPermission?: () => Promise<"granted" | "denied"> };
    const ios = DeviceMotionEvent as unknown as IosMotion;
    if (typeof ios.requestPermission === "function") {
      ios.requestPermission().then((r) => {
        if (r === "granted") window.addEventListener("devicemotion", handler);
        else setMetrics({ angularVelocity: 0, available: false });
      }).catch(() => setMetrics({ angularVelocity: 0, available: false }));
    } else {
      window.addEventListener("devicemotion", handler);
      setMetrics((m) => ({ ...m, available: true }));
    }

    return () => window.removeEventListener("devicemotion", handler);
  }, [active]);

  return metrics;
}
