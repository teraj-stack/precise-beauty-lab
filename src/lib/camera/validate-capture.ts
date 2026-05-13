/**
 * Capture validation pipeline.
 * Re-runs the full quality analysis on the raw full-resolution captured frame
 * using the STRICTER `capture` profile, then either ACCEPTS (frame may go to
 * backend) or REJECTS with a structured reason for the operator.
 */

import { analyzeFrame, DEFAULT_FACE_ROI, evaluateGates, type RoiRect } from "./quality";
import { QUALITY_PROFILE_V1, type QualityProfile } from "./quality-profiles";
import type { QualityReport, StabilityMetrics, TemporalStability } from "./types";

export interface AcceptedCapture {
  status: "accepted";
  report: QualityReport;
  profileVersion: string;
}

export interface RejectedCapture {
  status: "rejected";
  report: QualityReport;
  profileVersion: string;
  reasons: string[];
}

export type CaptureValidation = AcceptedCapture | RejectedCapture;

export interface ValidateCaptureInput {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  roi?: RoiRect;
  stability: StabilityMetrics;
  temporal: TemporalStability;
  profile?: QualityProfile;
}

export function validateCapture({
  rgba,
  width,
  height,
  roi = DEFAULT_FACE_ROI,
  stability,
  temporal,
  profile = QUALITY_PROFILE_V1,
}: ValidateCaptureInput): CaptureValidation {
  const metrics = analyzeFrame(rgba, width, height, roi);
  const report = evaluateGates(metrics, stability, temporal, profile.capture);

  if (report.ready) {
    return { status: "accepted", report, profileVersion: profile.version };
  }

  const reasons = report.gates
    .filter((g) => g.status === "fail")
    .map((g) => `${g.label}: ${g.detail}`);

  return {
    status: "rejected",
    report,
    profileVersion: profile.version,
    reasons,
  };
}
