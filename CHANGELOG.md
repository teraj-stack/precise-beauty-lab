# Changelog

Wszystkie istotne zmiany w projekcie dokumentowane są w tym pliku.
Format luźno oparty na [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed — BREAKING

- **Capture audit**: usunięto zdeprecjonowany alias `CaptureAuditInsertResult`.
  Cała ścieżka odpowiedzi serwera używa teraz zunifikowanego typu
  `CaptureAuditSubmitResult` z `@/lib/camera/capture-audit-types` (discriminated
  union po polu `status: "created" | "deduplicated"`).
- UI rozróżnia ścieżki przez `res.status === "deduplicated"` zamiast luźnego
  boola `res.deduplicated` (pole pozostaje jako alias zgodności).

### Added

- `parseCaptureAuditSubmitResult` (Zod) — runtime walidacja kształtu odpowiedzi
  serwera przed użyciem w UI, z bezpiecznym fallback toastem przy niezgodności.
- `describeCaptureAuditResult` — jednolita prezentacja wyniku (tytuł/opis/tone)
  dla toastu i bannera.
- Jawna maszyna stanów przycisku „Zapisz audyt”
  (`src/lib/camera/audit-save-machine.ts`): `idle → saving → created |
  deduplicated | error`, plus helpers `isAuditSaveBusy`,
  `auditSaveButtonLabel`.
- Sekcja **MIGRACJA** w `README.md` oraz szczegółowy przewodnik
  `src/lib/camera/MIGRATION.md`.

### Enforcement

- **ESLint** — globalna reguła `no-restricted-syntax` w `eslint.config.js`
  blokuje każdy import, eksport, deklarację oraz referencję identyfikatora
  `CaptureAuditInsertResult` w całym repo (`.ts`, `.tsx`, `.js`, `.jsx`,
  `.mjs`, `.cjs`).
- **TypeScript** — test kompilacyjny
  `src/lib/camera/__tests__/capture-audit-deprecated-alias.test-d.ts` wymusza
  brak re-eksportu starej nazwy z modułów `capture-audit-*`.
