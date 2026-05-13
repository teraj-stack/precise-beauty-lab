/**
 * Explicit finite-state machine for the "Save audit" button.
 *
 * Phases mirror the unified server result discriminator
 * (`CaptureAuditSubmitResult.status`), so the UI never has to combine
 * loose booleans (`saving`, `saved`, `dedupInfo`, `auditError`) that can
 * drift apart.
 *
 *   idle ──submit──▶ saving ──ok(created)──▶ created
 *                          ├──ok(deduplicated)──▶ deduplicated
 *                          └──fail──▶ error
 *
 *   {created|deduplicated|error} ──reset──▶ idle
 *
 * Invariants enforced by the reducer:
 *   - `submit` is only valid from `idle` or `error` (retry after failure).
 *   - `ok` / `fail` are only valid from `saving` (late responses are dropped).
 *   - `reset` from any phase returns to `idle`.
 */

import type {
  CaptureAuditCreatedResult,
  CaptureAuditDeduplicatedResult,
  CaptureAuditSubmitResult,
} from "./capture-audit-types";

export interface AuditSaveError {
  code: string;
  title: string;
  message: string;
  hint?: string;
}

export type AuditSaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "created"; result: CaptureAuditCreatedResult }
  | { phase: "deduplicated"; result: CaptureAuditDeduplicatedResult }
  | { phase: "error"; error: AuditSaveError };

export type AuditSaveAction =
  | { type: "submit" }
  | { type: "ok"; result: CaptureAuditSubmitResult }
  | { type: "fail"; error: AuditSaveError }
  | { type: "reset" };

export const initialAuditSaveState: AuditSaveState = { phase: "idle" };

export function auditSaveReducer(
  state: AuditSaveState,
  action: AuditSaveAction,
): AuditSaveState {
  switch (action.type) {
    case "submit":
      // Allow retrying from error; ignore from saving / terminal success.
      if (state.phase === "idle" || state.phase === "error") {
        return { phase: "saving" };
      }
      return state;

    case "ok":
      // Drop late responses unless we're actively saving.
      if (state.phase !== "saving") return state;
      if (action.result.status === "deduplicated") {
        return { phase: "deduplicated", result: action.result };
      }
      return { phase: "created", result: action.result };

    case "fail":
      if (state.phase !== "saving") return state;
      return { phase: "error", error: action.error };

    case "reset":
      return initialAuditSaveState;

    default:
      return state;
  }
}

// ---------- Derived view helpers (single source of truth for the button) ----------

export function isAuditSaveBusy(state: AuditSaveState): boolean {
  return state.phase === "saving";
}

export function isAuditSaveTerminal(state: AuditSaveState): boolean {
  return state.phase === "created" || state.phase === "deduplicated";
}

/** Disable the submit button in saving + terminal success phases. */
export function isAuditSaveDisabled(state: AuditSaveState): boolean {
  return isAuditSaveBusy(state) || isAuditSaveTerminal(state);
}

export function auditSaveButtonLabel(state: AuditSaveState): string {
  switch (state.phase) {
    case "saving":
      return "Zapisuję…";
    case "created":
      return "Audyt zapisany ✓";
    case "deduplicated":
      return "Duplikat — pominięto ✓";
    case "error":
      return "Spróbuj ponownie";
    case "idle":
    default:
      return "Zapisz audyt";
  }
}
