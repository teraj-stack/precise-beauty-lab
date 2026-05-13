# Plan wdrożenia panelu MySkinCode

Realizacja w 4 fazach. Każdą fazę kończymy działającym, klikalnym kawałkiem — nie budujemy wszystkiego naraz, żeby uniknąć błędów i regresji w obecnym module aparatu.

## Faza 0 — Fundament (wykonam od razu po akceptacji)

- Włączenie **Lovable Cloud** (auth + DB + storage zdjęć).
- Schemat DB:
  - `profiles` (id → auth.users, imię, nazwisko, tytuł, awatar, pin_hash)
  - `user_roles` + enum `app_role` (`admin`, `cosmetologist`) + funkcja `has_role`
  - `patients` (dane podstawowe, alerty medyczne JSON, owner_id)
  - `appointments` (patient_id, start, end, status, typ, notatki)
  - `consultations` (wywiad kosmetologiczny — JSON form data, autosave)
  - `treatment_notes` (oś czasu zabiegów)
  - `gallery_photos` (patient_id, url, kategoria przed/po, sesja)
  - `home_care_plans` (beauty plan, JSON)
- RLS: każdy kosmetolog widzi tylko swoich pacjentów (`owner_id = auth.uid()` lub admin via `has_role`).
- Storage bucket `patient-photos` (prywatny, RLS po owner_id).
- Layout: `SidebarProvider` + `AppSidebar` (Dashboard, Pacjenci, Kalendarz, Aparat, Ustawienia) + top bar (search, dzwonek, [+ Nowa wizyta], [+ Pacjent]).
- Trasy `_authenticated` z gate'em sesji + `/login`, `/onboarding`.

## Faza 1 — Auth + Onboarding + UX wrażliwych danych

- `/login` (email+hasło, opcjonalnie Google).
- Kreator pierwszego logowania: hasło → 4-cyfrowy PIN (hashowany, do szybkiego unlock w sesji) → profil zawodowy → mini-tour (3 kroki, tooltipy z `data-driven` overlayem).
- **Sticky alert bar** w karcie pacjenta (alergie, ciąża, rozrusznik) — komponent reużywalny.
- **Privacy Mode**: globalny toggle w top barze, dodaje klasę `privacy-blur` na nazwiska/tagi pacjentów w listach i menu.
- **Autosave hook** `useAutosave` (debounce 2 s, zapis do `consultations`, toast „Zapisano"; przy ponownym otwarciu — dialog „Masz niezapisany wywiad. Kontynuować?").

## Faza 2 — Dashboard + Pacjenci

- **Dashboard** (`/`):
  - Widget „Bieżąca / Następna wizyta" (duży kafel, przycisk **Otwórz Kartę Pacjenta**).
  - Widget „Oś czasu dnia" (kompaktowy timeline z kolorami: zielony=odbyta, niebieski=zaplanowana).
  - Widget „Do zrobienia" (uzupełnij notatki, zatwierdź home care).
- **Lista pacjentów** (`/patients`): wyszukiwarka, filtry (aktywni / z zaległymi wizytami / nowi), virtualized table.
- **Karta pacjenta** (`/patients/$id`) — 5 zakładek:
  1. Informacje ogólne (sticky alert tagi u góry)
  2. Wywiad kosmetologiczny (formularz: checkboxy, suwaki stanu skóry, autosave)
  3. Historia zabiegów (oś czasu z notatkami)
  4. Galeria zmian (porównywarka przed/po, slider, upload do storage)
  5. Beauty Plan (kreator home care z listą produktów i częstotliwością)

## Faza 3 — Kalendarz

- `/calendar` — widok Dnia / Tygodnia (siatka godzin, drag wizyt opcjonalnie później).
- Dialog „Szczegóły wizyty" z linkiem **Otwórz Kartę Pacjenta**.
- Tworzenie wizyty z top bara (`+ Nowa wizyta`) — wybór pacjenta, godziny, typu.

## Faza 4 — Integracja aparatu i polish

- Aparat zostaje pod `/capture` jako osobne narzędzie w sidebarze, ale dochodzi przycisk „Przypisz zdjęcie do pacjenta" → upload do `gallery_photos`.
- Settings (`/settings`): zmiana motywu jasny/ciemny, zmiana PINu, powiadomienia.
- Mój profil (`/profile`): statystyki (liczba wizyt w tygodniu, top zabiegi), edycja danych.

## Decyzje techniczne

- Stack: TanStack Start (już jest) + shadcn/ui + Tailwind tokens (oklch w `src/styles.css`) + Lovable Cloud.
- Routing: `_authenticated` layout z `beforeLoad` gate na sesję Supabase.
- Server functions (`createServerFn` + `requireSupabaseAuth`) dla wszystkich operacji na pacjentach / wizytach / zdjęciach. RLS jako druga linia obrony.
- Walidacja inputów: `zod` po stronie klienta i serwera.
- Design: czysty „medical & beauty" — neutralna paleta (off-white tła, akcent różowo-pudrowy lub zieleń mięty — do dogadania), Inter/Plus Jakarta Sans, sporo whitespace, zaokrąglenia 12–16px.

## Co teraz po akceptacji

Po Twoim OK zaczynam **Fazę 0 + Fazę 1** w jednym przejściu (fundament + logowanie + onboarding + szkielet nawigacji + privacy mode). To da Ci klikalny zalogowany panel z pustymi modułami, do którego w kolejnych iteracjach dodamy treść (dashboard, pacjenci, kalendarz).
