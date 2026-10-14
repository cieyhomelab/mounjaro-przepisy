# AGENTS.md

Instrukcja dla agentów pracujących w tym repozytorium. Przeczytaj ją w całości przed pierwszą zmianą.

## Zasady nadrzędne

1. **Narzędzia uruchamiasz przez `scripts/`, nigdy bezpośrednio na hoście.** Node na hoście jest za stary dla tego projektu; skrypty uruchamiają wszystko w Dockerze z Node 24.
2. **Każda zmiana w zachowaniu ma test.** Każdy scenariusz i każde kryterium akceptacji ze specyfikacji ma test E2E, nazwany identyfikatorem scenariusza (np. `S4: zapis bez tytułu wskazuje brakujące pole`).
3. **Dane użytkownika to dane o zdrowiu.** Nie trafiają do logów, komunikatów błędów, zewnętrznych usług ani do repozytorium (także w danych testowych nie używaj prawdziwych danych osób).
4. **Nie zgaduj API bibliotek.** Kilka z nich ma świeże wersje główne (Vite 8, Vitest 5, React Router 8, ESLint 10, Zod 4). Sprawdź wersję w `package.json` i typy w `node_modules`, zanim użyjesz czegoś z pamięci.
5. **Specyfikacja jest źródłem prawdy o zachowaniu:** `.ai/specs/2026-10-08-mounjaro-przepisy.md` (aplikacja) i `.ai/specs/2026-10-14-instalator.md` (instalator na serwer, `scripts/install.sh`). Sekcja „Sekcje techniczne” każdej z nich opisuje architekturę, model danych, kontrakty i plan etapów.

## Projekt

Mounjaro Przepisy to prywatna aplikacja PWA jednej osoby na diecie wspieranej lekiem Mounjaro: kolekcja sprawdzonych przepisów z filtrami pod tę dietę, tryb gotowania offline, a w kolejnych etapach wyszukiwanie w zaufanych serwisach, planer z listą zakupów i dziennik zdrowia. Interfejs jest wyłącznie po polsku.

## Stos

TypeScript 6 na Node.js 24. Klient: React 19, Vite 8, React Router 8, Tailwind CSS 4. Serwer: Fastify 5, Zod 4, Drizzle ORM, PostgreSQL 18. Testy: Vitest 5, Testing Library, Playwright. Całość w Docker Compose.

Wygląd (etap 5): tokeny jako zmienne CSS wystawione Tailwindowi, fonty z pakietów Fontsource, ikony `lucide-react`, kontrast sprawdzany przez `@axe-core/playwright`.

Instalator na serwer: bash (tylko Docker z Compose ≥ 2.24 i bash na hoście), testowany przez Vitest z atrapą polecenia `docker` i przez scenariusze na prawdziwym stosie; skrypty basha sprawdza `shellcheck`.

Uzasadnienie i odrzucone alternatywy: [docs/adr/0001-stos-technologiczny.md](docs/adr/0001-stos-technologiczny.md) (stos), [docs/adr/0002-wyglad-motyw-i-zaplecze-testow-etapu-5.md](docs/adr/0002-wyglad-motyw-i-zaplecze-testow-etapu-5.md) (wygląd, motyw, zrzuty) i [docs/adr/0003-instalator-na-serwer.md](docs/adr/0003-instalator-na-serwer.md) (instalator i jego testy). Zmiana stosu albo nowa usługa w Compose wymaga nowego ADR w `docs/adr/`.

## Struktura katalogów

