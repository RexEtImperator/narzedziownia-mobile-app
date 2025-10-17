# Changelog

Wzorzec: zgodny z „Keep a Changelog”. Daty w formacie RRRR-MM-DD.

## 2025-10-17
- Wydanie 1.2.0.
- Android: naprawiono zawieszanie Metro poprzez warunkowy import `global.css` tylko na web.
- Android: priorytetyzacja `expo-navigation-bar` na New Architecture, eliminacja ostrzeżeń lekarza.
- UI: ujednolicenie rozmiarów pól w edycji narzędzia do wzoru edycji pracownika.
- Build: konfiguracja EAS (globalny `eas-cli`, brak lokalnej instalacji), uruchomienie buildów Android.

## 2025-10-10
- Mobile: dodano przekierowanie na Dashboard po udanym logowaniu.
- Mobile: automatyczna nawigacja na Dashboard, jeśli token już istnieje.
- Konfiguracja: zmieniono `apiBaseUrl` na `http://192.168.10.99:3000` w `app.json`.
- Skrypty: ustawiono `EXPO_PUBLIC_API_BASE_URL` w `start:lan` i `web:lan`.
- Backend (organizacja repo): zignorowano zagnieżdżony folder backendu w `.gitignore`.
- Git: przemianowano gałąź `master` na `main` i wypchnięto zmiany.

## 2025-10-09
- Inicjalizacja aplikacji mobilnej Expo i podstawowych ekranów.