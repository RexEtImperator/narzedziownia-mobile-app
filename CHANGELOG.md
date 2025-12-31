# Changelog

Wszystkie istotne zmiany w tym projekcie są dokumentowane w tym pliku.
Projekt stosuje konwencję „Keep a Changelog” i SemVer.

## [1.6.1] — 2025-12-31

### Added
- NotificationsScreen: Nowa zakładka "W serwisie" wyświetlająca narzędzia ze statusem `serwis`.
- NotificationsScreen: Wyświetlanie szczegółów serwisowych (data wysłania, numer zlecenia) na liście powiadomień.
- NotificationsScreen: Obsługa nawigacji do szczegółów narzędzia po kliknięciu w powiadomienie serwisowe.

### Changed
- BHPScreen: Ujednolicone formatowanie dat na DD.MM.YYYY w widoku szczegółów i na liście.
- ToolsScreen: Warunkowe wyświetlanie daty przeglądu (DD.MM.YYYY) dla narzędzi z kategorii 'Spawalnicze'.
- ScanScreen: Odświeżony wygląd listy wyboru pracownika (czytelniejsze odstępy, badge z numerem marki, poprawiona kolejność).

### Fixed
- NotificationsScreen: Naprawiono błąd braku wyświetlania narzędzi w zakładce "Po terminie" (poprawa obsługi struktury odpowiedzi API).
- BHPScreen: Poprawiono wyświetlanie daty przeglądu (obsługa formatów ISO i timestamp).

## [1.6.0] — 2025-12-23

### Added
- Dark Mode: pełne wsparcie dla trybu ciemnego w `ScanScreen` (nagłówek, skaner, karty, listy).
- ScanScreen: przycisk "X" na karcie narzędzia do szybkiego resetowania skanera.
- Dashboard: graficzne kafelki (obrazki) dla szybkich akcji (Dodaj pracownika, narzędzie, BHP).

### Changed
- UI: przeprojektowane zakładki w `NotificationsScreen` (styl "segmented control", pełna szerokość).
- App: menu administratora używa teraz komponentu `ThemedButton` dla lepszej spójności wizualnej.
- NativeWind: poprawka inicjalizacji trybu ciemnego (rozwiązanie race condition).

### Fixed
- ScanScreen: poprawiona widoczność pola wyszukiwania (z-index/elevation) przy otwartym BottomSheet.
- ScanScreen: usunięte "hardcoded" kolory, zastąpione motywem systemowym.

## [1.5.0] — 2025-12-03

### Added
- UserSettings: kafelek „Informacje osobowe” z edycją wyłącznie pól „Telefon” i „E‑mail”.
- Auto‑zapis i walidacja dla telefonu/e‑maila; komunikaty w snackbarze.
- Login: blokada logowania dla pracownika ze statusem `suspended` i czytelny komunikat snackbar.
- API/Matching: priorytetowe dopasowanie pracownika po `user.id` → `employees.id` (fallback: `employee_id`, `username`, `email`).

### Changed
- UI: pola nieedytowalne w „Informacje osobowe” wyświetlane jako tekst; usunięty przycisk „Zapisz zmiany”.
- Status pracownika prezentowany po polsku (np. `active` → „Aktywny”, `suspended` → „Zawieszony”).
- Docs: README zaktualizowany o nowości 1.5.0.

### Fixed
- Snackbar: poprawione przekazywanie treści i opcji (koniec z `[object Object]`).

## [1.4.0] — 2025-11-28

### Added
- Auto-retry: klient API automatycznie wznawia żądania po powrocie internetu.
- UI: Pasek „Offline” na górze informujący o próbie wznowienia połączenia.
- DateField: wspólny komponent pickera daty (web i mobile) dla ekranów BHP.

### Changed
- Docs: README zaktualizowany o nowe funkcje (offline, auto-retry, date picker).
- Wersja aplikacji podbita do `1.4.0`.

### Fixed
- Stabilność: brak crashu w Expo Go, gdy natywny picker daty nie jest dostępny (fallback na `TextInput`).

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
