# Changelog

Wszystkie istotne zmiany w tym projekcie są dokumentowane w tym pliku.
Projekt stosuje konwencję „Keep a Changelog” i SemVer.

## [Unreleased]

### Added
- 

### Changed
- 

### Fixed
- 

## [1.3.0] — 2025-10-21

### Added
- ScanScreen: kontrola ilości dla wydań/zwrotów (pojedynczy i batch).
- Dashboard: kafelek „Dodaj pracownika” otwierający wspólny modal.
- Employees: przycisk „+” w nagłówku uruchamiający modal dodawania.
- Modal: AddEmployeeModal – tworzenie pracownika, pobieranie działów/stanowisk, odświeżanie listy po zapisie.
- Docs: sekcja „Build lokalny – Android (npx expo run:android)” oraz opis dodawania pracowników.

### Changed
- UI: ujednolicenie wyglądu sekcji „Do zwrotu” (spójne style, chip z kodem, kompaktowy przycisk „Zwróć” z ikoną).
- Docs: aktualizacja README.md (skrót obsługi skanera, główne funkcje).

### Fixed
- ScanScreen: automatyczne odświeżanie sekcji „Do zwrotu” po udanym zwrocie.

## [1.2.0] — 2025-10-17

### Added
- Build: konfiguracja EAS (globalny `eas-cli`, uruchomienie buildów Android).

### Changed
- Android: priorytetyzacja `expo-navigation-bar` na New Architecture, eliminacja ostrzeżeń.
- UI: ujednolicenie rozmiarów pól w edycji narzędzia do wzoru edycji pracownika.

### Fixed
- Android: naprawiono zawieszanie Metro przez warunkowy import `global.css` tylko na web.

## [1.1.0] — 2025-10-10

### Added
- Mobile: przekierowanie na Dashboard po udanym logowaniu.
- Mobile: automatyczna nawigacja na Dashboard, jeśli token już istnieje.
- Skrypty: ustawienie `EXPO_PUBLIC_API_BASE_URL` w `start:lan` i `web:lan`.
- Backend: zignorowany zagnieżdżony folder backendu w `.gitignore`.

### Changed
- Konfiguracja: `apiBaseUrl` na `http://192.168.10.99:3000` w `app.json`.
- Git: przemianowanie gałęzi `master` na `main`.

## [1.0.0] — 2025-10-09

### Added
- Inicjalizacja aplikacji mobilnej Expo i podstawowych ekranów.