| Ścieżka | Co tam jest | Co tam dodawać |
| --- | --- | --- |
| `src/shared/` | Czysty kod wspólny dla klienta i serwera | Schematy Zod żądań i odpowiedzi (`contracts/`), logika domenowa jako czyste funkcje (`domain/`: filtry, sortowanie, skalowanie, wartości odżywcze, lista zakupów, normalizacja adresów, rotacja miejsc wkłucia) |
| `src/server/` | Serwer Fastify | `routes/` (jeden plik na zasób), `services/` (logika z dostępem do bazy i sieci), `integrations/` (Google, odczyt stron, push; każda z atrapą), `db/schema.ts` (tabele Drizzle) |
| `src/server/main.ts` | Punkt startowy: konfiguracja, migracje, nasłuch | Tylko składanie zależności |
| `src/server/app.ts` | Budowa aplikacji Fastify z wstrzykniętymi zależnościami | Rejestracja nowych tras |
| `src/server/config.ts` | Jedyny moduł czytający zmienne środowiskowe | Każdą nową zmienną, z walidacją Zod |
| `src/client/` | Aplikacja React | `screens/` (ekrany), `components/` (elementy wielokrotnego użytku), `data/` (IndexedDB, synchronizacja, wywołania API), `sw.ts` (service worker) |
| `src/client/styles.css` | Tokeny wyglądu: kolory obu trybów, wielkości tekstu, zaokrąglenia, cienie; blok `@theme` Tailwinda | Każdy nowy kolor albo wymiar ze specyfikacji; nigdzie indziej |
| `src/client/components/ui/` | Wspólne elementy interfejsu (przycisk, pole, chip, przełącznik segmentowy, karta, komunikat, pasek postępu) | Element używany na więcej niż jednym ekranie |
| `drizzle/` | Migracje SQL wygenerowane przez `drizzle-kit` | Nic ręcznie, poza migracjami danych (patrz „Migracje”) |
| `tests/integration/` | Testy Vitest z prawdziwym PostgreSQL | Testy tras i serwisów |
| `tests/e2e/` | Testy Playwright | Testy scenariuszy; strony testowe w `tests/e2e/fixtures/`; katalog ekranów z danymi przykładowymi w `tests/e2e/screens.ts` |
| `docs/screenshots/` | Zrzuty każdego ekranu w wariantach `mobile-light`, `mobile-dark`, `desktop-light` | Nic ręcznie; pliki zapisuje `scripts/screenshots.sh` |
| `scripts/` | Jednolity punkt wejścia dla agentów i CI | Nowe skrypty tylko wtedy, gdy potrzebuje ich cały zespół |
| `scripts/install.sh`, `scripts/lib/env.sh` | Instalator na serwer (kroki K1–K9) i funkcje czytające i zapisujące `.env` | Zmiany instalatora; patrz „Instalator” poniżej |
| `tests/installer/` | Testy instalatora: `*.test.ts` (Vitest, atrapa `docker`), `harness.ts`, `fake-docker/docker`, `stack/*.sh` (prawdziwy stos), `compose.installer-test.yml` | Test każdego kryterium specyfikacji instalatora |
| `docs/adr/` | Decyzje architektoniczne | Kolejne ADR z numerem |
| `.ai/` | Specyfikacje i konfiguracja pipeline'u agentów | Nie zmieniaj ręcznie `agentic.config.json` bez potrzeby |

Granice są pilnowane przez ESLint: `src/shared` nie importuje niczego z `src/server`, `src/client`, Node ani frameworków; klient i serwer nie importują siebie nawzajem.

## Gdzie zajrzeć przed zmianą

