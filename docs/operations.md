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

Zalecana ścieżka to instalator. Ręczna lista kroków jest niżej jako alternatywa.

### Instalator (zalecany)

W katalogu sklonowanego repozytorium:

```bash
scripts/install.sh
```

Instalator wykonuje kroki K1–K9: sprawdza Dockera i Compose, tworzy `.env`, pyta o wariant HTTPS, generuje hasło bazy i klucze VAPID, pyta o wartości od Ciebie (domena, adres Google, dane klienta OAuth, klucz publiczny `age`), uruchamia aplikację i czeka do 3 minut na `ok` z `/api/health`. Każdy krok wypisuje „zrobione”, „pominięty, już zrobione” albo „błąd”. Wartości sekretów nigdy nie trafiają na wyjście. Przed uruchomieniem przygotuj klienta OAuth (poprzednia sekcja) i klucz `age` (sekcja „Kopie zapasowe”).

Ponowne uruchomienie pomija kroki już wykonane, nigdy nie zmienia ustawionej wartości w `.env` (zwłaszcza `POSTGRES_PASSWORD`) i przebudowuje aplikację z bieżącego kodu.

### Tryb bez interakcji

Gdy instalator nie ma terminala (potok, CI), nie zadaje pytań. Wartości bierze z `.env`, a brakujące z zmiennych środowiskowych o tych samych nazwach; wartość z `.env` ma pierwszeństwo. Gdy czegoś brakuje albo coś jest niepoprawne, instalator wymienia wszystkie takie zmienne i kończy się błędem.

| Zmienna | Wartość |
| --- | --- |
| `HTTPS_MODE` | `caddy` (usługa `caddy` kończy HTTPS, porty 80 i 443) albo `proxy` (własne reverse proxy, aplikacja na `127.0.0.1:${APP_PORT:-3000}`) |
| `APP_DOMAIN` | nazwa hosta bez `https://`; wymagana w wariancie `caddy` |
| `APP_BASE_URL` | `https://<domena>`; wystarczy podać jedną z `APP_DOMAIN` i `APP_BASE_URL`, drugą instalator wylicza |
| `ALLOWED_EMAIL` | jedyny adres Google, który może się zalogować |
| `GOOGLE_CLIENT_ID` | z klienta OAuth |
| `GOOGLE_CLIENT_SECRET` | z klienta OAuth (sekret) |
| `BACKUP_AGE_RECIPIENT` | klucz publiczny `age`, zaczyna się od `age1` |
| `POSTGRES_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | opcjonalne; bez nich instalator wygeneruje wartości (klucze VAPID podaje się parą) |

Sekretów (`GOOGLE_CLIENT_SECRET`, `POSTGRES_PASSWORD`, `VAPID_PRIVATE_KEY`) nie wpisuj w linii polecenia, bo trafią do historii powłoki i listy procesów. Dwa bezpieczne sposoby:

```bash
# 1. Wpisanie bez echa i bez zapisu w historii
read -rs GOOGLE_CLIENT_SECRET; export GOOGLE_CLIENT_SECRET

# 2. Plik z uprawnieniami 600, wczytany do środowiska
install -m 600 /dev/null ~/mp-instalacja.env
${EDITOR:-nano} ~/mp-instalacja.env      # linie KLUCZ=wartość
set -a; . ~/mp-instalacja.env; set +a
```

Potem uruchom (reszta wartości, które nie są sekretami, może iść w linii polecenia):

```bash
HTTPS_MODE=caddy APP_DOMAIN=przepisy.example.com ALLOWED_EMAIL=ty@example.com \
  GOOGLE_CLIENT_ID=... BACKUP_AGE_RECIPIENT=age1... scripts/install.sh < /dev/null
```

Po instalacji usuń plik z sekretami (`shred -u ~/mp-instalacja.env`) i wyczyść zmienne (`unset GOOGLE_CLIENT_SECRET`).

### Zmiana wariantu HTTPS

Wariant jest zapisany w `.env` jako `HTTPS_MODE`. Żeby go zmienić, ustaw w `.env` `HTTPS_MODE=proxy` albo `HTTPS_MODE=caddy` (dla `caddy` musi być ustawiona `APP_DOMAIN`) i uruchom `scripts/install.sh` ponownie. Instalator nie pyta o wariant ani nie zmienia `.env`; przy zmianie na `proxy` zatrzymuje usługę `caddy` i wystawia aplikację na `127.0.0.1:${APP_PORT:-3000}`, przy zmianie na `caddy` uruchamia usługę `caddy`. Dane w bazie zostają.

### Instalacja ręczna (alternatywa)

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

Plik `.env` zawiera sekrety: nie commituj go i ogranicz dostęp (`chmod 600 .env`). Instalację ręczną można później objąć instalatorem: `scripts/install.sh` zapyta tylko o wariant i brakujące wartości, a istniejących nie zmieni.

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

Zalecana ścieżka:

1. `git pull` w katalogu aplikacji.
2. `scripts/install.sh` — pomija zrobione kroki, nie zmienia `.env`, przebudowuje i uruchamia aplikację w zapisanym wariancie i czeka na `ok`. Migracje stosują się przy starcie; dane w wolumenie `db-data` zostają.
3. Zaloguj się i sprawdź działanie.

Alternatywa (ręcznie): po `git pull` uruchom `docker compose --profile tls up -d --build` (bez `--profile tls`, jeśli używasz własnego proxy) i sprawdź `/api/health`.

## Diagnostyka

- Logi: `docker compose logs --tail 100 app` (logi nie zawierają danych użytkownika).
- Certyfikat się nie wystawia: sprawdź rekord DNS domeny i otwarte porty 80/443 (`docker compose logs caddy`).
- Instalator zgłasza „Aplikacja nie odpowiada po 3 minutach”: sprawdź logi poleceniem `docker compose --project-directory <katalog> -p mounjaro-przepisy logs --tail 100 app` (`<katalog>` to katalog repozytorium; logi nie zawierają danych użytkownika).
- Po zmianie `.env` uruchom ponownie `scripts/install.sh` (albo ręcznie polecenie z „Aktualizacji”).
