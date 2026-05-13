/**
 * Integrity envelope for stored quality reports.
 *
 * Each capture_audit.report gets an `_integrity` block that pins:
 *  - parserVersion: which version of the COM parser + schema validator wrote it
 *  - signature: SHA-256 of the canonical JSON of the report (with `_integrity`
 *    stripped). This is a fingerprint — recomputable in the browser to detect
 *    tampering or accidental edits to the JSONB after the fact.
 *
 * NOTE: this is integrity, not authenticity. We do not sign with a secret —
 * any client could re-fingerprint a forged report. Combined with row-level
 * security and immutable history, it is enough to flag corrupted/edited rows.
 */

export const PARSER_VERSION = "msc-cdss-parser/1.0.0";
export const INTEGRITY_VERSION = "msc-integrity/v1";

export interface IntegrityEnvelope {
  parserVersion: string;
  integrityVersion: string;
  signature: string; // sha256 hex
  signedAt: string; // ISO
  algorithm: "sha256-canonical-json";
}

/** Stable JSON.stringify with deterministic key ordering. */
export function canonicalJsonStringify(value: unknown): string {
  const seen = new WeakSet();
  const stringify = (v: unknown): string => {
    if (v === null) return "null";
    if (typeof v === "number") return Number.isFinite(v) ? JSON.stringify(v) : "null";
    if (typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stringify).join(",") + "]";
    if (typeof v === "object") {
      if (seen.has(v as object)) return "null";
      seen.add(v as object);
      const keys = Object.keys(v as Record<string, unknown>).sort();
      return (
        "{" +
        keys
          .map(
            (k) =>
              JSON.stringify(k) +
              ":" +
              stringify((v as Record<string, unknown>)[k]),
          )
          .join(",") +
        "}"
      );
    }
    return "null";
  };
  return stringify(value);
}

/** Strip the `_integrity` field — used both before signing and before verifying. */
export function stripIntegrity<T extends Record<string, unknown>>(
  report: T,
): Omit<T, "_integrity"> {
  const { _integrity: _omit, ...rest } = report as Record<string, unknown>;
  return rest as Omit<T, "_integrity">;
}

/** SHA-256 → hex. Works in browser (SubtleCrypto) and Node. */
export async function sha256Hex(input: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Node fallback (server function path)
  const { createHash } = await import("crypto");
  return createHash("sha256").update(input).digest("hex");
}

export async function computeReportSignature(
  reportWithoutIntegrity: unknown,
): Promise<string> {
  return sha256Hex(canonicalJsonStringify(reportWithoutIntegrity));
}

export type IntegrityVerdict =
  | { ok: true; signature: string; parserVersion: string }
  | { ok: false; reason: "no-envelope" | "mismatch" | "unknown-algo"; expected?: string; got?: string };

export async function verifyReportIntegrity(
  report: unknown,
): Promise<IntegrityVerdict> {
  if (!report || typeof report !== "object") {
    return { ok: false, reason: "no-envelope" };
  }
  const env = (report as { _integrity?: IntegrityEnvelope })._integrity;
  if (!env || typeof env !== "object" || !env.signature) {
    return { ok: false, reason: "no-envelope" };
  }
  if (env.algorithm !== "sha256-canonical-json") {
    return { ok: false, reason: "unknown-algo" };
  }
  const stripped = stripIntegrity(report as Record<string, unknown>);
  const expected = await computeReportSignature(stripped);
  if (expected !== env.signature) {
    return { ok: false, reason: "mismatch", expected, got: env.signature };
  }
  return { ok: true, signature: env.signature, parserVersion: env.parserVersion };
}
