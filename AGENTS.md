# AGENTS.md

Instrukcja dla agentów pracujących w tym repozytorium. Przeczytaj ją w całości przed pierwszą zmianą.

## Zasady nadrzędne

1. **Narzędzia uruchamiasz przez `scripts/`, nigdy bezpośrednio na hoście.** Node na hoście jest za stary dla tego projektu; skrypty uruchamiają wszystko w Dockerze z Node 24.
2. **Każda zmiana w zachowaniu ma test.** Każdy scenariusz i każde kryterium akceptacji ze specyfikacji ma test E2E, nazwany identyfikatorem scenariusza (np. `S4: zapis bez tytułu wskazuje brakujące pole`).
3. **Dane użytkownika to dane o zdrowiu.** Nie trafiają do logów, komunikatów błędów, zewnętrznych usług ani do repozytorium (także w danych testowych nie używaj prawdziwych danych osób).
4. **Nie zgaduj API bibliotek.** Kilka z nich ma świeże wersje główne (Vite 8, Vitest 5, React Router 8, ESLint 10, Zod 4). Sprawdź wersję w `package.json` i typy w `node_modules`, zanim użyjesz czegoś z pamięci.
5. **Specyfikacja jest źródłem prawdy o zachowaniu:** `.ai/specs/2026-10-08-mounjaro-przepisy.md`. Sekcja „Sekcje techniczne” opisuje architekturę, model danych, API i plan etapów.

## Projekt

Mounjaro Przepisy to prywatna aplikacja PWA jednej osoby na diecie wspieranej lekiem Mounjaro: kolekcja sprawdzonych przepisów z filtrami pod tę dietę, tryb gotowania offline, a w kolejnych etapach wyszukiwanie w zaufanych serwisach, planer z listą zakupów i dziennik zdrowia. Interfejs jest wyłącznie po polsku.

## Stos

TypeScript 6 na Node.js 24. Klient: React 19, Vite 8, React Router 8, Tailwind CSS 4. Serwer: Fastify 5, Zod 4, Drizzle ORM, PostgreSQL 18. Testy: Vitest 5, Testing Library, Playwright. Całość w Docker Compose.

Uzasadnienie i odrzucone alternatywy: [docs/adr/0001-stos-technologiczny.md](docs/adr/0001-stos-technologiczny.md). Zmiana stosu albo nowa usługa w Compose wymaga nowego ADR w `docs/adr/`.

## Struktura katalogów

| Ścieżka | Co tam jest | Co tam dodawać |
| --- | --- | --- |
| `src/shared/` | Czysty kod wspólny dla klienta i serwera | Schematy Zod żądań i odpowiedzi (`contracts/`), logika domenowa jako czyste funkcje (`domain/`: filtry, sortowanie, skalowanie, wartości odżywcze, lista zakupów, normalizacja adresów, rotacja miejsc wkłucia) |
| `src/server/` | Serwer Fastify | `routes/` (jeden plik na zasób), `services/` (logika z dostępem do bazy i sieci), `integrations/` (Google, odczyt stron, push; każda z atrapą), `db/schema.ts` (tabele Drizzle) |
| `src/server/main.ts` | Punkt startowy: konfiguracja, migracje, nasłuch | Tylko składanie zależności |
| `src/server/app.ts` | Budowa aplikacji Fastify z wstrzykniętymi zależnościami | Rejestracja nowych tras |
| `src/server/config.ts` | Jedyny moduł czytający zmienne środowiskowe | Każdą nową zmienną, z walidacją Zod |
| `src/client/` | Aplikacja React | `screens/` (ekrany), `components/` (elementy wielokrotnego użytku), `data/` (IndexedDB, synchronizacja, wywołania API), `sw.ts` (service worker) |
| `drizzle/` | Migracje SQL wygenerowane przez `drizzle-kit` | Nic ręcznie, poza migracjami danych (patrz „Migracje”) |
| `tests/integration/` | Testy Vitest z prawdziwym PostgreSQL | Testy tras i serwisów |
| `tests/e2e/` | Testy Playwright | Testy scenariuszy; strony testowe w `tests/e2e/fixtures/` |
| `scripts/` | Jednolity punkt wejścia dla agentów i CI | Nowe skrypty tylko wtedy, gdy potrzebuje ich cały zespół |
| `docs/adr/` | Decyzje architektoniczne | Kolejne ADR z numerem |
| `.ai/` | Specyfikacje i konfiguracja pipeline'u agentów | Nie zmieniaj ręcznie `agentic.config.json` bez potrzeby |

Granice są pilnowane przez ESLint: `src/shared` nie importuje niczego z `src/server`, `src/client`, Node ani frameworków; klient i serwer nie importują siebie nawzajem.

## Gdzie zajrzeć przed zmianą

