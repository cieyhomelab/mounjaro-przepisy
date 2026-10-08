# ADR 0001: Stos technologiczny

- **Status:** przyjęty
- **Data:** 2026-10-08
- **Specyfikacja:** [.ai/specs/2026-10-08-mounjaro-przepisy.md](../../.ai/specs/2026-10-08-mounjaro-przepisy.md)

## Kontekst

Mounjaro Przepisy to prywatna aplikacja jednej osoby: PWA instalowana na telefonie, z kolekcją do 1000 przepisów. O wyborze stosu decydują te wymagania specyfikacji:

- **Offline (S14):** całą kolekcję, filtry, sortowanie, wyszukiwanie, skalowanie porcji i tryb gotowania trzeba obsłużyć bez internetu, „tak samo jak z internetem”. Filtrowanie i sortowanie muszą więc działać w przeglądarce na danych zapisanych na urządzeniu, a nie na serwerze.
- **Wydajność:** odświeżenie listy 1000 przepisów w czasie do 1 sekundy na telefonie średniej klasy.
- **Serwer jest potrzebny:** logowanie Google ograniczone do jednego adresu, synchronizacja między urządzeniami, odczyt cudzych stron (przeglądarka nie pobierze ich sama z powodu CORS), wyszukiwanie w serwisach, powiadomienia push wysyłane o ustalonej godzinie także przy zamkniętej aplikacji.
- **Dane o zdrowiu:** żadnych zewnętrznych narzędzi analitycznych, treść danych nie trafia do logów, dane poza urządzeniem są zaszyfrowane, zdjęcia nie mają publicznych adresów.
- **Testowalność:** kryteria odczytu stron i wyszukiwania sprawdzamy na własnych stronach testowych; testy przesuwają zegar (sesja 30 dni, przypomnienie o zastrzyku, północ czasu polskiego).
- **Środowisko pracy agentów:** VPS z Dockerem. Node.js na hoście jest w wersji 20, a aktualne narzędzia (Vitest 5, jsdom 30, React Router 8) wymagają Node 22 lub nowszego. Kilku agentów pracuje równolegle w osobnych worktree.

## Decyzja

Jeden język (TypeScript) w całym projekcie, jeden pakiet npm, jeden proces serwera i jedna baza danych.

| Warstwa | Wybór |
| --- | --- |
| Język i środowisko | TypeScript 6 (tryb `strict`), Node.js 24 LTS |
| Klient | React 19, Vite 8, React Router 8 (tryb biblioteki, bez SSR), Tailwind CSS 4 |
| Dane na urządzeniu | IndexedDB przez Dexie; zdjęcia w Cache Storage |
| PWA | `vite-plugin-pwa` (Workbox) w trybie `injectManifest`, własny service worker (obsługa push) |
| Stan serwera w kliencie | TanStack Query (tylko zapisy i synchronizacja; odczyty idą z IndexedDB) |
| Serwer | Fastify 5: API pod `/api` oraz zbudowany klient jako pliki statyczne z tego samego procesu |
| Walidacja i kontrakty | Zod 4; schematy żądań i odpowiedzi w `src/shared`, wspólne dla klienta i serwera |
| Baza danych | PostgreSQL 18, Drizzle ORM, migracje SQL generowane przez `drizzle-kit` i stosowane przy starcie |
| Zdjęcia przepisów | W PostgreSQL (`bytea`, osobna tabela), pomniejszane na serwerze biblioteką `sharp` do WebP |
| Logowanie | Google OpenID Connect (przepływ z kodem autoryzacji i PKCE) biblioteką `openid-client`; sesja po stronie serwera, w ciasteczku nieprzezroczysty identyfikator |
| Odczyt przepisów | `fetch` z Node, parsowanie HTML biblioteką `cheerio`, dane schema.org/Recipe (JSON-LD, w drugiej kolejności mikrodane) |
| Wartości odżywcze | Tabela składników w repozytorium, zbudowana z USDA FoodData Central (domena publiczna), z polskimi nazwami |
| Powiadomienia | Web Push z kluczami VAPID (biblioteka `web-push`), harmonogram w procesie serwera |
| Czas | `date-fns` z `@date-fns/tz`, strefa Europe/Warsaw; zegar serwera za abstrakcją podmienianą w testach |
| Testy | Vitest 5 (jednostkowe i integracyjne), Testing Library, Playwright 1.64 (E2E) |
| Jakość | ESLint 10 z `typescript-eslint` (reguły z informacją o typach), Prettier |
| Uruchamianie | Docker Compose: `app` i `db`. Narzędzia deweloperskie też w Dockerze |
| CI | GitHub Actions wywołujące skrypty z `scripts/` |

Biblioteki z tabeli, których szkielet jeszcze nie używa (Dexie, TanStack Query, `vite-plugin-pwa`, `openid-client`, `cheerio`, `sharp`, `web-push`, `date-fns`), dodaje inżynier w etapie, który ich potrzebuje.

### Najważniejsze rozstrzygnięcia

