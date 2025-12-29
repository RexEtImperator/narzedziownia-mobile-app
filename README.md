# Narzędziownia – aplikacja mobilna

[![Wersja 1.6.0](https://img.shields.io/badge/version-1.6.0-blue.svg)](#)

Aplikacja mobilna (React Native + Expo) do obsługi systemu Narzędziowni: logowanie, przeglądanie narzędzi, pracowników, wydawanie i zwroty, ustawienia użytkownika, skanowanie kodów.

## Funkcje kluczowe
- Skanowanie kodów (QR/Barcode) i szybkie wydawanie/zwroty.
- Kontrola ilości przy wydawaniu i zwrocie narzędzi (multi-skan i pojedynczy skan).
- Lista „Do zwrotu” automatycznie odświeżana po udanym zwrocie.
- Logowanie biometryczne na urządzeniach mobilnych (Expo Go/dev build).
- Przegląd narzędzi, pracowników, działów i podstawowe ustawienia użytkownika.
- Dodawanie pracowników z Dashboardu i ekranu Pracownicy (wspólny modal).
- Automatyczne wznawianie połączenia z API po powrocie internetu.
- Pasek „Offline” na górze informujący o próbie wznowienia połączenia.
- Picker daty dla pól w BHP (web: `input[type=date]`, mobile: natywny lub fallback), zapisywany jako `YYYY-MM-DD`.

### Nowości w 1.6.0
- **Dark Mode**: Pełne wsparcie dla trybu ciemnego w skanerze (`ScanScreen`), w tym obsługa kolorów systemowych i poprawki inicjalizacji.
- **ScanScreen**: Nowy przycisk "X" do resetowania skanera oraz poprawki widoczności pola wyszukiwania (z-index).
- **Dashboard**: Nowe graficzne kafelki dla szybkich akcji (zamiast przycisków tekstowych).
- **UI/UX**: Odświeżony wygląd zakładek powiadomień (styl "segmented control") i menu administratora.

### Nowości w 1.5.0
- Informacje osobowe: edytowalne tylko „Telefon” i „E‑mail”; pozostałe pola (Imię, Nazwisko, Dział, Stanowisko, Status, Przyjęty, Numer służbowy, UID karty RFID) wyświetlane jako tekst.
- Auto‑zapis i walidacja dla telefonu/e‑maila (komunikaty w snackbarze, bez przycisku „Zapisz zmiany”).
- Logowanie: blokada kont zawieszonych (`employees.status = 'suspended'`) z komunikatem w snackbarze: „Twoje konto jest zawieszone. Skontaktuj się ze swoim pracodawcą.”.
- Ulepszone dopasowanie pracownika po `user.id` (z `/api/login`) do `employees.id`, z bezpiecznymi fallbackami (m.in. `employee_id`, `username`, `email`).
- Naprawa wyświetlania snackbarów (brak `[object Object]`).

## Skaner – skrócona instrukcja
- Multi-skan: dla każdej zeskanowanej pozycji dostępne są przyciski `- / +`
  do zmiany ilości; akcje „Wydaj wszystko” i „Zwróć wszystko” uwzględniają
  ustawione ilości.
- Pojedynczy skan: nad przyciskami „Wydaj” i „Zwróć” znajdują się kontrolki
  ilości; domyślnie 1.
- Sekcja „Do zwrotu”: przy każdej pozycji dostępny jest przycisk „Zwróć”,
  a po udanym zwrocie lista odświeża się automatycznie.

## Wymagania
- Node.js LTS
- `npm` lub `pnpm`
- Expo (opcjonalnie, `npm i -g expo-cli`)

## Instalacja
- `npm install`

## Konfiguracja API
- Podstawowy adres API znajduje się w `app.json` pod `expo.extra.apiBaseUrl`.
- W sieci LAN można ustawić `EXPO_PUBLIC_API_BASE_URL` w skryptach `package.json`
  (`start:lan`, `web:lan`).
- Przykładowy adres: `http://192.168.10.99:3000`.

## Uruchomienie
- Web: `npm run web` lub `npm run web:lan`
- Mobile (Expo Go): `npm run start` lub `npm run start:lan`
 - Wersja web korzysta z portu `8081`.

## Build lokalny – Android (npx expo run:android)
### Wymagania wstępne
- Zainstaluj `Android Studio` oraz składniki `Android SDK` (platformy i build-tools).
- Emulator (AVD) lub urządzenie fizyczne z włączonym `USB debugging`.
- `JDK 17` (zalecane) i ustawiony `JAVA_HOME`.
- (Opcjonalnie na Windows) `ANDROID_HOME` wskazujący na katalog SDK, np.
  `C:\\Users\\<NazwaUżytkownika>\\AppData\\Local\\Android\\Sdk`. Android Studio zwykle tworzy `android/local.properties` automatycznie.

### Kroki
- Uruchom emulator w Android Studio (AVD Manager) lub podłącz urządzenie i sprawdź `adb devices`.
- W katalogu projektu uruchom: `npx expo run:android`.
  - Jeśli folder `android/` nie istnieje, zostanie wygenerowany (prebuild).
  - Po zbudowaniu aplikacja zainstaluje się na emulatorze/urządzeniu i połączy z Metro bundlerem.
- Problemy z połączeniem bundlera:
  - Upewnij się, że komputer i urządzenie są w tej samej sieci.
  - Dla urządzenia podłączonego przez USB możesz użyć `adb reverse tcp:8081 tcp:8081`.
  - Skonfiguruj właściwe API (`EXPO_PUBLIC_API_BASE_URL` lub `app.json`) pod IP maszyny.

### Build release (opcjonalnie)
- `npx expo run:android --variant release` (wymaga konfiguracji keystore).
- Alternatywnie: `cd android && ./gradlew assembleRelease`.
- Do dystrybucji zalecane jest użycie EAS Build.

## Autoryzacja
- Logowanie: `POST /api/login` (backend). Po sukcesie token jest zapisywany
  i dołączany w nagłówku `Authorization: Bearer <token>`.
- Jeśli token istnieje, aplikacja automatycznie przekierowuje na ekran `Dashboard`.
- Logowanie biometryczne: po pierwszym udanym logowaniu dane są zapisywane w
  bezpiecznym schowku (`expo-secure-store`). Opcja dostępna na urządzeniach
  mobilnych; w wersji web ukryta.

## Struktura projektu
- `App.js` – konfiguracja nawigacji i ekranów
- `lib/api.js` – klient API z automatycznym dołączaniem tokena
- `screens/` – ekrany aplikacji (m.in. `Login`, `Dashboard`, `Tools`, `Employees`,
  `ScanScreen`, `UserSettings`)

## Troubleshooting (LAN)
- Sprawdź IP komputera (`ipconfig`) i upewnij się, że urządzenie mobilne
  jest w tej samej sieci.
- Zezwól `node.exe` na komunikację w Windows Firewall (port 3000).
- W razie 404 na `/` – używaj endpointów `/api/...` (np. `/api/ping`).
 - Jeśli natywny picker daty nie jest dostępny w Expo Go, aplikacja korzysta z bezpiecznego pola tekstowego z formatem `YYYY-MM-DD`. Dla pełnego pickera użyj dev build.

## Licencja

Projekt jest licencjonowany na zasadach GPL-3.0.

Copyright (C) 2025 RexEtImperator. All rights reserved.

Szczegóły licencji znajdziesz w pliku [LICENSE](LICENSE).