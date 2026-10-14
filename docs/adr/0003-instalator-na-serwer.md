# ADR 0003: Instalator na serwer i jego testy

- **Status:** przyjęty
- **Data:** 2026-10-14
- **Specyfikacja:** [.ai/specs/2026-10-14-instalator.md](../../.ai/specs/2026-10-14-instalator.md) (S1–S12)
- **Uzupełnia:** [ADR 0001](0001-stos-technologiczny.md). Stos aplikacji się nie zmienia; nie ma nowej usługi w `compose.yml`.

## Kontekst

Specyfikacja zastępuje ręczne pierwsze uruchomienie skryptem `scripts/install.sh`. O rozwiązaniach decydują wymagania:

- **Forma (issue #140):** jeden skrypt w bashu, korzystający z `scripts/lib.sh`. Na hoście potrzebne są tylko Docker z Compose ≥ 2.24 i bash, więc instalator nie może zakładać `curl`, `openssl`, `python` ani Node.
- **Idempotencja i sekrety:** instalator nigdy nie nadpisuje niepustej wartości w `.env`, nie wypisuje sekretów, a przerwanie w dowolnym momencie nie zostawia urwanego pliku.
- **Pierwszeństwo `.env`:** Compose domyślnie przedkłada zmienne powłoki nad `.env`. Instalator bierze brakujące wartości ze zmiennych środowiskowych, więc musi uruchamiać Compose bez nich.
- **Ciągłość danych (S3, S10):** ręczne instalacje działają dziś w projekcie Compose `mounjaro-przepisy` (pole `name` w `compose.yml`) z wolumenem `mounjaro-przepisy_db-data`. Instalator musi trafić w ten sam projekt.
- **Testowalność:** każde kryterium ma test automatyczny, także tryb z pytaniami, brak Dockera i limit 3 minut. CI uruchamia instalator dwa razy bez interakcji, w izolacji od innych instalacji na tym samym hoście, i sprząta razem z danymi. Na serwerze właściciela równolegle pracują agenci i inne projekty, a porty 80 i 443 zajmuje nginx.

## Decyzja

| Obszar | Wybór |
| --- | --- |
| Instalator | `scripts/install.sh` w bashu, kroki K1–K9 jako funkcje; wspólne funkcje `.env` w `scripts/lib/env.sh` (nowy plik, ładowany przez instalator obok `scripts/lib.sh`) |
| Klucz wariantu HTTPS | `HTTPS_MODE` w `.env`, wartości `caddy` albo `proxy` |
| Projekt Compose | Zawsze `mounjaro-przepisy` (jak w `compose.yml`); testy podają inny przez `MP_INSTALL_PROJECT` |
| Uruchamianie Compose | `env -i` z listą dozwolonych zmiennych Dockera, `--env-file .env`, `--project-directory` repozytorium |
| Zapis `.env` | Kopia w pliku tymczasowym w tym samym katalogu, `chmod 600`, potem `mv` (atomowa zamiana) |
| Hasło bazy | 32 losowe bajty z `/dev/urandom` zapisane szesnastkowo (`od`) |
| Klucze VAPID | `node:crypto` (krzywa P-256) w jednorazowym kontenerze z obrazu bazowego aplikacji (`node:24-bookworm-slim`), bez sieci |
| Tryb z pytaniami | Gdy standardowe wejście jest terminalem (`[ -t 0 ]`); sekrety czytane przez `read -s` |
| Sprawdzenie zdrowia | `docker compose exec -T app node -e …` na `http://127.0.0.1:3000/api/health` wewnątrz kontenera, aż odpowiedź ma `status: "ok"`, najwyżej 180 s |
| Wykrycie istniejącej bazy | Istnieje wolumen `<projekt>_db-data` |
| Testy kryteriów | Vitest (projekt `installer`, w `scripts/test-unit.sh`) uruchamia prawdziwy `install.sh` z atrapą polecenia `docker` na `PATH`; terminal przez `script` z util-linux |
| Testy na prawdziwym stosie | `scripts/test-installer.sh` na hoście: kopia repozytorium, projekt Compose `inst-<id>`, plik nakładki bez portów hosta; osobne zadanie w CI |
| Lint skryptów | `shellcheck` w obrazie `dev`, wywoływany przez `scripts/lint.sh` dla `scripts/**/*.sh` i `tests/installer/**/*.sh` |

### Najważniejsze rozstrzygnięcia

1. **Bash bez narzędzi spoza Dockera.** Wszystko, czego nie ma w czystym bashu i coreutils, instalator robi w kontenerze. Losowość bierze z `/dev/urandom` przez `od`, jak już robi `run_id` w `scripts/lib.sh`. Klucze VAPID generuje Node w obrazie `node:24-bookworm-slim`, który i tak jest pobierany przy budowie aplikacji (`ARG NODE_IMAGE` w `Dockerfile`), więc nie dochodzi nowy obraz z Docker Hub. Kontener działa z `--network none` i `--rm`; klucze trafiają do zmiennych basha i od razu do `.env`, nigdy na wyjście. Format jest ten, którego oczekuje biblioteka `web-push`: klucz publiczny to nieskompresowany punkt (65 bajtów), prywatny to 32 bajty, oba w base64url.
2. **`.env` czytany parserem, nigdy przez `source`.** Ręcznie edytowany plik mógłby wykonać kod. Parser rozpoznaje linie `KLUCZ=wartość`, komentarze i puste linie; wartość w pojedynczych albo podwójnych cudzysłowach traktuje jak Compose (zdejmuje cudzysłowy). Przy kluczu zdublowanym odczyt bierze ostatnie wystąpienie, jak Compose, ale instalator takiego klucza nie uzupełnia, a K7 zgłasza duplikat.
3. **Zapis tylko przez atomową zamianę pliku.** Uzupełnienie wartości zmienia dokładnie jedną linię (pusty klucz) albo dopisuje linię na końcu (klucza nie ma). Nowa treść powstaje w pliku z `mktemp` w katalogu repozytorium, z uprawnieniami `600`, i zastępuje `.env` przez `mv`. Przerwanie przed `mv` zostawia stary plik, po `mv` nowy; urwanej linii nie ma nigdy. Pliki tymczasowe usuwa `trap` na `EXIT`. Wartości wpisywane przez instalator są ograniczone do znaków `A–Z a–z 0–9 . _ @ + : / = -` (poza tym zakresem K5 odrzuca wartość jako błędną); dzięki temu zapis bez cudzysłowów jest jednoznaczny dla Compose i nie podlega interpolacji `$`.
4. **Compose bez zmiennych powłoki.** Każde wywołanie `docker compose` idzie przez jedną funkcję, która uruchamia `env -i` i przepuszcza tylko `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `XDG_RUNTIME_DIR` oraz `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`, `DOCKER_CERT_PATH`, `DOCKER_TLS_VERIFY`, `DOCKER_BUILDKIT`. Do tego `--env-file "$ROOT_DIR/.env"`, `--project-directory "$ROOT_DIR"` i `-p "$PROJECT"`. Wartości z `.env` mają wtedy jedyne źródło (S2, S3), a zmienna powłoki `COMPOSE_PROJECT_NAME` nie przeniesie instalacji do pustego projektu.
5. **Wariant jako osobny klucz `HTTPS_MODE`.** `COMPOSE_PROFILES=tls` w `.env` też włączałby `caddy`, ale pusta wartość nie odróżnia „nie wybrano” od „własne proxy”, a specyfikacja wymaga pytania, gdy wyboru nie ma. Instalator mapuje `caddy` na `--profile tls`. Przy `proxy` po `up` usuwa kontener `caddy` (`--profile tls rm -sf caddy`), bo `up` bez profilu go nie dotyka (S9). Nazwa `proxy` jest krótka i jednoznaczna w zestawieniu z `caddy`.
6. **Stała nazwa projektu i wolumen jako znak istniejącej bazy.** Instalacja ręczna i instalator dzielą projekt `mounjaro-przepisy`, więc instalator widzi dane ręcznej instalacji (S10). Przy pustym `POSTGRES_PASSWORD` K4 sprawdza `docker volume inspect mounjaro-przepisy_db-data`; jeśli wolumen istnieje, zatrzymuje się, nie generując hasła. Sam wolumen bez danych zdarza się tylko po ręcznych eksperymentach, a fałszywy alarm kosztuje właściciela jedno `docker volume rm`, podczas gdy przeoczenie odcina dane.
7. **Sprawdzenie zdrowia wewnątrz kontenera.** Host nie musi mieć `curl`, wynik nie zależy od DNS ani certyfikatu, a obcy program na `APP_PORT` nie może udawać aplikacji, bo zapytanie nie wychodzi z kontenera `app`. Zajęty port zgłasza Docker przy `up` (`port is already allocated`, `address already in use`); instalator rozpoznaje te komunikaty i podaje nazwę `APP_PORT`. Instalator wymaga w odpowiedzi `status: "ok"`, a nie tylko kodu 200, i nie wypisuje logów aplikacji, tylko polecenie do nich.
8. **Testy kryteriów na atrapie `docker`.** Prawie wszystkie kryteria dotyczą tego, co instalator pyta, wypisuje, zapisuje w `.env` i jakie polecenia Dockera wydaje. Testuje je Vitest, który uruchamia prawdziwy `scripts/install.sh` w kopii repozytorium z katalogiem atrapy na początku `PATH`. Atrapa (`tests/installer/fake-docker/docker`, bash) czyta swoje zachowanie z pliku stanu obok siebie (wersja Compose, brak dostępu, istniejący wolumen, błąd budowania, zajęty port, wynik sprawdzenia zdrowia) i dopisuje do dziennika każde wywołanie razem z otrzymanym środowiskiem. Plik stanu zamiast zmiennych środowiskowych jest konieczny, bo instalator celowo czyści środowisko przed Compose. Testy działają w obrazie `dev` bez Dockera, trwają sekundy i wchodzą do `scripts/test-unit.sh`.
9. **Terminal w testach przez `script`.** Tryb z pytaniami zależy od tego, czy wejście jest terminalem. `script -qefc` z util-linux (jest w `node:24-bookworm-slim`) daje instalatorowi pseudoterminal, a test pisze odpowiedzi na wejście `script`. Ctrl+C i Ctrl+D to bajty `\x03` i `\x04` wysłane przez pseudoterminal, więc dyscyplina linii zamienia je na `SIGINT` i koniec pliku dokładnie jak u właściciela. Bez nowej zależności npm z kodem natywnym (`node-pty`).
10. **Limit 3 minut sterowany zmienną tylko dla testów.** `MP_INSTALL_HEALTH_TIMEOUT` (sekundy, domyślnie 180) pozwala testowi S8 skończyć się w kilka sekund. Osobny test sprawdza, że bez zmiennej limit wynosi 180 s (wartość wypisywana w komunikacie K9). Zmienne `MP_INSTALL_*` nie są kluczami `.env`, nie trafiają do Compose i są opisane w `.env.example` jako testowe.
11. **Prawdziwy stos w osobnym skrypcie.** Ciągłość danych, pierwszeństwo `.env` w działającej aplikacji, zatrzymanie `caddy` i dwa uruchomienia bez interakcji (wymaganie CI) wymagają Dockera. `scripts/test-installer.sh` kopiuje bieżące pliki repozytorium (`git ls-files --cached --others --exclude-standard`) do katalogu tymczasowego, ustawia `MP_INSTALL_PROJECT=inst-<id>` i `MP_INSTALL_COMPOSE_OVERRIDE` z nakładką `tests/installer/compose.installer-test.yml` (bez portów hosta dla `caddy`, losowy port na `127.0.0.1` dla aplikacji, bez usługi `backup`) i uruchamia scenariusze `tests/installer/stack/*.sh`. Zawsze sprząta w `trap`: `down -v --remove-orphans --rmi local` i katalog tymczasowy. Skrypt nie wchodzi do `validation.commands` (pięć skryptów zostaje bez zmian); CI uruchamia go w osobnym zadaniu przy każdym PR, a `AGENTS.md` mówi, kiedy agent uruchamia go lokalnie.
12. **`shellcheck` w lincie.** Instalator to kilkaset linii basha z sekretami; najczęstsze błędy basha (brak cudzysłowów, `read` bez `-r`, ignorowane kody wyjścia) wyłapuje `shellcheck`. Instalujemy go z repozytorium Debiana w etapie `dev` obrazu, więc nie dochodzi obraz z Docker Hub ani pobieranie binarki przy `npm ci`.

## Rozważone alternatywy

- **Instalator w Node albo w TypeScripcie uruchamiany w kontenerze.** Łatwiejsze testy jednostkowe, ale sprzeczne z wymaganiem właściciela (bash, `scripts/lib.sh`), a interakcja z terminalem przez `docker run -it` i zapis `.env` przez wolumen komplikują uprawnienia pliku.
- **`bats-core` do testów instalatora.** Popularny dla basha, ale to drugi framework testowy w projekcie, który agenci muszą znać, i dodatkowa zależność w obrazie. Vitest uruchamiający skrypt jako proces daje to samo z narzędziem, które już jest.
- **Wszystkie testy na prawdziwym Dockerze.** Każdy z około czterdziestu przypadków budowałby i uruchamiał stos (minuty zamiast sekund), a brak Dockera, stara wersja Compose i brak dostępu do gniazda są na prawdziwym hoście trudne do zasymulowania.
- **`expect` albo `node-pty` do trybu z pytaniami.** `expect` to dodatkowy pakiet i język, `node-pty` kompiluje kod natywny przy `npm ci`. `script` jest w obrazie.
- **`COMPOSE_PROFILES` w `.env` zamiast `HTTPS_MODE`.** Odrzucone w punkcie 5.
- **`openssl rand`, `docker run … web-push generate-vapid-keys` z obrazu aplikacji.** `openssl` nie musi być na hoście. Obraz aplikacji powstaje dopiero w K8, a budowanie go w K6 zmieniałoby kolejność kroków ze specyfikacji i wydłużało przerwaną instalację.
- **Sprawdzenie zdrowia przez `curl 127.0.0.1:$APP_PORT` albo stan `HEALTHCHECK` kontenera.** `curl` nie musi być na hoście i odpowiedziałby mu obcy program na zajętym porcie. `HEALTHCHECK` w `Dockerfile` sprawdza tylko kod HTTP, a specyfikacja wymaga `ok`.
- **Wykrycie istniejącej bazy przez połączenie z PostgreSQL.** Wymaga hasła, którego właśnie brakuje, albo uruchomienia bazy w trybie bez hasła. Wolumen jest prostszy i nie dotyka danych.
- **`scripts/test-installer.sh` w `validation.commands`.** Każdy agent przy każdym PR budowałby i uruchamiał dodatkową instalację, także przy zmianach ekranów. Pełny przebieg i tak robi CI.

## Konsekwencje

- Nowe pliki: `scripts/install.sh`, `scripts/lib/env.sh`, `scripts/test-installer.sh`, `tests/installer/` (testy Vitest, atrapa `docker`, scenariusze na prawdziwym stosie, nakładka Compose). `scripts/lint.sh` sprawdza też skrypty basha.
- Obraz `dev` zawiera `shellcheck`; zmiana `Dockerfile` przebudowuje warstwę `dev` raz.
- Zmiana `compose.yml`, `.env.example`, `Dockerfile` albo `scripts/install.sh` wymaga przejścia `scripts/test-installer.sh` (CI robi to zawsze).
- Instalator i ręczna ścieżka dzielą projekt Compose i `.env`, więc ręczne polecenia z `docs/operations.md` dalej działają po instalacji instalatorem i odwrotnie. Ręczna ścieżka uruchamia Compose z `.env` i powłoką, więc pierwszeństwo `.env` gwarantuje tylko instalator.
- Zmienne `MP_INSTALL_PROJECT`, `MP_INSTALL_COMPOSE_OVERRIDE` i `MP_INSTALL_HEALTH_TIMEOUT` istnieją wyłącznie dla testów; dokumentacja dla właściciela ich nie wymienia poza opisem w `.env.example`.