| Zadanie dotyczy… | Przeczytaj najpierw | Kluczowe reguły |
| --- | --- | --- |
| Endpointu API | `src/server/app.ts`, `src/server/routes/health.ts`, sekcja „Kontrakty API” specyfikacji | Schemat Zod w `src/shared/contracts/`; walidacja każdego wejścia; test integracyjny |
| Tabel i migracji | `src/server/db/schema.ts`, `src/server/db/client.ts`, sekcja „Model danych” specyfikacji | Zmiana schematu i wygenerowana migracja w tym samym commicie |
| Ekranu lub komponentu | `src/client/App.tsx`, `src/client/components/AppShell.tsx`, `src/client/components/ui/`, sekcja „Projekt wizualny” specyfikacji | Teksty po polsku; ekrany czytają dane z IndexedDB; reguły z sekcji „Wygląd i dostępność” poniżej; nowy ekran trafia do `tests/e2e/screens.ts` |
| Kolorów, motywu, nawigacji | `src/client/styles.css`, podsekcja „Wygląd, motyw i nawigacja (etap 5)” specyfikacji, ADR 0002 | Tylko tokeny; `data-theme` i `data-area` na `<html>`; przypisanie ścieżki do pozycji nawigacji w jednej funkcji |
| Filtrów, sortowania, wyliczeń | `src/shared/` | Czyste funkcje z testami jednostkowymi; ten sam kod działa online i offline |
| Integracji zewnętrznej | `.env.example`, sekcja „Integracje” specyfikacji | Interfejs, implementacja prawdziwa i atrapa; atrapa wybierana zmienną środowiskową |
| Testów E2E | `tests/e2e/smoke.spec.ts`, `playwright.config.ts`, `scripts/test-e2e.sh`, `compose.e2e.yml` | Kontrakt poniżej |
| CI | `.github/workflows/ci.yml` | CI wywołuje wyłącznie skrypty z `scripts/` |
| Instalatora albo `.env.example` | `.ai/specs/2026-10-14-instalator.md` (z „Sekcjami technicznymi”), ADR 0003, `scripts/lib.sh`, `tests/installer/harness.ts` | Reguły z sekcji „Instalator” poniżej |
| Procesu pracy | `SDLC.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`, `.ai/agentic.config.json` | — |

## Komendy

Wymagania hosta: Docker z Compose v2.24 lub nowszym oraz bash.

| Komenda | Co robi |
| --- | --- |
| `scripts/lint.sh` | ESLint, sprawdzenie formatowania Prettier, sprawdzenie typów, `shellcheck` skryptów basha |
| `scripts/test-unit.sh` | Testy jednostkowe (Vitest), razem z testami instalatora na atrapie `docker` (projekt `installer`); argumenty trafiają do Vitest, np. `scripts/test-unit.sh --project installer` |
| `scripts/test-integration.sh` | Testy integracyjne z tymczasowym PostgreSQL w projekcie Compose `it-<id>` |
| `scripts/test-e2e.sh` | Testy E2E (Playwright) na tymczasowej instancji całej aplikacji |
| `scripts/build.sh` | Build produkcyjny: klient, serwer i obraz uruchomieniowy |
| `scripts/screenshots.sh` | Zrzuty wszystkich ekranów z katalogu do `docs/screenshots/`; argumenty trafiają do Playwrighta, np. `scripts/screenshots.sh -g "planer\|zakupy"` odświeża tylko te ekrany |
| `scripts/test-installer.sh [scenariusz…]` | Scenariusze instalatora na prawdziwym stosie (`tests/installer/stack/*.sh`), każdy w kopii repozytorium i własnym projekcie Compose `inst-<id>-<nr>`; argumenty wybierają scenariusze po nazwie pliku, np. `scripts/test-installer.sh 10-noninteractive`. Nie należy do pełnej walidacji, CI uruchamia go zawsze |
| `scripts/npm.sh <argumenty>` | npm w Node 24 z zamontowanym katalogiem roboczym. Używaj do wszystkiego, co zapisuje pliki: `scripts/npm.sh install <pakiet>`, `scripts/npm.sh run format`, `scripts/npm.sh run db:generate` |

Pełna walidacja przed PR, w tej kolejności: lint, unit, integration, e2e, build. Każdy skrypt kończy się kodem różnym od zera przy błędzie. Skrypty testowe budują obraz z bieżącego stanu plików, więc nie wymagają commita.

Przygotowanie świeżego worktree: nic nie trzeba instalować, skrypty budują obraz z bieżących plików. Tylko do pracy z edytorem (podpowiedzi typów) i do `scripts/npm.sh exec -- prettier --write <pliki>` uruchom raz `scripts/npm.sh ci`.

Uruchomienie aplikacji lokalnie: `cp .env.example .env`, uzupełnij `POSTGRES_PASSWORD`, potem `docker compose up -d --build`; aplikacja jest pod `http://127.0.0.1:3000`.

## Kontrakt testów E2E

`scripts/test-e2e.sh`:

