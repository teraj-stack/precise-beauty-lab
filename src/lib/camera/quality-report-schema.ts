/**
 * Schema validation for the JPEG COM quality report (MSC CDSS v1).
 * Used by both UI (after parsing a sidecar / extracted COM) and the backend
 * (when storing audits) so a corrupt or wrong-version report is rejected
 * with a precise, human-readable error.
 */

import { z } from "zod";
import {
  CAPTURE_METADATA_SCHEMA,
  type CaptureQualityReport,
} from "./capture-metadata";
import { QUALITY_KB_VERSION } from "./types";

const StabilitySchema = z.object({
  angularVelocity: z.number(),
  available: z.boolean(),
});

const TemporalSchema = z.object({
  luminanceStd: z.number(),
  colorCastStd: z.number(),
  samples: z.number().int().nonnegative(),
});

const MetricsSchema = z.object({
  luminance: z.number().min(0).max(1.0001),
  sharpness: z.number().min(0),
  clipping: z.number().min(0).max(1.0001),
  clippingLow: z.number().min(0).max(1.0001),
  clippingHigh: z.number().min(0).max(1.0001),
  histogram: z.array(z.number().min(0).max(1.0001)).length(32),
  colorCast: z.number().min(0),
  skinRatio: z.number().min(0).max(1.0001),
  centerOffset: z.number().min(0),
  roiPixels: z.number().int().nonnegative(),
  timestamp: z.number(),
});

const GateSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
  status: z.enum(["ok", "warn", "fail"]),
  detail: z.string().max(512),
});

export const CaptureQualityReportSchema = z.object({
  schema: z.literal(CAPTURE_METADATA_SCHEMA),
  capturedAt: z.string().datetime(),
  profileVersion: z.string().min(1).max(64),
  thresholdsVersion: z.string().min(1).max(64),
  decision: z.enum(["accepted", "rejected"]),
  reasons: z.array(z.string().max(256)).max(32),
  image: z.object({
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
    mime: z.literal("image/jpeg"),
  }),
  metrics: MetricsSchema,
  stability: StabilitySchema,
  temporal: TemporalSchema,
  gates: z.array(GateSchema).max(64),
  device: z.object({
    userAgent: z.string().max(512).optional(),
    platform: z.string().max(128).optional(),
    pixelRatio: z.number().optional(),
    language: z.string().max(32).optional(),
  }),
});

export const SUPPORTED_REPORT_SCHEMA = CAPTURE_METADATA_SCHEMA;
export const SUPPORTED_THRESHOLDS_VERSION = QUALITY_KB_VERSION;

export type ValidationOutcome =
  | { ok: true; report: CaptureQualityReport; warnings: string[] }
  | { ok: false; code: ValidationErrorCode; message: string; issues?: string[] };

export type ValidationErrorCode =
  | "missing"
  | "schema_mismatch"
  | "shape_invalid";

/**
 * Parse and validate an unknown payload against MSC CDSS v1.
 * - `schema_mismatch` → file came from a different version (UI must surface).
 * - `shape_invalid`   → fields missing / wrong types.
 * Threshold-version drift is reported as a non-fatal warning.
 */
export function validateQualityReport(input: unknown): ValidationOutcome {
  if (input == null || typeof input !== "object") {
    return { ok: false, code: "missing", message: "Brak raportu jakości" };
  }
  const schemaField = (input as { schema?: unknown }).schema;
  if (schemaField !== SUPPORTED_REPORT_SCHEMA) {
    return {
      ok: false,
      code: "schema_mismatch",
      message: `Niezgodna wersja raportu: ${String(schemaField) || "brak"} (oczekiwano ${SUPPORTED_REPORT_SCHEMA})`,
    };
  }
  const parsed = CaptureQualityReportSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((i) => {
      const path = i.path.join(".") || "(root)";
      return `${path}: ${i.message}`;
    });
    return {
      ok: false,
      code: "shape_invalid",
      message: "Raport niezgodny ze schematem MSC CDSS v1",
      issues,
    };
  }
  const warnings: string[] = [];
  if (parsed.data.thresholdsVersion !== SUPPORTED_THRESHOLDS_VERSION) {
    warnings.push(
      `Inna wersja progów: ${parsed.data.thresholdsVersion} (bieżąca ${SUPPORTED_THRESHOLDS_VERSION})`,
    );
  }
  return { ok: true, report: parsed.data as CaptureQualityReport, warnings };
}
