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

## Kopie zapasowe

Usługa `backup` (w `compose.yml`) co 6 godzin robi `pg_dump`, szyfruje go kluczem publicznym `age` i zapisuje plik `app-<data>.dump.age` w katalogu `BACKUP_DIR` (domyślnie `./backups` obok `compose.yml`). Pliki starsze niż 29 dni są usuwane, więc dane usuniętego konta znikają z kopii przed upływem 30 dni obiecanych w aplikacji. Awaria serwera nie powinna kosztować danych starszych niż 6 godzin (cel: 24 godziny).

### Klucze (jednorazowo, na swoim komputerze)

1. Zainstaluj `age` (`apt install age`, `brew install age`) i wygeneruj parę kluczy: `age-keygen -o klucz-kopii.txt`.
2. Wiersz `# public key: age1…` to klucz publiczny. Wpisz go do `.env` jako `BACKUP_AGE_RECIPIENT`.
3. Plik `klucz-kopii.txt` (klucz prywatny) przechowaj poza serwerem, na przykład w menedżerze haseł. Bez niego kopii nie da się odczytać, a serwer go nigdy nie potrzebuje.

Bez `BACKUP_AGE_RECIPIENT` usługa `backup` kończy się błędem i kopii nie robi; sprawdź to w liście kontrolnej poniżej.

### Kopia poza serwer

Pliki w `BACKUP_DIR` są zaszyfrowane, więc nadaje się dowolny magazyn (inny serwer, dysk zewnętrzny, chmura). Skopiuj je regularnie, na przykład z komputera: `rsync -a serwer:/ścieżka/do/backups/ ~/kopie-mounjaro/`. Kopia poza serwerem też musi wygasać po 29 dniach (`find ~/kopie-mounjaro -name 'app-*.dump.age' -mtime +28 -delete`), inaczej dane usuniętego konta zostaną dłużej niż 30 dni.

### Odtworzenie

1. Zatrzymaj aplikację: `docker compose stop app backup`.
2. Odszyfruj wybraną kopię (najnowszą wskazuje nazwa pliku): `age --decrypt -i klucz-kopii.txt backups/app-<data>.dump.age > app.dump`.
3. Wyczyść bazę i wczytaj kopię:
   `docker compose exec -T db psql -U app -d postgres -c 'drop database app' -c 'create database app owner app'`,
   potem `docker compose exec -T db pg_restore -U app -d app --no-owner < app.dump`.
4. Uruchom ponownie: `docker compose up -d` i sprawdź `/api/health` oraz logowanie. Migracje stosują się przy starcie aplikacji, więc kopia ze starszej wersji zostanie zaktualizowana.
5. Usuń `app.dump` (zawiera dane w postaci jawnej).

### Próba odtworzenia

`scripts/restore-drill.sh` sprawdza cały łańcuch na danych testowych w tymczasowych kontenerach: kopia jest zaszyfrowana (nie da się jej odczytać obcym kluczem), stare pliki są usuwane, a po odtworzeniu do drugiej bazy dane są identyczne. CI uruchamia ją przy każdej zmianie. Uruchom ją też ręcznie po zmianie wersji PostgreSQL albo obrazu `backup`.

## Eksport i usunięcie konta

Użytkownik robi to sam w aplikacji: Ustawienia → „Moje dane”. Eksport to plik ZIP z `dane.json` (wszystkie dane konta) i katalogiem `zdjecia/`. Usunięcie konta kasuje dane z bazy od razu i wylogowuje wszystkie urządzenia; kopie zapasowe wygasają po 29 dniach (patrz wyżej).

## Lista kontrolna odbioru wdrożenia

- [ ] Strona otwiera się pod `https://<twoja-domena>` z ważnym certyfikatem, a `http://` przekierowuje na HTTPS.
- [ ] Logowanie kontem z `ALLOWED_EMAIL` działa; inne konto Google zostaje odrzucone.
- [ ] Przepis dodany na telefonie jest widoczny po zalogowaniu na komputerze.
- [ ] Przepis można edytować i usunąć (z potwierdzeniem).
- [ ] Dysk serwera jest zaszyfrowany.
- [ ] `docker compose logs backup` pokazuje `created app-….dump.age`, a plik jest w `BACKUP_DIR`.
- [ ] Klucz prywatny `age` jest poza serwerem i da się nim odszyfrować najnowszą kopię.
- [ ] Ustawienia → „Moje dane” → „Eksportuj dane” pobiera plik ZIP.
- [ ] `.env` nie jest w repozytorium i ma ograniczone uprawnienia.

## Aktualizacja

1. `git pull` w katalogu aplikacji.
2. `docker compose --profile tls up -d --build` (bez `--profile tls`, jeśli używasz własnego proxy). Migracje stosują się przy starcie; dane w wolumenie `db-data` zostają.
3. Sprawdź `/api/health` i zaloguj się.

## Diagnostyka

- Logi: `docker compose logs --tail 100 app` (logi nie zawierają danych użytkownika).
- Certyfikat się nie wystawia: sprawdź rekord DNS domeny i otwarte porty 80/443 (`docker compose logs caddy`).
- Po zmianie `.env` uruchom polecenie z kroku „Aktualizacja” ponownie.