- stawia własną instancję w projekcie Compose `e2e-${E2E_RUN_ID}`; bez zmiennej losuje identyfikator. Kilka przebiegów może działać równolegle;
- nie publikuje portów na hoście. Kontener Playwrighta dzieli sieć z kontenerem aplikacji, więc testy otwierają `http://localhost:3000` (bezpieczny kontekst wymagany przez service worker i push). Używaj ścieżek względnych (`page.goto('/')`);
- zawsze sprząta kontenery, sieci, wolumeny i obrazy, także po błędzie i przerwaniu;
- wczytuje sekrety z `${SH_SECRETS_DIR:-$HOME/.sh-secrets}/mounjaro-przepisy.env`, jeśli plik istnieje, i działa bez niego;
- przy niepowodzeniu kopiuje ślady i zrzuty ekranu do `test-results/e2e-<id>/`;
- przekazuje argumenty do Playwrighta: ścieżki plików, projekt przeglądarki i filtr nazw, np. `scripts/test-e2e.sh tests/e2e/s19-planner.spec.ts --project mobile-webkit` albo `scripts/test-e2e.sh --project mobile-chromium -g "S4"`;
- z `E2E_SCREENSHOTS=1` dodatkowo kopiuje zrzuty zapisane przez `tests/e2e/screens.spec.ts` do `docs/screenshots/` (tak działa `scripts/screenshots.sh`); bez tej zmiennej niczego tam nie zapisuje.

Zasady pisania testów E2E:

- Testy działają na trzech projektach: `mobile-chromium` (Pixel 7), `mobile-webkit` (iPhone 15), `desktop-firefox`. Test ograniczony do jednej przeglądarki oznacz przez `test.skip` z powodem.
- Do samego `mobile-chromium` wolno ograniczyć wyłącznie: testy przechodzące po całym katalogu ekranów (`screens.spec.ts` i testy przekrojowe S29: pola dotyku, kontrast, przewijanie poziome, żądania zewnętrzne, kolory części zdrowia), test wydajności z 1000 przepisów oraz testy funkcji, której dany silnik nie ma (blokada wygaszania, wyświetlenie powiadomienia), z powodem w kodzie. Scenariusze zachowania, także S26–S28, działają na wszystkich trzech projektach.
- Kryterium z podaną szerokością albo wymiarem ekranu (360, 390, 1280 px; 390 × 844) ustawia je samo: `await page.setViewportSize({ width: 390, height: 844 })`. Tryb systemu ustawiaj przez `await page.emulateMedia({ colorScheme: 'dark' })`. Nie dodawaj projektów Playwrighta dla szerokości ani trybów.
- Kolory sprawdzaj jako obliczone style (`getComputedStyle`) porównane z wartością tokenu ze specyfikacji, nie przez nazwy klas.
- Ekrany do testów przekrojowych bierz z katalogu `tests/e2e/screens.ts` (`SCREENS`, `seedSampleData`); nie buduj własnej listy adresów.
- Integracje działają w trybie atrapy (`AUTH_MODE=mock`, `PUSH_MODE=mock`); strony testowe ze specyfikacji to usługa HTTP w `compose.e2e.yml`. Testy nie sięgają do internetu.
- Test wymagający prawdziwego API oznacz tagiem `@live` i pomiń, gdy brakuje klucza: `test.skip(!process.env.NAZWA_KLUCZA, 'wymaga klucza')`.
- Czas przesuwaj przez endpoint `/api/__test/clock` (serwer) i `page.clock` (przeglądarka), nigdy przez `waitForTimeout`.
- Każdy test sam przygotowuje dane przez API albo interfejs i nie zależy od kolejności; stan bazy czyść przez `/api/__test/reset`.
- Offline symuluj przez `context.setOffline(true)`.

## Instalator

Specyfikacja: `.ai/specs/2026-10-14-instalator.md`, decyzje: ADR 0003.

