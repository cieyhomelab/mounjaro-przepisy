# Mounjaro Przepisy (PWA)

Prywatna aplikacja webowa, instalowalna na telefonie, dla jednej osoby na diecie
wspieranej lekiem Mounjaro. Odpowiada na jedno pytanie: **co dziś ugotować, żeby
było smaczne, białkowe i żebym to dobrze zniósł?**

Aplikacja gromadzi sprawdzone przepisy (z serwisów kulinarnych i własne),
filtruje je pod tę dietę i prowadzi przez gotowanie także bez internetu. Nie
generuje przepisów i nie wylicza dawek leku. To nie jest uproszczenie na
później, tylko granica zakresu: przepisom z AI nie da się ufać co do smaku, a
dawkę ustala lekarz.

Obsługuje dokładnie jedno konto. Zalogować się może tylko adres Google ustawiony
przy instalacji; nie ma rejestracji, udostępniania ani widoków publicznych.
Interfejs jest wyłącznie po polsku.

- `.ai/specs/2026-10-08-mounjaro-przepisy.md` — specyfikacja: scenariusze S1–S25 z kryteriami akceptacji, etapy, sekcje techniczne
- `AGENTS.md` — twarde reguły pracy w repozytorium; przeczytaj przed pierwszą zmianą
- `docs/operations.md` — wdrożenie na własnym serwerze, kopie zapasowe, aktualizacja
- `docs/adr/0001-stos-technologiczny.md` — wybór stosu i odrzucone alternatywy
- `SDLC.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md` — proces pracy

## Status

**Etapy 1–3 oraz wycinki 4.1 i 4.2 są dostarczone.** Trwa 4.3, a 4.4 czeka w
kolejce.

