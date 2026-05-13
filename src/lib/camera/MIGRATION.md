# MIGRACJA: `CaptureAuditInsertResult` → `CaptureAuditSubmitResult`

Stary alias `CaptureAuditInsertResult` został **usunięty**. Pełni jego rolę
zunifikowany typ `CaptureAuditSubmitResult` z `@/lib/camera/capture-audit-types`,
który modeluje obie ścieżki odpowiedzi serwera (nowy wiersz vs. dedup) jako
discriminated union po polu `status`.

## Dlaczego

- Jedno źródło prawdy dla UI (FSM przycisku „Zapisz audyt”, toast, banner).
- Bezpieczne rozróżnianie ścieżek przez `status: "created" | "deduplicated"`
  zamiast luźnego `deduplicated?: boolean`.
- Walidacja runtime przez `parseCaptureAuditSubmitResult` (Zod) chroni UI
  przed niezgodnymi kształtami payloadu.

## Mapowanie pól

| Stare (`CaptureAuditInsertResult`) | Nowe (`CaptureAuditSubmitResult`)                      |
| ---------------------------------- | ------------------------------------------------------ |
| `id: string`                       | `id: string` (bez zmian)                               |
| `sha256: string`                   | `sha256: string` (bez zmian)                           |
| `createdAt: string`                | `createdAt: string` (bez zmian)                        |
| `deduplicated?: boolean`           | `status: "created" \| "deduplicated"` + `deduplicated` |

## Krok po kroku

1. **Importy** — zamień:
   ```ts
   // przed
   import type { CaptureAuditInsertResult } from "@/lib/camera/capture-audit-core";
   // po
   import type { CaptureAuditSubmitResult } from "@/lib/camera/capture-audit-types";
   ```

2. **Rozróżnianie ścieżek** — preferuj dyskryminator `status` zamiast boola:
   ```ts
   // przed
   if (res.deduplicated) { /* ... */ }
   // po
   if (res.status === "deduplicated") { /* ... */ }
   ```
   Pole `deduplicated` nadal istnieje (alias dla wygody) — pozostaje zsynchronizowane
   z `status` na poziomie typów (`status: "created"` ⇔ `deduplicated: false`).

3. **Walidacja odpowiedzi** — przed użyciem w UI:
   ```ts
   import { parseCaptureAuditSubmitResult } from "@/lib/camera/capture-audit-types";

   const parsed = parseCaptureAuditSubmitResult(rawResponse);
   if (!parsed.ok) {
     toast.error(parsed.message, { description: parsed.issues });
     return;
   }
   useResult(parsed.value);
   ```

4. **Prezentacja** — używaj `describeCaptureAuditResult(res)` zamiast ręcznie
   formatować tytuł/opis dla toastu i bannera.

5. **State machine przycisku** — patrz `audit-save-machine.ts`
   (`auditSaveReducer`, `isAuditSaveBusy`, `auditSaveButtonLabel`).

## Egzekwowanie

- **ESLint** (`eslint.config.js`): globalna reguła `no-restricted-syntax`
  blokuje każdy import, eksport, deklarację oraz referencję identyfikatora
  `CaptureAuditInsertResult` w całym repo.
- **TypeScript** (`__tests__/capture-audit-deprecated-alias.test-d.ts`):
  test kompilacyjny wymusza brak re-eksportu starej nazwy z modułów
  `capture-audit-*`.
