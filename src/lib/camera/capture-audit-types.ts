/**
 * Unified server response types for the capture-audit submit pipeline.
 *
 * Both branches (newly inserted vs. deduplicated existing row) share the
 * same shape so the UI can render one consistent state machine for the
 * "Save audit" button, the result toast, and any downstream navigation
 * (e.g. "open existing audit").
 *
 * Discriminator: `status` ("created" | "deduplicated").
 * Boolean alias: `deduplicated` (kept for ergonomic checks and backwards
 * compatibility with existing call sites).
 */

import { z } from "zod";

export type CaptureAuditSubmitStatus = "created" | "deduplicated";

export interface CaptureAuditSubmitResultBase {
  /** UUID of the row in `capture_audits` (winner row when deduplicated). */
  id: string;
  /** SHA-256 of the saved JPEG, lowercase hex. */
  sha256: string;
  /** ISO timestamp the row was first created in DB. */
  createdAt: string;
  /** Discriminator. */
  status: CaptureAuditSubmitStatus;
  /** Convenience boolean — true iff `status === "deduplicated"`. */
  deduplicated: boolean;
}

export interface CaptureAuditCreatedResult extends CaptureAuditSubmitResultBase {
  status: "created";
  deduplicated: false;
}

export interface CaptureAuditDeduplicatedResult extends CaptureAuditSubmitResultBase {
  status: "deduplicated";
  deduplicated: true;
}

export type CaptureAuditSubmitResult =
  | CaptureAuditCreatedResult
  | CaptureAuditDeduplicatedResult;

// ---------- Presentation helpers ----------

export type CaptureAuditResultTone = "success" | "info";

export interface CaptureAuditResultPresentation {
  tone: CaptureAuditResultTone;
  /** Short one-line title — suitable for toasts and inline banners. */
  title: string;
  /** Secondary line — SHA prefix + creation timestamp in pl-PL locale. */
  description: string;
  /** Aria-label for screen readers; mirrors title + description. */
  ariaLabel: string;
  /** Stable label for the optional "open existing audit" CTA, or null when N/A. */
  openExistingLabel: string | null;
}

function shaPrefix(sha: string): string {
  return `${sha.slice(0, 12)}…`;
}

function fmtCreatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pl-PL");
  } catch {
    return iso;
  }
}

/**
 * Map a server response to a single, deterministic UI presentation.
 * Use the same helper for the toast, the inline status banner, and any
 * other surface so wording stays consistent.
 */
export function describeCaptureAuditResult(
  res: CaptureAuditSubmitResult,
): CaptureAuditResultPresentation {
  if (res.status === "deduplicated") {
    const description = `SHA-256 ${shaPrefix(res.sha256)} · zapisany ${fmtCreatedAt(res.createdAt)}`;
    return {
      tone: "info",
      title: "Audyt już istniał — pominięto duplikat",
      description,
      ariaLabel: `Duplikat audytu. ${description}`,
      openExistingLabel: "Otwórz audyt",
    };
  }
  const description = `SHA-256 ${shaPrefix(res.sha256)}`;
  return {
    tone: "success",
    title: "Audyt zapisany",
    description,
    ariaLabel: `Audyt zapisany. ${description}`,
    openExistingLabel: null,
  };
}