- **Zachowanie testuj w `tests/installer/*.test.ts`.** Test uruchamia prawdziwy `scripts/install.sh` w kopii repozytorium (`createInstallation`) z atrapą `docker` na początku `PATH`. Zachowanie atrapy ustawiasz przez `setDockerState`, wywołania czytasz przez `dockerCalls`. Nową sytuację Dockera (błąd budowania, zajęty port, wynik sprawdzenia zdrowia, istniejący wolumen) dopisujesz do atrapy razem z opisem w jej nagłówku. Tryb z pytaniami: `runInstaller(i, { tty: true, steps: [{ waitFor: 'Domena', send: 'przepisy.example.test\n' }] })`; Ctrl+C to `'\x03'`, Ctrl+D to `'\x04'`. Test nazywasz identyfikatorem scenariusza (`S6: …`).
- **Prawdziwy stos tylko tam, gdzie atrapa nie wystarczy:** dane w bazie po ponownym uruchomieniu, pierwszeństwo `.env` w działającej aplikacji, zatrzymanie `caddy`, dwa uruchomienia bez interakcji (wymaganie CI). Scenariusz to plik `tests/installer/stack/<nr>-<nazwa>.sh` korzystający z `stack/lib.sh` (`run_installer`, `stack_compose`, `env_value`, `env_checksum`, `TEST_VALUES`).
- **Kiedy uruchamiasz `scripts/test-installer.sh` lokalnie:** gdy PR zmienia `scripts/install.sh`, `scripts/lib/env.sh`, `scripts/lib.sh`, `compose.yml`, `.env.example`, `Dockerfile` albo `tests/installer/stack/`. CI uruchamia go przy każdym PR. Pozostałości po przerwanym przebiegu mają prefiks `inst-`.
- **Reguły instalatora:** `.env` czytasz parserem z `scripts/lib/env.sh`, nigdy przez `source`. Zapis tylko przez funkcję z atomową zamianą pliku (`mktemp` w katalogu repozytorium, `chmod 600`, `mv`). Każde `docker compose` idzie przez jedną funkcję z `env -i`, `--env-file`, `--project-directory` i `-p "$PROJECT"`. Wartości sekretów nie trafiają na wyjście ani do komunikatów, także w trybie diagnostycznym; nie używaj `set -x`. Komunikaty po polsku, statusy kroków dosłownie „zrobione”, „pominięty, już zrobione”, „błąd”.
- **Zmienne tylko dla testów:** `MP_INSTALL_PROJECT` (projekt Compose, domyślnie `mounjaro-przepisy`), `MP_INSTALL_COMPOSE_OVERRIDE` (dodatkowy plik Compose), `MP_INSTALL_HEALTH_TIMEOUT` (sekundy, domyślnie 180). Nie zmieniaj domyślnej nazwy projektu: od niej zależy wolumen z danymi istniejących instalacji.

## Zrzuty ekranów w PR

Dotyczy każdego PR, który zmienia wygląd ekranu; w etapie 5 to wymaganie specyfikacji.

1. Po zakończeniu zmian uruchom `scripts/screenshots.sh` (albo z filtrem `-g` dla zmienionych ekranów) i zacommituj zmienione pliki z `docs/screenshots/`. Dane i czas są stałe, więc ekran bez zmian daje identyczny plik. Zmieniony plik ekranu, którego nie ruszałeś, to sygnał do sprawdzenia, a nie do zacommitowania w ciemno.
2. Po wypchnięciu gałęzi wstaw do opisu PR, dla każdego zmienionego ekranu, zrzut przed i po w trzech wariantach. „Przed” to plik z commita, od którego odchodzi gałąź (`git merge-base origin/main HEAD`), „po” to plik z ostatniego commita gałęzi:

   ```markdown
   ### planer

   | Wariant | Przed | Po |
   | --- | --- | --- |
   | 390 px, jasny | ![](https://raw.githubusercontent.com/cieyhomelab/mounjaro-przepisy/<sha-przed>/docs/screenshots/mobile-light/planer.png) | ![](https://raw.githubusercontent.com/cieyhomelab/mounjaro-przepisy/<sha-po>/docs/screenshots/mobile-light/planer.png) |
   | 390 px, ciemny | ![](…/<sha-przed>/docs/screenshots/mobile-dark/planer.png) | ![](…/<sha-po>/docs/screenshots/mobile-dark/planer.png) |
   | 1280 px | ![](…/<sha-przed>/docs/screenshots/desktop-light/planer.png) | ![](…/<sha-po>/docs/screenshots/desktop-light/planer.png) |
   ```