1. **Aplikacja SPA z lokalną kopią danych zamiast renderowania na serwerze.** Po zalogowaniu klient pobiera pełną migawkę danych konta do IndexedDB i wszystkie ekrany czytają wyłącznie stamtąd. Dzięki temu jest jedna ścieżka odczytu: online i offline działa ten sam kod, a filtrowanie 1000 przepisów w pamięci mieści się w limicie 1 sekundy z dużym zapasem. Logika domenowa (filtry, sortowanie, skalowanie, wyliczanie wartości, lista zakupów) to czyste funkcje w `src/shared`, testowane jednostkowo.
2. **Pełna migawka z numerem wersji zamiast synchronizacji przyrostowej.** Serwer trzyma licznik wersji danych konta; klient wysyła znaną wersję i dostaje „bez zmian” albo całą migawkę (około 1 MB po kompresji przy 1000 przepisów). Odpadają znaczniki usunięć i scalanie zmian. Zapisy wymagają internetu (zasada z S14), więc konflikty rozstrzyga serwer: wygrywa zapis, który dotarł później. Jedyny zapis offline, odhaczanie listy zakupów (S20), idzie przez małą kolejkę w IndexedDB wysyłaną po odzyskaniu połączenia.
3. **Jeden proces serwera.** Fastify obsługuje API, pliki klienta i harmonogram przypomnień. Przy jednym użytkowniku osobny worker, kolejka czy cache byłyby ruchomymi częściami bez korzyści. Harmonogram zapisuje wysłane przypomnienia w bazie, więc restart nie gubi ani nie dubluje powiadomień.
4. **Zdjęcia w bazie danych.** Jedna kopia zapasowa (`pg_dump`) obejmuje wszystko, usunięcie konta jest jedną transakcją, a zdjęcia są dostępne tylko przez uwierzytelniony endpoint. Po pomniejszeniu zdjęcie ma około 150 kB, czyli najwyżej około 150 MB przy 1000 przepisów.
5. **Wartości odżywcze z tabeli w repozytorium, bez zewnętrznego API.** Wyliczenie jest deterministyczne (kryterium S5 wymaga równości z tolerancją ±1), działa bez sekretów i nie wysyła nikomu listy składników użytkownika. Tabelę buduje skrypt z plików USDA FoodData Central i z ręcznie utrzymywanego mapowania polskich nazw na identyfikatory FDC; wartości nie są wpisywane z pamięci.
6. **Wyszukiwanie przez własną wyszukiwarkę każdego serwisu.** Serwer pobiera stronę wyników wyszukiwania danego serwisu, a oceny i liczby opinii czyta z danych schema.org stron przepisów. Nie ma klucza API, kosztu ani pośrednika, który widziałby zapytania.
7. **Atrapy integracji i zegar testowy wbudowane w aplikację.** `AUTH_MODE=mock` i `PUSH_MODE=mock` oraz endpointy `/api/__test/*` (zegar, skrzynka powiadomień) działają tylko, gdy `APP_ENV` jest różne od `production`; `compose.yml` ustawia `production` na sztywno. Strony testowe to zwykły serwer HTTP w sieci Compose, więc odczyt i wyszukiwanie przechodzą w testach przez prawdziwy kod pobierania.
8. **Narzędzia uruchamiane w Dockerze.** Skrypty z `scripts/` budują obraz z Node 24 i w nim uruchamiają lint, testy i build. Host potrzebuje tylko Dockera i basha, a wynik jest ten sam u każdego agenta i w CI. Kosztem jest kilka sekund na zbudowanie obrazu przy każdym uruchomieniu (warstwa z zależnościami jest w cache).
9. **Testy E2E na `localhost` bez publikowania portów.** Kontener Playwrighta dzieli przestrzeń sieciową z kontenerem aplikacji (`network_mode: service:app`), więc testy otwierają `http://localhost:3000`. To bezpieczny kontekst przeglądarki, którego wymagają service worker i Web Push, a równoległe przebiegi nie kolidują na portach hosta.
10. **Szyfrowanie danych w spoczynku na poziomie nośnika i kopii.** Wolumen bazy leży na zaszyfrowanym dysku serwera (LUKS albo szyfrowany wolumen dostawcy), kopie zapasowe są szyfrowane narzędziem `age` przed zapisem, a ruch szyfruje TLS na reverse proxy. Szyfrowanie pól w aplikacji odrzucono: utrudnia zapytania harmonogramu i eksport, a klucz i tak leżałby na tym samym serwerze.

## Rozważone alternatywy

