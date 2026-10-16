# Dla programistów

Ten plik zbiera wszystko, co potrzebne do pracy nad kodem. Instalacja i użytkowanie aplikacji są opisane w [README.md](../README.md), a wdrożenie na serwerze w [operations.md](operations.md).

## Dokumenty

- [`.ai/specs/2026-10-08-mounjaro-przepisy.md`](../.ai/specs/2026-10-08-mounjaro-przepisy.md) — specyfikacja: scenariusze S1–S25 z kryteriami akceptacji, etapy, sekcje techniczne
- [`.ai/specs/2026-10-14-instalator.md`](../.ai/specs/2026-10-14-instalator.md) — specyfikacja instalatora
- [`AGENTS.md`](../AGENTS.md) — twarde reguły pracy w repozytorium; przeczytaj przed pierwszą zmianą
- [`docs/adr/`](adr/) — decyzje architektoniczne (stos, wygląd, instalator)
- [`SDLC.md`](../SDLC.md), [`CODE_REVIEW.md`](../CODE_REVIEW.md), [`BACKWARD_COMPATIBILITY.md`](../BACKWARD_COMPATIBILITY.md) — proces pracy

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
