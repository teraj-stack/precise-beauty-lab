/**
 * Capture metadata builder + JPEG COM-segment embedder.
 *
 * Produces a structured, versioned `CaptureQualityReport` that captures EVERY
 * signal the quality pipeline saw at shutter time (luminance, sharpness, skin,
 * AE/AWB temporal stability, gates verdicts) and embeds it inside the JPEG
 * itself as a COM (0xFFFE) marker, so downstream tooling (CV backend, audit
 * archive, DICOM-like export) can recover it without a sidecar.
 *
 * Format choice: JPEG COM is the most portable container — survives copy,
 * doesn't require an EXIF library, and is readable by any JPEG parser.
 */

import type {
  FrameMetrics,
  QualityGateResult,
  QualityReport,
  StabilityMetrics,
  TemporalStability,
} from "./types";
import { QUALITY_KB_VERSION } from "./types";
import type { CaptureValidation } from "./validate-capture";

export const CAPTURE_METADATA_SCHEMA = "msc-cdss.capture.v1";
export const CAPTURE_METADATA_MAGIC = "MSCDSS1";

export interface CaptureQualityReport {
  schema: typeof CAPTURE_METADATA_SCHEMA;
  capturedAt: string;
  profileVersion: string;
  thresholdsVersion: string;
  decision: "accepted" | "rejected";
  reasons: string[];
  image: { width: number; height: number; mime: "image/jpeg" };
  metrics: {
    luminance: number;
    sharpness: number;
    clipping: number;
    clippingLow: number;
    clippingHigh: number;
    histogram: number[];
    colorCast: number;
    skinRatio: number;
    centerOffset: number;
    roiPixels: number;
    timestamp: number;
  };
  stability: StabilityMetrics;
  temporal: TemporalStability;
  gates: Array<Pick<QualityGateResult, "id" | "label" | "status" | "detail">>;
  device: {
    userAgent?: string;
    platform?: string;
    pixelRatio?: number;
    language?: string;
  };
}

function snapshotDevice(): CaptureQualityReport["device"] {
  if (typeof navigator === "undefined") return {};
  return {
    userAgent: navigator.userAgent,
    platform: (navigator as Navigator & { platform?: string }).platform,
    language: navigator.language,
    pixelRatio: typeof window !== "undefined" ? window.devicePixelRatio : undefined,
  };
}

function pickMetrics(m: FrameMetrics): CaptureQualityReport["metrics"] {
  return {
    luminance: +m.luminance.toFixed(5),
    sharpness: +m.sharpness.toFixed(2),
    clipping: +m.clipping.toFixed(5),
    clippingLow: +m.clippingLow.toFixed(5),
    clippingHigh: +m.clippingHigh.toFixed(5),
    histogram: m.histogram.map((b) => +b.toFixed(5)),
    colorCast: +m.colorCast.toFixed(5),
    skinRatio: +m.skinRatio.toFixed(5),
    centerOffset: +m.centerOffset.toFixed(5),
    roiPixels: m.roiPixels,
    timestamp: m.timestamp,
  };
}

export function buildCaptureMetadata(args: {
  capturedAt: string;
  width: number;
  height: number;
  validation: CaptureValidation;
}): CaptureQualityReport {
  const { validation } = args;
  const r: QualityReport = validation.report;
  const reasons = validation.status === "rejected" ? validation.reasons : [];
  return {
    schema: CAPTURE_METADATA_SCHEMA,
    capturedAt: args.capturedAt,
    profileVersion: validation.profileVersion,
    thresholdsVersion: QUALITY_KB_VERSION,
    decision: validation.status,
    reasons,
    image: { width: args.width, height: args.height, mime: "image/jpeg" },
    metrics: pickMetrics(r.metrics),
    stability: r.stability,
    temporal: r.temporal,
    gates: r.gates.map((g) => ({
      id: g.id,
      label: g.label,
      status: g.status,
      detail: g.detail,
    })),
    device: snapshotDevice(),
  };
}

// ---------- JPEG COM embedding ----------

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToDataUrl(bytes: Uint8Array, mime = "image/jpeg"): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

/**
 * Insert a JPEG COM (0xFFFE) marker right after SOI carrying the metadata
 * JSON, prefixed with a magic identifier so a parser can locate it.
 * COM payload max is 65533 bytes — JSON is small (well under 8 KB).
 */
export function embedQualityReportInJpeg(
  jpegDataUrl: string,
  report: CaptureQualityReport,
): { dataUrl: string; bytes: number } {
  const bytes = dataUrlToBytes(jpegDataUrl);
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { dataUrl: jpegDataUrl, bytes: 0 };
  }

  const json = JSON.stringify(report);
  const payload = new TextEncoder().encode(`${CAPTURE_METADATA_MAGIC}${json}`);
  const segLen = payload.length + 2; // length field includes itself
  if (segLen > 0xffff) {
    // Too large for one COM segment — skip embedding silently.
    return { dataUrl: jpegDataUrl, bytes: 0 };
  }

  const marker = new Uint8Array(4 + payload.length);
  marker[0] = 0xff;
  marker[1] = 0xfe;
  marker[2] = (segLen >> 8) & 0xff;
  marker[3] = segLen & 0xff;
  marker.set(payload, 4);

  const out = new Uint8Array(bytes.length + marker.length);
  out[0] = 0xff;
  out[1] = 0xd8;
  out.set(marker, 2);
  out.set(bytes.subarray(2), 2 + marker.length);

  return { dataUrl: bytesToDataUrl(out), bytes: marker.length };
}

/** Extract the embedded report (utility for backend / debugging). */
export function readQualityReportFromJpeg(
  jpegBytes: Uint8Array,
): CaptureQualityReport | null {
  if (jpegBytes.length < 4 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < jpegBytes.length) {
    if (jpegBytes[i] !== 0xff) return null;
    const marker = jpegBytes[i + 1];
    if (marker === 0xd8 || marker === 0xd9) return null;
    const len = (jpegBytes[i + 2] << 8) | jpegBytes[i + 3];
    if (marker === 0xfe) {
      const payload = jpegBytes.subarray(i + 4, i + 2 + len);
      const text = new TextDecoder().decode(payload);
      if (text.startsWith(CAPTURE_METADATA_MAGIC)) {
        try {
          return JSON.parse(text.slice(CAPTURE_METADATA_MAGIC.length));
        } catch {
          return null;
        }
      }
    }
    if (marker === 0xda) return null; // SOS — image data starts
    i += 2 + len;
  }
  return null;
}