| Zadanie dotyczy… | Przeczytaj najpierw | Kluczowe reguły |
| --- | --- | --- |
| Endpointu API | `src/server/app.ts`, `src/server/routes/health.ts`, sekcja „Kontrakty API” specyfikacji | Schemat Zod w `src/shared/contracts/`; walidacja każdego wejścia; test integracyjny |
| Tabel i migracji | `src/server/db/schema.ts`, `src/server/db/client.ts`, sekcja „Model danych” specyfikacji | Zmiana schematu i wygenerowana migracja w tym samym commicie |
| Ekranu lub komponentu | `src/client/App.tsx`, `src/client/screens/StartScreen.tsx` | Teksty po polsku; elementy dotykowe min. 44 × 44 px; ekrany czytają dane z IndexedDB |
| Filtrów, sortowania, wyliczeń | `src/shared/` | Czyste funkcje z testami jednostkowymi; ten sam kod działa online i offline |
| Integracji zewnętrznej | `.env.example`, sekcja „Integracje” specyfikacji | Interfejs, implementacja prawdziwa i atrapa; atrapa wybierana zmienną środowiskową |
| Testów E2E | `tests/e2e/smoke.spec.ts`, `playwright.config.ts`, `scripts/test-e2e.sh`, `compose.e2e.yml` | Kontrakt poniżej |
| CI | `.github/workflows/ci.yml` | CI wywołuje wyłącznie skrypty z `scripts/` |
| Procesu pracy | `SDLC.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`, `.ai/agentic.config.json` | — |

## Komendy

Wymagania hosta: Docker z Compose v2.24 lub nowszym oraz bash.

| Komenda | Co robi |
| --- | --- |
| `scripts/lint.sh` | ESLint, sprawdzenie formatowania Prettier, sprawdzenie typów |
| `scripts/test-unit.sh` | Testy jednostkowe (Vitest); argumenty trafiają do Vitest |
| `scripts/test-integration.sh` | Testy integracyjne z tymczasowym PostgreSQL w projekcie Compose `it-<id>` |
| `scripts/test-e2e.sh` | Testy E2E (Playwright) na tymczasowej instancji całej aplikacji |
| `scripts/build.sh` | Build produkcyjny: klient, serwer i obraz uruchomieniowy |
| `scripts/npm.sh <argumenty>` | npm w Node 24 z zamontowanym katalogiem roboczym. Używaj do wszystkiego, co zapisuje pliki: `scripts/npm.sh install <pakiet>`, `scripts/npm.sh run format`, `scripts/npm.sh run db:generate` |

Pełna walidacja przed PR, w tej kolejności: lint, unit, integration, e2e, build. Każdy skrypt kończy się kodem różnym od zera przy błędzie. Skrypty testowe budują obraz z bieżącego stanu plików, więc nie wymagają commita.

Uruchomienie aplikacji lokalnie: `cp .env.example .env`, uzupełnij `POSTGRES_PASSWORD`, potem `docker compose up -d --build`; aplikacja jest pod `http://127.0.0.1:3000`.

## Kontrakt testów E2E

`scripts/test-e2e.sh`:

- stawia własną instancję w projekcie Compose `e2e-${E2E_RUN_ID}`; bez zmiennej losuje identyfikator. Kilka przebiegów może działać równolegle;
- nie publikuje portów na hoście. Kontener Playwrighta dzieli sieć z kontenerem aplikacji, więc testy otwierają `http://localhost:3000` (bezpieczny kontekst wymagany przez service worker i push). Używaj ścieżek względnych (`page.goto('/')`);
- zawsze sprząta kontenery, sieci, wolumeny i obrazy, także po błędzie i przerwaniu;
- wczytuje sekrety z `${SH_SECRETS_DIR:-$HOME/.sh-secrets}/mounjaro-przepisy.env`, jeśli plik istnieje, i działa bez niego;
- przy niepowodzeniu kopiuje ślady i zrzuty ekranu do `test-results/e2e-<id>/`;
- przekazuje argumenty do Playwrighta, np. `scripts/test-e2e.sh --project mobile-chromium -g "S4"`.

Zasady pisania testów E2E:

- Testy działają na trzech projektach: `mobile-chromium` (Pixel 7), `mobile-webkit` (iPhone 15), `desktop-firefox`. Test ograniczony do jednej przeglądarki oznacz przez `test.skip` z powodem.
- Integracje działają w trybie atrapy (`AUTH_MODE=mock`, `PUSH_MODE=mock`); strony testowe ze specyfikacji to usługa HTTP w `compose.e2e.yml`. Testy nie sięgają do internetu.
- Test wymagający prawdziwego API oznacz tagiem `@live` i pomiń, gdy brakuje klucza: `test.skip(!process.env.NAZWA_KLUCZA, 'wymaga klucza')`.
- Czas przesuwaj przez endpoint `/api/__test/clock` (serwer) i `page.clock` (przeglądarka), nigdy przez `waitForTimeout`.
- Każdy test sam przygotowuje dane przez API albo interfejs i nie zależy od kolejności; stan bazy czyść przez `/api/__test/reset`.
- Offline symuluj przez `context.setOffline(true)`.

