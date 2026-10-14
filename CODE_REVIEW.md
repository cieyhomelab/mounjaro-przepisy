# Zasady recenzji kodu

Reguły recenzji dla tego repozytorium. Uzupełniają ogólną listę kontrolną recenzenta; przy sprzeczności obowiązują reguły z tego pliku. Kontekst projektu: [AGENTS.md](AGENTS.md), decyzje: [docs/adr/](docs/adr/).

## Priorytety

1. **Zgodność ze specyfikacją.** Zmiana realizuje kryteria akceptacji wskazane w issue i nie wychodzi poza zakres. Funkcje z sekcji „Poza zakresem” (dawkowanie, porady, AI, udostępnianie) to blocker.
2. **Prywatność i bezpieczeństwo.** Wszystkie dane konta traktujemy jak dane o zdrowiu.
3. **Poprawność i testy.** Każda zmiana zachowania ma test, który bez tej zmiany by nie przeszedł.
4. **Kontrakty.** Zmiany API, schematu bazy, formatu eksportu i danych offline są zgodne z [BACKWARD_COMPATIBILITY.md](BACKWARD_COMPATIBILITY.md).
5. **Prostota.** Brak nowych zależności, usług i abstrakcji bez potrzeby wynikającej z zadania.

## Waga uwag

- **Blocker:** wyciek danych użytkownika, endpoint bez sprawdzenia sesji, brak testu dla nowego zachowania, niezgodność z kryterium akceptacji, zepsuta migracja, sekret w repozytorium, funkcja spoza zakresu.
- **Major:** brak walidacji wejścia, logika domenowa poza `src/shared`, test zależny od czasu rzeczywistego lub kolejności, brak obsługi stanu offline albo błędu na ekranie.
- **Minor:** nazewnictwo, czytelność, drobne duplikacje. Nie blokują merge'a.

## Reguły dla tego stosu

### Bezpieczeństwo i prywatność

- Każda trasa pod `/api` poza `/api/health` i `/api/auth/*` wymaga ważnej sesji. Sprawdzenie jest w jednym miejscu (hook Fastify), a nowa trasa nie może go ominąć. Test integracyjny pokazuje odpowiedź 401 bez sesji.
- Żądania zmieniające stan sprawdzają nagłówek `Origin` i wymagają treści JSON; ciasteczko sesji ma `HttpOnly`, `Secure` i `SameSite=Lax`.
- Logi nie zawierają treści żądań, odpowiedzi, adresów z parametrami, e-maila, nazw przepisów ani wartości zdrowotnych. `console.*` jest zabronione.
- Pobieranie cudzych stron (odczyt przepisu, wyszukiwanie) przechodzi przez jeden moduł z limitem czasu, limitem rozmiaru odpowiedzi i blokadą adresów prywatnych, pętli zwrotnej i przekierowań do nich. Nowe wywołanie `fetch` do adresu podanego przez użytkownika poza tym modułem to blocker.
- HTML z cudzych stron nigdy nie jest wstawiany do DOM (`dangerouslySetInnerHTML` jest zabronione); zapisujemy wyłącznie tekst.
- Zdjęcia i eksport są serwowane tylko przez trasy z sesją, z nagłówkiem `Cache-Control: private`.
- Atrapy integracji i trasy `/api/__test/*` są rejestrowane wyłącznie, gdy `APP_ENV` jest różne od `production`; aplikacja odmawia startu przy sprzecznej konfiguracji.
- Brak zewnętrznych skryptów, czcionek, analityki i zgłaszania błędów do usług zewnętrznych. Nowa zależność uruchamiana w przeglądarce nie może wykonywać połączeń sieciowych poza własny serwer.
- Treść powiadomienia push to stały tekst ze specyfikacji, bez dawki, miejsca wkłucia i nazwy leku.

### TypeScript

- Brak `any`, `as` rzutujących dane z zewnątrz i `// @ts-ignore`. Dane z sieci, bazy JSON, IndexedDB i zmiennych środowiskowych przechodzą przez schemat Zod.
- Kształty żądań i odpowiedzi są w `src/shared/contracts/` i używają ich obie strony. Typ zdefiniowany osobno po stronie klienta i serwera to major.
- `src/shared` pozostaje czysty: bez importów z Node, Reacta, Fastify i bazy, bez `Date.now()` i losowości wewnątrz funkcji (czas i identyfikatory przychodzą jako argumenty).
- Obietnice są obsłużone (`await` albo jawne `void`); reguły `typescript-eslint` z informacją o typach nie są wyłączane komentarzem bez uzasadnienia.