| Etap | Co daje | Scenariusze | Stan |
| --- | --- | --- | --- |
| 1 | Kolekcja przepisów: logowanie, przepis ręczny i z linku, wartości odżywcze, filtry pod Mounjaro, ugotowania i oceny, tryb gotowania, praca offline, eksport i usunięcie danych | S1–S16 | gotowe |
| 2 | Wyszukiwanie w zaufanych serwisach | S17, S18 | gotowe |
| 3 | Planer tygodnia i lista zakupów | S19, S20 | gotowe |
| 4.1 | Dziennik dawek i rotacja miejsc wkłucia | S21, S22 | gotowe |
| 4.2 | Przypomnienie o zastrzyku (Web Push) | S23 | gotowe |
| 4.3 | Dziennik wagi i samopoczucia | S24 | w toku (#20) |
| 4.4 | Liczniki białka i wody | S25 | zaplanowane (#21) |

## Układ

```
src/shared/         # kontrakty Zod i logika domenowa wspólna dla klienta i serwera
src/server/         # serwer Fastify: routes, services, integrations, db
src/client/         # aplikacja React: screens, components, data (IndexedDB), sw.ts
drizzle/            # migracje SQL generowane przez drizzle-kit
tests/integration/  # Vitest z prawdziwym PostgreSQL
tests/e2e/          # Playwright, jeden plik na scenariusz ze specyfikacji
scripts/            # jedyny punkt wejścia do narzędzi, dla ludzi, agentów i CI
backup/             # obraz usługi kopii zapasowych i próba odtworzenia
docs/               # wdrożenie i decyzje architektoniczne
.ai/                # specyfikacje i konfiguracja pipeline'u agentów
```

Filtry, sortowanie i wyliczenia żyją w `src/shared` i działają w przeglądarce,
więc ten sam kod obsługuje pracę online i offline. Ekrany czytają dane z
IndexedDB, a zapis idzie przez API.

Stos: TypeScript 6 na Node.js 24, React 19, Vite 8, Tailwind CSS 4, Fastify 5,
Zod 4, Drizzle ORM, PostgreSQL 18, Vitest 5, Playwright. Całość w Docker Compose.

## Komendy

Wymagania hosta: Docker z Compose v2.24 lub nowszym oraz bash. Node na hoście
nie jest potrzebny i nie jest używany: skrypty uruchamiają wszystko w Dockerze z
Node 24.

```bash
scripts/lint.sh              # ESLint, format Prettier, sprawdzenie typów
scripts/test-unit.sh         # Vitest; argumenty trafiają do Vitest
scripts/test-integration.sh  # Vitest z tymczasowym PostgreSQL
scripts/test-e2e.sh          # Playwright na tymczasowej instancji całej aplikacji
scripts/build.sh             # build produkcyjny: klient, serwer, obraz
scripts/restore-drill.sh     # próba kopii zapasowej, szyfrowania i odtworzenia
scripts/npm.sh <argumenty>   # npm w Node 24, np. install <pakiet>, run format
```

Pełna walidacja przed PR, w tej kolejności: lint, unit, integration, e2e, build.
Skrypty testowe budują obraz z bieżącego stanu plików, więc nie wymagają commita.

`scripts/test-e2e.sh` stawia własną instancję w osobnym projekcie Compose, nie
publikuje portów na hoście i zawsze po sobie sprząta, dlatego kilka przebiegów
może działać równolegle. Argumenty trafiają do Playwrighta:

```bash
scripts/test-e2e.sh --project mobile-chromium -g "S4"
```

Testy działają na trzech projektach: `mobile-chromium` (Pixel 7),
`mobile-webkit` (iPhone 15) i `desktop-firefox`.

## Uruchomienie lokalne

```bash
cp .env.example .env    # uzupełnij co najmniej POSTGRES_PASSWORD
docker compose up -d --build
```

Aplikacja jest pod `http://127.0.0.1:3000`. Migracje bazy stosują się same przy
starcie.

`.env` jest w `.gitignore` i nigdy nie trafia do repozytorium. Pełną listę
zmiennych, z opisem i informacją, czy są wymagane, zawiera `.env.example`.

Logowanie Google i powiadomienia push mają atrapy (`AUTH_MODE=mock`,
`PUSH_MODE=mock`), których używają testy E2E. Atrapy i endpointy `/api/__test/*`
działają wyłącznie poza `APP_ENV=production`.

## Wdrożenie

Aplikacja działa na własnym serwerze właściciela. Nie ma automatycznego
wdrożenia: merge do `main` uruchamia tylko CI (`.github/workflows/ci.yml`), a
nową wersję wgrywa się ręcznie. Pełna instrukcja, razem z listą kontrolną
odbioru, jest w `docs/operations.md`.

Pierwsze uruchomienie wymaga domeny skierowanej na serwer, klienta OAuth w
Google Cloud Console i tych zmiennych w `.env`:

| Zmienna | Wartość |
| --- | --- |
| `POSTGRES_PASSWORD` | Długie, losowe hasło bazy |
| `APP_BASE_URL` | `https://<domena>`, bez końcowego ukośnika |
| `APP_DOMAIN` | `<domena>` bez `https://`; potrzebna tylko usłudze `caddy` |
| `ALLOWED_EMAIL` | Jedyny adres Google, który może się zalogować |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Dane klienta OAuth; adres powrotu to `${APP_BASE_URL}/api/auth/google/callback` |
| `BACKUP_AGE_RECIPIENT` | Klucz publiczny `age` do szyfrowania kopii zapasowych |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Para kluczy do przypomnień push; bez nich aplikacja działa, ale przypomnienia nie przychodzą |

Są dwa warianty uruchomienia:

```bash
docker compose --profile tls up -d --build   # usługa caddy kończy HTTPS i sama odnawia certyfikat
docker compose up -d --build                 # serwer ma już własne reverse proxy
```

W drugim wariancie aplikacja nasłuchuje tylko na `127.0.0.1:${APP_PORT:-3000}`,
a HTTPS kończy to proxy.

Aktualizacja to `git pull` i ponowienie tego samego polecenia `docker compose`.
Dane w wolumenie `db-data` zostają. Sprawdzenie po wdrożeniu:

```bash
curl -fsS https://<domena>/api/health
```

## Dane i prywatność

Dane użytkownika to dane o zdrowiu. Nie trafiają do logów, komunikatów błędów,
zewnętrznych usług ani do repozytorium, także jako dane testowe. Aplikacja nie
ładuje zewnętrznych skryptów, czcionek z CDN ani analityki.

- Dysk serwera musi być zaszyfrowany: baza i zdjęcia leżą w wolumenie `db-data`.
- Usługa `backup` co 6 godzin robi zaszyfrowaną kopię bazy. Klucz prywatny `age`
  właściciel trzyma poza serwerem; serwer go nigdy nie potrzebuje.
- Kopie starsze niż 29 dni są usuwane, żeby dane usuniętego konta zniknęły przed
  upływem 30 dni obiecanych w aplikacji. Kopia trzymana poza serwerem musi
  wygasać tak samo.
- Eksport wszystkich danych (ZIP) i usunięcie konta użytkownik robi sam:
  Ustawienia → „Moje dane”.

## Jak powstaje kod

Repozytorium prowadzi pipeline agentów: analityk pisze specyfikację, architekt
stawia szkielet, kierownik tnie specyfikację na issues, a każde issue przechodzi
przez inżyniera, testera i reviewera, zanim właściciel zmerguje PR. Stanem są
etykiety GitHuba (`ready`, `in-progress`, `merge-queue`, `changes-requested`,
`blocked`, `spec-gap`).

Specyfikacja jest źródłem prawdy o zachowaniu. Każdy scenariusz i każde
kryterium akceptacji ma test E2E nazwany identyfikatorem scenariusza. Lukę albo
sprzeczność w specyfikacji zgłasza się w issue z etykietą `spec-gap`, a nie
rozstrzyga w kodzie.