## Konwencje

**Nazewnictwo.** Kod, nazwy plików, commity i komentarze po angielsku; teksty interfejsu i dokumenty po polsku. Pliki modułów w `camelCase.ts`, komponenty React w `PascalCase.tsx`, test obok kodu jako `*.test.ts(x)`. Tabele i kolumny w `snake_case`, pola JSON w `camelCase`. Ścieżki ekranów po polsku bez znaków diakrytycznych (`/przepisy/:id`), ścieżki API po angielsku (`/api/recipes/:id`). Commity w konwencji Conventional Commits.

**Kontrakty.** Kształt każdego żądania i odpowiedzi to schemat Zod w `src/shared/contracts/`. Serwer parsuje nim wejście, klient odpowiedź; typy wyprowadzaj przez `z.infer`.

**Obsługa błędów.** Serwer odpowiada `{ "error": { "code": "…", "fields"?: { … } } }` z kodem HTTP 4xx/5xx; `code` to stała w `snake_case`, bez treści technicznej. Komunikaty po polsku powstają w kliencie na podstawie `code`, zawsze z możliwością ponowienia. Nie łap wyjątków po to, żeby je zignorować. Nieoczekiwany błąd to 500 z `code: "internal"` i wpis w logu bez danych użytkownika.

**Logowanie.** Wyłącznie logger Fastify (`request.log`, `app.log`); `console.*` jest zabronione przez ESLint. Loguj zdarzenie, identyfikatory techniczne i czas trwania. Nigdy: treści żądań i odpowiedzi, adresów URL z parametrami, adresu e-mail, nazw przepisów, wartości zdrowotnych, tokenów.

**Konfiguracja.** Zmienne środowiskowe czyta tylko `src/server/config.ts`. Nowa zmienna oznacza cztery zmiany naraz: `config.ts`, `.env.example` (opis i czy wymagana), `compose.yml` oraz, jeśli testy jej potrzebują, `compose.e2e.yml`.

**Migracje bazy.** Zmień `src/server/db/schema.ts`, uruchom `scripts/npm.sh run db:generate -- --name=<opis>` i zacommituj nowe pliki z `drizzle/`. Nie edytuj migracji, które są już na gałęzi `main`. Migrację danych twórz przez `db:generate -- --custom --name=<opis>`. Migracje stosują się same przy starcie aplikacji i muszą dać się zastosować na bazie z danymi.

**Czas.** Serwer bierze bieżący czas z abstrakcji zegara, nie z `new Date()`. Daty kalendarzowe (dzień ugotowania, dawki, wpisu) to `YYYY-MM-DD` w strefie Europe/Warsaw; tydzień trwa od poniedziałku do niedzieli.

**Dostęp do danych w kliencie.** Ekrany czytają z IndexedDB. Zapis idzie do API, a po sukcesie wynik trafia do IndexedDB. Każda akcja zmieniająca dane sprawdza połączenie i offline pokazuje „Ta akcja wymaga połączenia z internetem”.

## Sekrety

- Sekretów nie ma w repozytorium, w obrazach Dockera ani w logach. `.env` jest w `.gitignore`.
- `.env.example` to pełna lista zmiennych z opisem i informacją, czy są wymagane. Aktualizuj go razem z kodem.
- Agenci i testy czytają sekrety z `${SH_SECRETS_DIR:-$HOME/.sh-secrets}/mounjaro-przepisy.env`; skrypty wczytują ten plik same.
- Jeśli zadanie wymaga sekretu, którego tam nie ma, opisz to w PR w sekcji „Wymagane sekrety” i nie zastępuj go wartością wpisaną w kod.

## Czego nie robić

- Nie uruchamiaj `npm`, `npx`, `node` ani `playwright` bezpośrednio na hoście.
- Nie publikuj stałych portów w plikach Compose używanych przez testy.
- Nie dodawaj zewnętrznych skryptów, czcionek z CDN, analityki ani raportowania błędów do usług zewnętrznych.
- Nie dodawaj funkcji generujących przepisy przez AI, wyliczających lub podpowiadających dawkę leku ani proponujących cele białka, wody i wagi (sekcja „Poza zakresem” specyfikacji).
- Nie filtruj ani nie sortuj kolekcji po stronie serwera; ta logika żyje w `src/shared` i działa w przeglądarce.
- Nie udostępniaj zdjęć ani danych pod adresem działającym bez sesji.
- Nie włączaj atrap ani endpointów `/api/__test/*` przy `APP_ENV=production`.
- Nie dodawaj nowej usługi, bazy ani języka bez ADR.
- Nie wyłączaj testów, nie oznaczaj ich `skip` bez powodu w kodzie, nie używaj `--no-verify`.
- Nie zmieniaj części funkcjonalnej specyfikacji; lukę albo sprzeczność zgłoś w issue z etykietą `spec-gap`.
