# Narzędziownia – aplikacja mobilna

Aplikacja mobilna (React Native + Expo) do obsługi systemu Narzędziowni: logowanie, przeglądanie narzędzi, pracowników, wydawanie i zwroty, ustawienia użytkownika.

## Wymagania
- Node.js LTS
- `npm` lub `pnpm`
- Expo (`npm i -g expo-cli` – opcjonalnie)

## Instalacja
- `npm install`

## Konfiguracja API
- Podstawowy adres API znajduje się w `app.json` pod `expo.extra.apiBaseUrl`.
- Dla uruchomień w sieci LAN można użyć zmiennej `EXPO_PUBLIC_API_BASE_URL` w skryptach `package.json` (`start:lan`, `web:lan`).
- Aktualny adres: `http://192.168.10.99:3000`.

## Uruchomienie
- Web: `npm run web` lub `npm run web:lan`
- Mobile (Expo Go): `npm run start` lub `npm run start:lan`

## Autoryzacja
- Logowanie wysyła POST do `POST /api/login` (backend).
- Po sukcesie token jest zapisywany i dołączany w nagłówku `Authorization: Bearer <token>` dla kolejnych zapytań.
- Jeśli token istnieje, aplikacja automatycznie przekierowuje na ekran `Dashboard`.

## Struktura projektu
- `App.js` – konfiguracja nawigacji i ekranów
- `lib/api.js` – klient API z automatycznym dołączaniem tokena
- `screens/` – ekrany aplikacji (m.in. `Login`, `Dashboard`, `Tools`, `Employees`, `IssueReturn`, `UserSettings`)

## Backend
- Backend repo: folder projektu serwera znajduje się poza tym repo lub jest ignorowany w tym repo.
- W środowisku lokalnym serwer działa na `PORT=3000`.

## Troubleshooting (LAN)
- Sprawdź IP komputera (`ipconfig`) i upewnij się, że urządzenie mobilne jest w tej samej sieci.
- Zezwól `node.exe` na komunikację w Windows Firewall (port 3000).
- W razie 404 na `/` – użyj endpointów `/api/...` (np. `/api/ping`).

## Licencja
- Zobacz `LICENSE`.