3. Nowy ekran dopisz do `SCREENS` w `tests/e2e/screens.ts` w tym samym PR; w kolumnie „Przed” wpisz wtedy „nowy ekran”. Po kolejnym commicie zmieniającym wygląd odśwież zrzuty i identyfikator commita w opisie.

Repozytorium jest publiczne: dane przykładowe w katalogu ekranów są zmyślone i takie mają zostać.

## Konwencje

**Nazewnictwo.** Kod, nazwy plików, commity i komentarze po angielsku; teksty interfejsu i dokumenty po polsku. Pliki modułów w `camelCase.ts`, komponenty React w `PascalCase.tsx`, test obok kodu jako `*.test.ts(x)`. Tabele i kolumny w `snake_case`, pola JSON w `camelCase`. Ścieżki ekranów po polsku bez znaków diakrytycznych (`/przepisy/:id`), ścieżki API po angielsku (`/api/recipes/:id`). Commity w konwencji Conventional Commits.

**Kontrakty.** Kształt każdego żądania i odpowiedzi to schemat Zod w `src/shared/contracts/`. Serwer parsuje nim wejście, klient odpowiedź; typy wyprowadzaj przez `z.infer`.

**Obsługa błędów.** Serwer odpowiada `{ "error": { "code": "…", "fields"?: { … } } }` z kodem HTTP 4xx/5xx; `code` to stała w `snake_case`, bez treści technicznej. Komunikaty po polsku powstają w kliencie na podstawie `code`, zawsze z możliwością ponowienia. Nie łap wyjątków po to, żeby je zignorować. Nieoczekiwany błąd to 500 z `code: "internal"` i wpis w logu bez danych użytkownika.

**Logowanie.** Wyłącznie logger Fastify (`request.log`, `app.log`); `console.*` jest zabronione przez ESLint. Loguj zdarzenie, identyfikatory techniczne i czas trwania. Nigdy: treści żądań i odpowiedzi, adresów URL z parametrami, adresu e-mail, nazw przepisów, wartości zdrowotnych, tokenów.

**Konfiguracja.** Zmienne środowiskowe czyta tylko `src/server/config.ts`. Nowa zmienna oznacza cztery zmiany naraz: `config.ts`, `.env.example` (opis i czy wymagana), `compose.yml` oraz, jeśli testy jej potrzebują, `compose.e2e.yml`.

**Migracje bazy.** Zmień `src/server/db/schema.ts`, uruchom `scripts/npm.sh run db:generate -- --name=<opis>` i zacommituj nowe pliki z `drizzle/`. Nie edytuj migracji, które są już na gałęzi `main`. Migrację danych twórz przez `db:generate -- --custom --name=<opis>`. Migracje stosują się same przy starcie aplikacji i muszą dać się zastosować na bazie z danymi.

**Czas.** Serwer bierze bieżący czas z abstrakcji zegara, nie z `new Date()`. Daty kalendarzowe (dzień ugotowania, dawki, wpisu) to `YYYY-MM-DD` w strefie Europe/Warsaw; tydzień trwa od poniedziałku do niedzieli.

**Wygląd i dostępność.** Źródłem wyglądu jest sekcja „Projekt wizualny” specyfikacji; makiet nie ma.

