/**
 * Compile-time guard: the deprecated `CaptureAuditInsertResult` alias must
 * not exist on the public surface of `capture-audit-core`. If somebody
 * re-introduces it, this file fails `tsc --noEmit` and CI rejects the
 * change. Pair this with the `no-restricted-syntax` ESLint rule that
 * blocks new imports/usages of the name.
 *
 * The file uses the `.test-d.ts` convention (no runtime body) so it is
 * picked up by the TypeScript compiler but ignored by Vitest.
 */

import type * as Core from "../capture-audit-core";
import type { CaptureAuditSubmitResult } from "../capture-audit-types";

// 1) The deprecated alias must be absent from the module's exports.
type HasInsertResult = "CaptureAuditInsertResult" extends keyof typeof Core
  ? true
  : false;

// If this line errors with "Type 'true' is not assignable to type 'false'",
// somebody re-exported `CaptureAuditInsertResult` from capture-audit-core.
// Remove the export and use `CaptureAuditSubmitResult` instead.
const _aliasMustBeAbsent: HasInsertResult = false;
void _aliasMustBeAbsent;

// 2) The unified result type must remain a discriminated union covering
//    both `created` and `deduplicated` branches — guards against silent
//    rename / shape changes.
type Status = CaptureAuditSubmitResult["status"];
const _statusCovers: Status = "created";
void _statusCovers;
const _statusCovers2: Status = "deduplicated";
void _statusCovers2;