### Serwer (Fastify, Drizzle, PostgreSQL)

- Trasa parsuje parametry, zapytanie i treść schematem Zod i odpowiada błędem `validation` z listą pól; nie ufa typom TypeScript na wejściu.
- Trasy są cienkie: logika z dostępem do bazy siedzi w `services/`, a zależności (baza, zegar, integracje) są wstrzykiwane przez `buildApp`, nie importowane jako globalne.
- Zapytania wyłącznie przez Drizzle albo parametryzowane `sql`; sklejanie SQL z wartościami to blocker.
- Operacje zmieniające kilka tabel (zapis przepisu ze składnikami, usunięcie konta) są w jednej transakcji i podbijają wersję danych konta w tej samej transakcji.
- Zmiana `schema.ts` ma wygenerowaną migrację w tym samym PR; migracje z `main` nie są edytowane. Migracja działa na bazie z danymi (kolumna `NOT NULL` ma wartość domyślną albo migrację danych).
- Bieżący czas pochodzi z abstrakcji zegara. Daty kalendarzowe liczone są w strefie Europe/Warsaw.
- Każda zmienna środowiskowa jest czytana w `config.ts` i opisana w `.env.example`.

### Klient (React, PWA)

- Ekrany czytają dane z IndexedDB; odczyt z API bezpośrednio w ekranie (poza logowaniem, odczytem linku i wyszukiwaniem w serwisach) to major, bo łamie pracę offline.
- Filtry, sortowanie, wyszukiwanie w kolekcji, skalowanie i sumowanie listy zakupów wywołują funkcje z `src/shared`; nie ma ich kopii w komponentach.
- Każda akcja zmieniająca dane ma obsługę stanu offline z komunikatem ze specyfikacji oraz obsługę błędu z możliwością ponowienia; dane formularza zostają po nieudanym zapisie.
- Teksty interfejsu są po polsku i zgodne co do słowa z komunikatami w specyfikacji.
- Elementy dotykowe mają co najmniej 44 × 44 px, tekst w trybie gotowania co najmniej 22 px, pola formularzy mają etykiety, a układ działa od szerokości 360 px bez przewijania w poziomie.
- Wylogowanie, wygaśnięcie sesji i odpowiedź 401 czyszczą IndexedDB, Cache Storage i kolejkę zmian offline.
- Service worker nie buforuje odpowiedzi `/api` poza zdjęciami; zmiana strategii buforowania wymaga testu E2E offline.
- Hooki zgodne z regułami `react-hooks`; brak efektów służących do wyliczania stanu pochodnego.

### Wygląd i dostępność (od etapu 5)

- Kolory i wymiary pochodzą z tokenów w `src/client/styles.css`. Klasa domyślnej palety Tailwinda, kolor wpisany w komponent albo wariant `dark:` to major; nowy kolor spoza tabeli „Projekt wizualny” specyfikacji to blocker.
- Kolor `health*` na ekranie kulinarnym (w tym w Ustawieniach) albo brak tła `health-bg` na ekranie zdrowia to niezgodność z kryterium S29, czyli blocker.
- Wybór motywu jest tylko w `localStorage`. Zapis motywu na koncie, w IndexedDB albo w eksporcie, a także usuwanie go przy wylogowaniu, to blocker (S26 i „Poza zakresem”).
- Żądanie przeglądarki do obcej domeny (font, ikona, styl, skrypt) i rozluźnienie CSP to blocker.
- Zmieniony ekran przechodzi testy przekrojowe po katalogu ekranów: pola dotyku 44 × 44 px w 390 px i 1280 px, kontrast axe w obu trybach, brak przewijania poziomego w 360 px. Wyjątek od reguły kontrastu albo pola dotyku dopisany do testu wymaga uzasadnienia opartego na specyfikacji.
- Nowy ekran jest w `tests/e2e/screens.ts`; usunięty ekran z niego znika.
- PR zmieniający wygląd ma odświeżone pliki w `docs/screenshots/` i zrzuty przed i po w opisie, w trzech wariantach (390 px jasny, 390 px ciemny, 1280 px). Recenzent ogląda je i porównuje z opisem ekranu w sekcji „Projekt wizualny”; brak zrzutów w PR etapu 5 to blocker.
- W PR etapu 5 dotychczasowe testy E2E zmieniają się tylko w zakresie dozwolonym przez specyfikację: selektory, dojście do ekranu przez nową nawigację oraz teksty i kroki objęte zmienionymi scenariuszami. Usunięta albo osłabiona asercja zachowania to blocker.
- Teksty przycisków i komunikatów są zgodne co do słowa ze specyfikacją, także formy żeńskie („Wpiszę sama”, „Jak się czułaś po tym posiłku?”).

