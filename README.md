# Projekt

## MIGRACJA: `CaptureAuditInsertResult` → `CaptureAuditSubmitResult`

Stary alias `CaptureAuditInsertResult` został usunięty. Używaj zunifikowanego
typu `CaptureAuditSubmitResult` z `@/lib/camera/capture-audit-types`.

Pełny opis: [src/lib/camera/MIGRATION.md](src/lib/camera/MIGRATION.md).

Najważniejsze kroki:

1. **Importy** — zamień import na:
   ```ts
   import type { CaptureAuditSubmitResult } from "@/lib/camera/capture-audit-types";
   ```
2. **Dyskryminator** — używaj `res.status === "deduplicated"` zamiast
   `res.deduplicated`.
3. **Walidacja** — przed użyciem w UI wołaj
   `parseCaptureAuditSubmitResult(raw)` (Zod) i obsłuż `parsed.ok === false`
   bezpiecznym fallback toastem.
4. **Prezentacja** — używaj `describeCaptureAuditResult(res)` do tytułu/opisu
   toastu i bannera.
5. **State machine** — przycisk „Zapisz audyt” opiera się o
   `auditSaveReducer` / `isAuditSaveBusy` / `auditSaveButtonLabel`
   z `src/lib/camera/audit-save-machine.ts`.

Egzekwowane przez ESLint (`no-restricted-syntax` blokuje globalnie każdą
referencję do `CaptureAuditInsertResult`) oraz test kompilacyjny w
`src/lib/camera/__tests__/capture-audit-deprecated-alias.test-d.ts`.