- **Next.js (App Router) z renderowaniem na serwerze.** Najpopularniejszy wybór dla aplikacji React, ale jego mocne strony (SSR, komponenty serwerowe) są tu bezużyteczne: aplikacja jest prywatna, a ekrany muszą się renderować offline z danych lokalnych. PWA z pełnym offline wymagałaby pracy wbrew frameworkowi, a logika odczytu byłaby w dwóch miejscach. Przegrał z SPA.
- **SvelteKit / Vue z Nuxt.** Technicznie wystarczające, ale agenci mają najwięcej praktyki z Reactem, a ekosystem testów i bibliotek PWA jest dla Reacta najdojrzalszy.
- **Aplikacja wyłącznie lokalna (bez serwera).** Odpada: synchronizacja między telefonem a komputerem, odczyt cudzych stron i push o ustalonej godzinie wymagają serwera.
- **Gotowy backend (Supabase, Firebase).** Dane o zdrowiu trafiłyby do kolejnego dostawcy, co specyfikacja ogranicza do „dostawców niezbędnych do działania”, a testy E2E wymagałyby emulatorów albo kluczy. Własny PostgreSQL w Compose jest prostszy do odtworzenia.
- **SQLite zamiast PostgreSQL.** Kusząco prosty przy jednym użytkowniku. Przegrał, bo zdjęcia w bazie i kopie zapasowe działającej bazy są w PostgreSQL rutyną, a agenci znają go najlepiej w parze z Drizzle.
- **Prisma zamiast Drizzle.** Prisma jest dobrze znana, ale Drizzle nie wymaga generowania klienta, migracje to czytelne pliki SQL, a typy wynikają wprost ze schematu w TypeScripcie.
- **NestJS / Express zamiast Fastify.** NestJS dokłada warstwę abstrakcji zbędną przy kilkudziesięciu endpointach; Express nie ma wbudowanej walidacji ani typów. Fastify jest dojrzały i lekki.
- **Monorepo z workspace'ami (osobne pakiety klienta, serwera i kodu wspólnego).** Odrzucone jako zbędna złożoność: jeden `package.json` i trzy katalogi w `src/` dają te same granice, pilnowane regułami ESLint.
- **Synchronizacja przyrostowa albo biblioteka local-first (RxDB, PowerSync, ElectricSQL).** Rozwiązują problem zapisu offline i scalania, którego specyfikacja świadomie nie ma. Są też niszowe i trudniejsze w testach.
- **Zewnętrzne API wartości odżywczych (USDA FDC API, Edamam, Open Food Facts).** Wymagają klucza albo sieci w testach, odpowiadają po angielsku lub opisują produkty paczkowane zamiast składników, a wynik zależałby od dostępności obcej usługi w limicie 15 sekund.
- **Zewnętrzne API wyszukiwania (Google Programmable Search, Brave).** Płatne, wymagają klucza i nie zwracają ocen ani liczby opinii, po których sortujemy wyniki.
- **Zdjęcia na wolumenie plików albo w magazynie obiektów.** Druga rzecz do kopii zapasowej i do usuwania razem z kontem, bez korzyści przy tej skali.
- **Narzędzia uruchamiane bezpośrednio na hoście.** Wymagałyby aktualizacji Node na każdym hoście agentów i w CI oraz pilnowania zgodności wersji.
- **Node 22 zamiast 24.** Node 22 jest już w fazie utrzymaniowej; 24 to bieżące wydanie LTS.

## Konsekwencje

**Pozytywne**

- Jeden język i jeden pakiet: agent zmienia kontrakt API w `src/shared` i kompilator pokazuje wszystkie miejsca do poprawy po obu stronach.
- Cała logika filtrów i wyliczeń jest czystym kodem testowanym jednostkowo, bez przeglądarki i bazy.
- Testy na każdym poziomie działają bez sekretów i bez sieci zewnętrznej.
- Wdrożenie to dwa kontenery; kopia zapasowa to jeden zrzut bazy.

**Negatywne i ryzyka**

- Część użytych narzędzi ma świeże wersje główne (Vite 8, Vitest 5, React Router 8, ESLint 10). Agent może znać starsze API; `AGENTS.md` każe sprawdzać zainstalowaną wersję zamiast pisać z pamięci.
- TypeScript jest przypięty do linii 6.0, bo `typescript-eslint` nie obsługuje jeszcze TypeScript 7. Aktualizacja będzie osobną decyzją.
- Pełna migawka przesyła całość danych po każdej zmianie wykonanej na innym urządzeniu. Przy 1000 przepisów to około 1 MB; gdyby skala wzrosła o rząd wielkości, trzeba przejść na synchronizację przyrostową.
- Odczyt stron i wyszukiwanie zależą od struktury cudzych serwisów. Zmianę po ich stronie wykryje dopiero ręczny odbiór albo użytkownik; testy automatyczne chronią tylko własne strony testowe. Serwer pobierający adresy podane przez użytkownika musi blokować adresy prywatne (ochrona przed SSRF).
- Tabela składników wymaga utrzymania: nierozpoznane składniki nie psują aplikacji (S5 opisuje ten stan), ale obniżają liczbę przepisów z wyliczonymi wartościami.
- Szyfrowanie w spoczynku zależy od konfiguracji serwera, której repozytorium nie wymusza. Procedura wdrożenia (etap 1.1) musi to sprawdzić.
- Każde uruchomienie skryptu buduje obraz Dockera; po pracy zostają nieotagowane obrazy, które trzeba okresowo usuwać (`docker image prune`).
- Na iOS powiadomienia push działają tylko w aplikacji zainstalowanej na ekranie głównym; specyfikacja to przewiduje (S23).
