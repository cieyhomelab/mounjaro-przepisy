# Wdrożenie i eksploatacja

Instrukcja dla właściciela: jak uruchomić Mounjaro Przepisy na własnym serwerze po HTTPS, skonfigurować logowanie Google i aktualizować aplikację. Zmienne środowiskowe opisuje [.env.example](../.env.example).

## Wymagania

- Serwer z Linuksem, Docker i Docker Compose v2.24 lub nowszy.
- Domena skierowana (rekord A/AAAA) na adres serwera; porty 80 i 443 dostępne z internetu.
- Konto Google, którym będziesz się logować.
- Dysk serwera zaszyfrowany (patrz „Zaszyfrowany dysk”). Aplikacja przechowuje dane o zdrowiu.

## Klient OAuth w Google

1. W [Google Cloud Console](https://console.cloud.google.com/) utwórz projekt (albo użyj istniejącego).
2. „APIs & Services” → „OAuth consent screen”: typ „External”, nazwa aplikacji dowolna, Twój adres jako kontakt. Dodaj siebie jako użytkownika testowego (aplikacja może zostać w trybie testowym).
3. „Credentials” → „Create credentials” → „OAuth client ID” → typ „Web application”.
4. W „Authorized redirect URIs” wpisz dokładnie `https://<twoja-domena>/api/auth/google/callback`.
5. Zapisz „Client ID” i „Client secret”; trafią do `.env` jako `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET`.

## Pierwsze uruchomienie

1. Skopiuj repozytorium na serwer i wejdź do jego katalogu.
2. `cp .env.example .env` i uzupełnij:
   - `POSTGRES_PASSWORD` — długie, losowe hasło;
   - `APP_BASE_URL` — `https://<twoja-domena>` (bez końcowego ukośnika);
   - `APP_DOMAIN` — `<twoja-domena>` (bez `https://`), potrzebna usłudze `caddy`;
   - `ALLOWED_EMAIL` — jedyny adres Google, który może się zalogować;
   - `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET` — z poprzedniej sekcji;
   - `BACKUP_AGE_RECIPIENT` — wymagana od etapu 1.5 (kopie zapasowe).
3. Uruchom z HTTPS: `docker compose --profile tls up -d --build`. Usługa `caddy` sama zdobywa i odnawia certyfikat (potrzebuje otwartych portów 80 i 443). Migracje bazy stosują się przy starcie aplikacji.
4. Jeśli serwer ma już własne reverse proxy, uruchom bez profilu (`docker compose up -d --build`); aplikacja nasłuchuje wtedy na `127.0.0.1:${APP_PORT:-3000}` i to proxy ma kończyć HTTPS i przekazywać ruch na ten port.
5. Sprawdź: `curl -fsS https://<twoja-domena>/api/health` zwraca status `ok`, a strona otwiera ekran logowania.

Plik `.env` zawiera sekrety: nie commituj go i ogranicz dostęp (`chmod 600 .env`).

## Zaszyfrowany dysk

Dane (baza PostgreSQL w wolumenie `db-data`, zdjęcia w bazie) leżą na dysku serwera, więc dysk musi być zaszyfrowany:

- w chmurze włącz szyfrowanie dysku/wolumenu u dostawcy;
- na własnym sprzęcie użyj LUKS (instalator większości dystrybucji proponuje to przy partycjonowaniu).

Kopie zapasowe (etap 1.5) są szyfrowane osobno kluczem `age`; klucz prywatny trzymaj poza serwerem.

## Lista kontrolna odbioru wdrożenia

- [ ] Strona otwiera się pod `https://<twoja-domena>` z ważnym certyfikatem, a `http://` przekierowuje na HTTPS.
- [ ] Logowanie kontem z `ALLOWED_EMAIL` działa; inne konto Google zostaje odrzucone.
- [ ] Przepis dodany na telefonie jest widoczny po zalogowaniu na komputerze.
- [ ] Przepis można edytować i usunąć (z potwierdzeniem).
- [ ] Dysk serwera jest zaszyfrowany.
- [ ] `.env` nie jest w repozytorium i ma ograniczone uprawnienia.

## Aktualizacja

1. `git pull` w katalogu aplikacji.
2. `docker compose --profile tls up -d --build` (bez `--profile tls`, jeśli używasz własnego proxy). Migracje stosują się przy starcie; dane w wolumenie `db-data` zostają.
3. Sprawdź `/api/health` i zaloguj się.

## Diagnostyka

- Logi: `docker compose logs --tail 100 app` (logi nie zawierają danych użytkownika).
- Certyfikat się nie wystawia: sprawdź rekord DNS domeny i otwarte porty 80/443 (`docker compose logs caddy`).
- Po zmianie `.env` uruchom polecenie z kroku „Aktualizacja” ponownie.
