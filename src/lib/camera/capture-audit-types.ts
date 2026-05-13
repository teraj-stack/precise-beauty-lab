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

// ---------- Runtime validation (defensive against malformed server responses) ----------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BaseSchema = z.object({
  id: z.string().regex(UUID_RE, "id must be a UUID"),
  sha256: z.string().regex(SHA256_HEX_RE, "sha256 must be 64 hex chars"),
  createdAt: z.string().regex(ISO_DATE_RE, "createdAt must be ISO-8601"),
});

export const CaptureAuditSubmitResultSchema: z.ZodType<CaptureAuditSubmitResult> =
  z.discriminatedUnion("status", [
    BaseSchema.extend({
      status: z.literal("created"),
      deduplicated: z.literal(false),
    }),
    BaseSchema.extend({
      status: z.literal("deduplicated"),
      deduplicated: z.literal(true),
    }),
  ]);

export interface CaptureAuditParseSuccess {
  ok: true;
  value: CaptureAuditSubmitResult;
}
export interface CaptureAuditParseFailure {
  ok: false;
  /** Short, user-safe error summary (no raw payload — avoid leaking PII). */
  message: string;
  /** Field paths that failed validation, joined with commas. */
  issues: string;
}

/**
 * Validate an unknown server response against the unified result shape.
 * Use this before passing the value to {@link describeCaptureAuditResult}
 * or any UI surface so a malformed payload surfaces as a controlled
 * fallback toast instead of a runtime crash.
 */
export function parseCaptureAuditSubmitResult(
  raw: unknown,
): CaptureAuditParseSuccess | CaptureAuditParseFailure {
  const r = CaptureAuditSubmitResultSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  const issues = r.error.issues
    .map((i) => i.path.join(".") || "(root)")
    .slice(0, 4)
    .join(", ");
  return {
    ok: false,
    message: "Serwer zwrócił odpowiedź w niezgodnym formacie.",
    issues: issues || "(nieznane pole)",
  };
}