### Testy

- Logika w `src/shared` ma testy jednostkowe z przypadkami brzegowymi ze specyfikacji (brak danych, remisy sortowania, zaokrąglenia, polskie znaki).
- Nowa trasa ma test integracyjny na prawdziwym PostgreSQL: ścieżka poprawna, walidacja, brak sesji.
- Każde kryterium akceptacji objęte PR-em ma test E2E z identyfikatorem scenariusza w nazwie.
- Testy nie używają `waitForTimeout`, rzeczywistego zegara ani sieci zewnętrznej; czas przesuwa się przez zegar testowy.
- Testy E2E nie zakładają kolejności ani danych z innych testów i przechodzą przy dwóch przebiegach równoległych.
- Test pominięty (`skip`, `fixme`) ma w kodzie powód i numer issue.

### Instalator (`scripts/install.sh`, od specyfikacji 2026-10-14)

- Wartość sekretu (`POSTGRES_PASSWORD`, `GOOGLE_CLIENT_SECRET`, `VAPID_PRIVATE_KEY`) na wyjściu instalatora, w komunikacie błędu albo w pliku poza `.env` to blocker. Testy sprawdzają pełne wyjście, także przy błędach; `set -x` w instalatorze to blocker.
- Nadpisanie niepustej wartości w `.env` w jakiejkolwiek ścieżce kodu to blocker. Zapis `.env` inaczej niż przez atomową zamianę pliku (`mktemp` w tym samym katalogu, `chmod 600`, `mv`), np. `echo >> .env` albo `sed -i`, to blocker (odporność na przerwanie).
- `source .env`, `. .env` albo `eval` na treści `.env` to blocker.
- Wywołanie `docker compose` z pominięciem funkcji, która czyści środowisko (`env -i`) i podaje `--env-file`, `--project-directory` i `-p`, to blocker: zmienna powłoki zmieniłaby hasło bazy albo projekt Compose.
- Zmiana domyślnej nazwy projektu Compose (`mounjaro-przepisy`) albo nazwy wolumenu `db-data` to blocker (odcina dane istniejących instalacji).
- Instalator korzysta na hoście tylko z basha, coreutils i Dockera. Nowe polecenie spoza tego zestawu (`curl`, `openssl`, `jq`, `python`, `sudo`) to major.
- Każde kryterium specyfikacji instalatora ma test w `tests/installer/` z identyfikatorem scenariusza w nazwie. Kryteria danych w bazie, pierwszeństwa `.env` w działającej aplikacji, zatrzymania `caddy` i dwóch uruchomień bez interakcji mają scenariusz w `tests/installer/stack/`; pozostałe działają na atrapie `docker`.
- Komunikaty po polsku; statusy kroków dosłownie „zrobione”, „pominięty, już zrobione”, „błąd”. Błędy wymieniają nazwy zmiennych.
- `scripts/test-installer.sh` przechodzi w CI; nowy scenariusz nie publikuje stałych portów hosta i nie zostawia projektów `inst-*`.

### Infrastruktura

- Skrypty w `scripts/` zachowują kontrakt z `AGENTS.md`: kod wyjścia różny od zera przy błędzie, sprzątanie w `trap`, brak stałych portów, nazwa projektu Compose z `E2E_RUN_ID`.
- Skrypty basha przechodzą `shellcheck` (część `scripts/lint.sh`); wyłączenie reguły komentarzem `# shellcheck disable=` ma uzasadnienie obok.
- CI wywołuje wyłącznie skrypty z `scripts/`; logika nie jest powielana w YAML.
- Wersja obrazu Playwrighta w `Dockerfile` zgadza się z wersją `@playwright/test` w `package.json`.
- Nowa usługa w `compose.yml`, nowa baza albo nowy język mają ADR.
- `package-lock.json` zmienia się tylko razem z `package.json`; nowa zależność jest uzasadniona w opisie PR.
- `scripts/screenshots.sh` i tryb `E2E_SCREENSHOTS=1` nie zmieniają zachowania zwykłego przebiegu `scripts/test-e2e.sh`; zrzuty powstają na stałych, zmyślonych danych i stałym czasie.