- Kolory, wielkości tekstu, zaokrąglenia i cienie pochodzą wyłącznie z tokenów w `src/client/styles.css`, przez klasy Tailwinda o nazwach ze specyfikacji (`bg-surface`, `text-ink-muted`, `bg-warn-soft`). Nie używaj domyślnej palety Tailwinda (`bg-red-50`, `text-neutral-700`), kolorów wpisanych w kod ani wariantów `dark:`.
- Tryb ciemny wynika z atrybutu `data-theme` na `<html>`; komponent niczego o nim nie wie. Wybór motywu żyje w `localStorage` (`mp-theme`), nie w IndexedDB, ustawieniach konta ani eksporcie; czyszczenie danych lokalnych go nie usuwa.
- Kolory `health*` wolno stosować tylko na ekranach zdrowia (dzienniki, formularze, licznik, ekran Zdrowie). Ustawienia ze wszystkimi podekranami są częścią kulinarną.
- Element interaktywny ma własne pudełko co najmniej 44 × 44 px (wysokość, szerokość, odstęp wewnętrzny), bez powiększania pola pseudoelementem. Wyjątki ze specyfikacji: link wewnątrz zdania; pole wyboru w wierszu listy liczy się jako cały wiersz.
- Komunikat błędu ma `role="alert"`, tło `warn-soft` i tekst `on-warn-soft`; czerwieni nie ma w projekcie. Stan przełączników i chipów niesie `aria-pressed`, aktywna pozycja nawigacji `aria-current="page"`, przycisk z samą ikoną ma `aria-label`.
- Ikony tylko z `lucide-react`, fonty tylko z pakietów Fontsource. Bloki zastępcze przy ładowaniu nie mają animacji ani przejść.
- Tekst na zdjęciu ma zawsze własne tło (plakietka `surface`).
- Buduj ekrany ze wspólnych elementów z `src/client/components/ui/`; nie kopiuj list klas między ekranami.

**Dostęp do danych w kliencie.** Ekrany czytają z IndexedDB. Zapis idzie do API, a po sukcesie wynik trafia do IndexedDB. Każda akcja zmieniająca dane sprawdza połączenie i offline pokazuje „Ta akcja wymaga połączenia z internetem”.

## Sekrety

- Sekretów nie ma w repozytorium, w obrazach Dockera ani w logach. `.env` jest w `.gitignore`.
- `.env.example` to pełna lista zmiennych z opisem i informacją, czy są wymagane. Aktualizuj go razem z kodem.
- Agenci i testy czytają sekrety z `${SH_SECRETS_DIR:-$HOME/.sh-secrets}/mounjaro-przepisy.env`; skrypty wczytują ten plik same.
- Jeśli zadanie wymaga sekretu, którego tam nie ma, opisz to w PR w sekcji „Wymagane sekrety” i nie zastępuj go wartością wpisaną w kod.

## Czego nie robić

- Nie uruchamiaj `npm`, `npx`, `node` ani `playwright` bezpośrednio na hoście.
- Nie publikuj stałych portów w plikach Compose używanych przez testy.
- Nie dodawaj zewnętrznych skryptów, czcionek z CDN, analityki ani raportowania błędów do usług zewnętrznych. Poza logowaniem Google przeglądarka nie łączy się z żadną domeną poza własną.
- Nie wpisuj skryptów w treść `index.html` i nie rozluźniaj CSP (`script-src`, `font-src`, `style-src`).
- Nie dodawaj asercji porównujących piksele (`toHaveScreenshot`); zrzuty w `docs/screenshots/` służą do oglądania, a poprawność pilnują kryteria scenariuszy.
- Nie edytuj plików w `docs/screenshots/` ręcznie i nie zapisuj tam zrzutów z prawdziwymi danymi.
- Nie dodawaj funkcji generujących przepisy przez AI, wyliczających lub podpowiadających dawkę leku ani proponujących cele białka, wody i wagi (sekcja „Poza zakresem” specyfikacji).
- Nie filtruj ani nie sortuj kolekcji po stronie serwera; ta logika żyje w `src/shared` i działa w przeglądarce.
- Nie udostępniaj zdjęć ani danych pod adresem działającym bez sesji.
- Nie włączaj atrap ani endpointów `/api/__test/*` przy `APP_ENV=production`.
- Nie dodawaj nowej usługi, bazy ani języka bez ADR.
- Nie wczytuj `.env` przez `source` ani `.` i nie wypisuj wartości sekretów w skryptach; nie zakładaj na hoście niczego poza Dockerem i bashem (bez `curl`, `openssl`, `jq`, `python`).
- Nie wyłączaj testów, nie oznaczaj ich `skip` bez powodu w kodzie, nie używaj `--no-verify`.
- Nie zmieniaj części funkcjonalnej specyfikacji; lukę albo sprzeczność zgłoś w issue z etykietą `spec-gap`.
