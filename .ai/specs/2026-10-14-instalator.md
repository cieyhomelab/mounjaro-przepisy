# Instalator na serwer

## TLDR

Jeden skrypt `scripts/install.sh` zastępuje ręczną listę kroków pierwszego uruchomienia Mounjaro Przepisy na serwerze właściciela. Sprawdza wymagania, przygotowuje `.env` z sekretami, uruchamia aplikację i czeka, aż odpowie, że działa. Ponowne uruchomienie pomija kroki już wykonane, nie nadpisuje ustawionych wartości i przebudowuje aplikację z bieżącego kodu, więc służy też do aktualizacji. Źródłem jest issue #140.

## Problem i cel

Dziś pierwsze uruchomienie to ręczna lista kroków z `README.md` („Wdrożenie”) i `docs/operations.md` („Pierwsze uruchomienie”): skopiować `.env.example`, wpisać kilka sekretów, wygenerować klucze VAPID, wybrać wariant Compose i sprawdzić `/api/health`. Każdy krok to okazja do pomyłki. Najgroźniejsza jest zmiana hasła bazy, która odcina dostęp do zapisanych danych. Do tego `cp .env.example .env` daje dziś zdublowane klucze z nieprawidłową wartością `PUSH_MODE=webpush`.

**Miara sukcesu:**
- Właściciel instaluje aplikację na czystym serwerze jednym poleceniem, odpowiadając tylko na pytania o wartości, których nie da się wygenerować.
- Ponowne uruchomienie nigdy nie zmienia już ustawionego sekretu.

## Użytkownicy i role

- **Właściciel (jedyna rola):** administrator serwera z dostępem do powłoki i Dockera. Uruchamia instalator w katalogu sklonowanego repozytorium.
- **CI:** uruchamia instalator bez interakcji, z atrapami wartości, żeby sprawdzić idempotencję.
- Użytkowniczka aplikacji nie ma kontaktu z instalatorem.

## Scenariusze

Wspólne zasady wszystkich scenariuszy:

- Instalator wypisuje każdy krok z wynikiem: „zrobione”, „pominięty, już zrobione” albo „błąd”.
- Kończy się kodem 0 tylko wtedy, gdy aplikacja potwierdziła, że działa. Przy każdym błędzie kod jest różny od zera.
- Komunikaty są po polsku.
- Wartości sekretów (`POSTGRES_PASSWORD`, `GOOGLE_CLIENT_SECRET`, `VAPID_PRIVATE_KEY`) nigdy nie trafiają na wyjście instalatora, także przy błędzie. Komunikaty podają nazwę zmiennej, nigdy jej wartość.
- **Tryb z pytaniami** działa, gdy instalator ma terminal. **Tryb bez interakcji** działa, gdy go nie ma (potok, CI).
- Brakującą wartość instalator bierze najpierw ze zmiennej środowiskowej o tej samej nazwie co klucz w `.env`. Pyta o nią tylko w trybie z pytaniami. Wartość już ustawiona w `.env` zawsze ma pierwszeństwo przed zmienną środowiskową, także przy uruchamianiu aplikacji: Compose domyślnie przedkłada zmienne powłoki nad `.env`, więc instalator nie może przekazać mu zmiennej środowiskowej, która różni się od wartości zapisanej w `.env`.

### Kroki instalatora

| Krok | Co robi | Kiedy „pominięty, już zrobione” |
| --- | --- | --- |
| K1 Wymagania | Sprawdza, czy jest Docker, czy jest dostęp do niego i czy Compose ma wersję co najmniej 2.24. Niczego nie zmienia. | Nigdy, sprawdza zawsze. |
| K2 Plik `.env` | Tworzy `.env` z `.env.example`, gdy pliku nie ma. Ogranicza uprawnienia do właściciela pliku. | Plik istnieje. Treść zostaje bez zmian, a uprawnienia są ograniczane, gdy są szersze. |
| K3 Wariant | Ustala wariant HTTPS: wbudowana usługa `caddy` albo własne reverse proxy. Zapisuje wybór w `.env`. | Wybór jest już zapisany. |
| K4 Hasło bazy | Generuje losowe `POSTGRES_PASSWORD`. | Wartość jest niepusta. |
| K5 Wartości od właściciela | Uzupełnia puste: domenę (`APP_DOMAIN` i `APP_BASE_URL`), `ALLOWED_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BACKUP_AGE_RECIPIENT`. Każdą poprawną odpowiedź zapisuje do `.env` od razu. | Wszystkie są niepuste. |
| K6 Klucze push | Generuje parę `VAPID_PUBLIC_KEY` i `VAPID_PRIVATE_KEY`. | Obie wartości są niepuste. |
| K7 Kontrola `.env` | Sprawdza cały `.env` według sekcji „Zasady poprawności”. Przy problemie zatrzymuje się przed startem, wymienia nazwy zmiennych i niczego nie zmienia. | Nigdy, sprawdza zawsze. |
| K8 Start | Buduje i uruchamia aplikację w zapisanym wariancie, z wartościami z `.env` (zmienne środowiskowe o tych samych nazwach nie trafiają do Compose). W wariancie z własnym proxy zatrzymuje usługę `caddy`, jeśli działa. | Nigdy. Przebudowa z bieżącego kodu działa jako aktualizacja. |
| K9 Sprawdzenie | Czeka do 3 minut, aż sprawdzenie zdrowia aplikacji na serwerze zwróci `ok`. Potem wypisuje przypomnienie o krokach ręcznych. | Nigdy. |

„Drugie uruchomienie pomija wszystko” w kryteriach poniżej dotyczy kroków K2–K6.

**Domena:** właściciel podaje ją raz. `APP_DOMAIN` to sama nazwa hosta, a `APP_BASE_URL` to `https://<domena>`.
- Gdy jeden z tych kluczy jest ustawiony, a drugi pusty, instalator wylicza brakujący z ustawionego i o nic nie pyta.
- W trybie bez interakcji domenę podaje zmienna `APP_DOMAIN` albo `APP_BASE_URL`.

**Zasady poprawności** (K5 dla wpisywanych wartości, K7 dla całego `.env`):
- Żaden klucz nie występuje w `.env` więcej niż raz.
- `APP_DOMAIN`: sama nazwa hosta, bez `https://`, ścieżki i końcowego ukośnika. Wymagana w wariancie `caddy`.
- `APP_BASE_URL`: `https://<host>` bez ścieżki i końcowego ukośnika. W wariancie z własnym proxy dozwolony jest port (`https://<host>:<port>`). W wariancie `caddy` port jest niedozwolony, a host jest równy `APP_DOMAIN`.
- `ALLOWED_EMAIL`: poprawny adres e-mail.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `POSTGRES_PASSWORD`: niepuste.
- `BACKUP_AGE_RECIPIENT`: zaczyna się od `age1`.
- `PUSH_MODE`: pusty albo `web-push`, bo instalacja jest produkcyjna.
- `AUTH_MODE`: pusty albo `google`.
- Wariant HTTPS ma jedną z dwóch dozwolonych wartości.

Przypomnienie na końcu (K9) wymienia:
- konfigurację klienta OAuth w Google Cloud Console z adresem powrotu `${APP_BASE_URL}/api/auth/google/callback`;
- zaszyfrowany dysk serwera;
- klucz prywatny `age` trzymany poza serwerem;
- w wariancie `caddy`: rekord DNS domeny i otwarte porty 80 i 443;
- listę kontrolną odbioru w `docs/operations.md`.

### S1: Pierwsza instalacja z pytaniami

1. Właściciel klonuje repozytorium na serwer, wchodzi do jego katalogu i uruchamia `scripts/install.sh` w terminalu.
2. Instalator sprawdza wymagania i tworzy `.env`.
3. Pyta o wariant HTTPS (`caddy` albo własne proxy).
4. Generuje hasło bazy.
5. Pyta kolejno o:
   - domenę;
   - adres Google, który może się logować;
   - Client ID i Client secret klienta OAuth;
   - klucz publiczny `age`.

   Przy pytaniu o klucz `age` przypomina, jak wygenerować parę kluczy na własnym komputerze. Wpisywany Client secret nie jest wyświetlany na ekranie.
6. Generuje klucze push.
7. Sprawdza `.env`, uruchamia aplikację, czeka na potwierdzenie działania i wypisuje przypomnienie o krokach ręcznych.

**Kryteria akceptacji**
- Zakładając serwer z Dockerem i Compose ≥ 2.24 bez pliku `.env`, gdy właściciel uruchomi instalator i poda poprawne wartości, wtedy instalator kończy się kodem 0, a sprawdzenie zdrowia aplikacji zwraca `ok`.
- Zakładając tę samą sytuację, gdy instalator się zakończy, wtedy:
  - `.env` istnieje i ma uprawnienia tylko dla właściciela pliku;
  - `POSTGRES_PASSWORD`, `VAPID_PUBLIC_KEY` i `VAPID_PRIVATE_KEY` są niepuste;
  - `APP_DOMAIN` to podana domena, a `APP_BASE_URL` to `https://<podana domena>`;
  - `ALLOWED_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` i `BACKUP_AGE_RECIPIENT` mają podane wartości;
  - wybrany wariant jest zapisany.
- Zakładając pierwszą instalację, gdy instalator się zakończy, wtedy pełne wyjście instalatora nie zawiera wartości `POSTGRES_PASSWORD`, `GOOGLE_CLIENT_SECRET` ani `VAPID_PRIVATE_KEY`.
- Zakładając pierwszą instalację, gdy instalator się zakończy, wtedy na końcu wyjścia jest przypomnienie o wszystkich krokach ręcznych wymienionych w sekcji „Kroki instalatora”.
- Zakładając wybór wariantu `caddy`, gdy instalator uruchomi aplikację, wtedy usługa `caddy` jest uruchomiona (bez wymogu wydania certyfikatu).
- Zakładając wybór własnego proxy, gdy instalator uruchomi aplikację, wtedy usługa `caddy` nie działa, a aplikacja nasłuchuje tylko na `127.0.0.1:${APP_PORT}`.
- Zakładając pytanie w toku, gdy właściciel przerwie wpisywanie (Ctrl+C albo Ctrl+D), wtedy instalator kończy się kodem różnym od zera i nie zapisuje wartości, o którą pytał.

### S2: Instalacja bez interakcji

1. Właściciel (albo CI) ustawia wartości w zmiennych środowiskowych i uruchamia instalator bez terminala.
2. Instalator bierze każdą brakującą wartość ze zmiennej środowiskowej, także wariant HTTPS.
3. Instalator o nic nie pyta i przechodzi wszystkie kroki.

**Kryteria akceptacji**
- Zakładając brak `.env` i ustawione zmienne środowiskowe z domeną, `ALLOWED_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BACKUP_AGE_RECIPIENT` i wariantem, gdy instalator zostanie uruchomiony bez terminala, wtedy:
  - nie zadaje żadnego pytania;
  - kończy się kodem 0;
  - `.env` zawiera podane wartości.
- Zakładając zmienną środowiskową z wartością dla klucza, który w `.env` jest już niepusty, gdy instalator zostanie uruchomiony, wtedy wartość w `.env` się nie zmienia.
- Zakładając zakończoną instalację i zmienne środowiskowe `ALLOWED_EMAIL` oraz `POSTGRES_PASSWORD` z wartościami innymi niż w `.env`, gdy instalator zostanie uruchomiony ponownie, wtedy uruchomiona aplikacja korzysta z wartości z `.env`, a sprawdzenie zdrowia zwraca `ok`.
- Zakładając uruchomienie w terminalu z częścią wartości w zmiennych środowiskowych, gdy instalator dojdzie do K3 i K5, wtedy pyta tylko o wartości, których nie ma ani w `.env`, ani w zmiennych środowiskowych.

### S3: Ponowne uruchomienie i aktualizacja

1. Po udanej instalacji właściciel uruchamia instalator ponownie: od razu albo po `git pull`.
2. Instalator wypisuje K2–K6 jako „pominięty, już zrobione”, o nic nie pyta i przebudowuje aplikację z bieżącego kodu.

**Kryteria akceptacji**
- Zakładając zakończoną instalację, gdy instalator zostanie uruchomiony drugi raz, wtedy kroki K2–K6 są zgłoszone jako „pominięty, już zrobione”, a instalator kończy się kodem 0.
- Zakładając zakończoną instalację, gdy instalator zostanie uruchomiony drugi raz, wtedy treść `.env` jest bajt w bajt taka sama jak przed uruchomieniem (ta sama suma kontrolna).
- Zakładając zakończoną instalację, gdy instalator zostanie uruchomiony drugi raz w terminalu, wtedy nie zadaje żadnego pytania, także o wariant.
- Zakładając zakończoną instalację z zapisanymi danymi w bazie, gdy instalator zostanie uruchomiony ponownie, wtedy dane są nadal dostępne (baza przyjmuje dotychczasowe hasło).
- Zakładając, że właściciel ręcznie zmienił w `.env` wartość, np. `ALLOWED_EMAIL`, gdy uruchomi instalator ponownie, wtedy zmieniona wartość zostaje w `.env`, a uruchomiona aplikacja korzysta z nowej wartości.
- Zakładając zakończoną instalację z danymi w bazie, gdy właściciel usunie `.env` albo wyczyści w nim `POSTGRES_PASSWORD` i uruchomi instalator, wtedy:
  - instalator kończy się kodem różnym od zera z komunikatem, że baza ma już hasło, którego nie ma w `.env`;
  - nie generuje nowego hasła i nie zapisuje `POSTGRES_PASSWORD` do `.env`;
  - nie uruchamia aplikacji, a dane w bazie zostają nietknięte.

### S4: Dokończenie przerwanej instalacji

1. Instalacja zostaje przerwana w połowie: Ctrl+C, zamknięty terminal albo błąd Dockera przy budowaniu.
2. Właściciel uruchamia instalator ponownie.
3. Instalator pomija kroki zakończone wcześniej i dokańcza pozostałe.

**Kryteria akceptacji**
- Zakładając instalację przerwaną po wygenerowaniu hasła bazy, gdy instalator zostanie uruchomiony ponownie, wtedy:
  - hasło bazy pozostaje to samo;
  - instalator uzupełnia brakujące kroki i kończy się kodem 0.
- Zakładając instalację przerwaną podczas K5 po zapisaniu części wartości, gdy instalator zostanie uruchomiony ponownie, wtedy pyta tylko o wartości jeszcze puste.
- Zakładając instalację przerwaną w K8 (błąd budowania), gdy przyczyna zostanie usunięta i instalator uruchomiony ponownie, wtedy kroki K2–K6 są pominięte, a aplikacja startuje.
- Zakładając przerwanie w dowolnym momencie, gdy instalator zostanie uruchomiony ponownie, wtedy `.env` nie zawiera zdublowanych kluczy ani urwanych linii.

### S5: Brak wymagań

1. Właściciel uruchamia instalator na serwerze bez Dockera, bez dostępu do niego albo ze starszym Compose.
2. Instalator przerywa pracę z czytelnym komunikatem, zanim cokolwiek zmieni.

**Kryteria akceptacji**
- Zakładając brak polecenia `docker`, gdy instalator zostanie uruchomiony, wtedy:
  - kończy się kodem różnym od zera z komunikatem, że brakuje Dockera;
  - nie tworzy ani nie zmienia `.env`.
- Zakładając Compose w wersji starszej niż 2.24 albo jego brak, gdy instalator zostanie uruchomiony, wtedy:
  - kończy się kodem różnym od zera z komunikatem podającym wykrytą i wymaganą wersję;
  - nie tworzy ani nie zmienia `.env`.
- Zakładając działający Docker, do którego użytkownik nie ma dostępu, gdy instalator zostanie uruchomiony, wtedy:
  - kończy się kodem różnym od zera z komunikatem o braku dostępu do Dockera;
  - nie tworzy ani nie zmienia `.env`.

### S6: Brakująca albo błędna wartość

1. Instalatorowi brakuje wymaganej wartości albo dostaje wartość niezgodną z „Zasadami poprawności”.
2. W trybie z pytaniami wskazuje problem i pyta o tę wartość ponownie.
3. W trybie bez interakcji zatrzymuje się i wymienia wszystkie brakujące albo błędne zmienne.

**Kryteria akceptacji**
- Zakładając uruchomienie w terminalu, gdy właściciel poda domenę z `https://` albo e-mail bez `@`, wtedy instalator:
  - wskazuje, co jest nie tak;
  - pyta o tę wartość ponownie;
  - nie zapisuje błędnej wartości.
- Zakładając uruchomienie bez terminala z brakującymi `GOOGLE_CLIENT_ID` i `BACKUP_AGE_RECIPIENT`, gdy instalator dojdzie do K5, wtedy:
  - kończy się kodem różnym od zera;
  - wymienia obie nazwy zmiennych;
  - nie uruchamia aplikacji.
- Zakładając uruchomienie bez terminala bez zapisanego wariantu i bez zmiennej z wariantem, gdy instalator dojdzie do K3, wtedy kończy się kodem różnym od zera i wskazuje, że brakuje wariantu.
- Zakładając zmienną środowiskową z błędną wartością (np. klucz `age` bez prefiksu `age1`), gdy instalator zostanie uruchomiony bez terminala, wtedy kończy się kodem różnym od zera i podaje nazwę zmiennej, ale nie jej wartość.
- Zakładając zatrzymanie z powodu braku wartości, gdy właściciel uzupełni ją i uruchomi instalator ponownie, wtedy instalacja przechodzi dalej, a wcześniej zapisane wartości są nietknięte.

### S7: Błędna wartość już zapisana w `.env`

1. `.env` zawiera wartość niezgodną z „Zasadami poprawności”, np. `PUSH_MODE=webpush` ze starego `.env.example`, zdublowany klucz, klucz `age` bez `age1` albo `APP_DOMAIN` i `APP_BASE_URL` wskazujące różne hosty w wariancie `caddy`.
2. Instalator zatrzymuje się w K7, przed startem aplikacji, i niczego nie zmienia.
3. Właściciel poprawia `.env` ręcznie i uruchamia instalator ponownie.

**Kryteria akceptacji**
- Zakładając `.env` z `PUSH_MODE=webpush`, gdy instalator zostanie uruchomiony, wtedy:
  - kończy się kodem różnym od zera w K7;
  - podaje nazwę `PUSH_MODE` i dozwoloną wartość;
  - nie uruchamia aplikacji;
  - treść `.env` się nie zmienia.
- Zakładając `.env`, w którym klucz `VAPID_PUBLIC_KEY` występuje dwa razy, gdy instalator zostanie uruchomiony, wtedy kończy się kodem różnym od zera w K7, wymienia zdublowany klucz i nie zmienia treści `.env`.
- Zakładając `.env` z niepustym `BACKUP_AGE_RECIPIENT` bez prefiksu `age1`, gdy instalator zostanie uruchomiony, wtedy kończy się kodem różnym od zera w K7 i podaje nazwę zmiennej, ale nie jej wartość.
- Zakładając zatrzymanie w K7, gdy właściciel poprawi `.env` i uruchomi instalator ponownie, wtedy instalator kończy się kodem 0.

### S8: Aplikacja nie odpowiada

1. Instalator uruchomił aplikację, ale sprawdzenie zdrowia nie zwraca `ok`.
2. Po 3 minutach instalator kończy się błędem i podaje polecenie, którym właściciel obejrzy logi aplikacji.

**Kryteria akceptacji**
- Zakładając aplikację, która nie odpowiada `ok`, gdy miną 3 minuty od startu, wtedy instalator kończy się kodem różnym od zera z komunikatem, że aplikacja nie odpowiada, i z poleceniem do podejrzenia jej logów.
- Zakładając tę samą sytuację, gdy instalator się zakończy, wtedy nie wypisuje sam logów aplikacji ani wartości sekretów.
- Zakładając aplikację, która odpowiada `ok` przed upływem 3 minut, gdy przyjdzie odpowiedź, wtedy instalator nie czeka dłużej i przechodzi do przypomnienia.

### S9: Zmiana wariantu HTTPS

1. Właściciel zmienia ręcznie w `.env` zapisany wariant, np. z `caddy` na własne proxy.
2. Uruchamia instalator ponownie.
3. Instalator uruchamia aplikację w nowym wariancie.

**Kryteria akceptacji**
- Zakładając instalację w wariancie `caddy` z działającą usługą `caddy`, gdy właściciel zmieni w `.env` wariant na własne proxy i uruchomi instalator, wtedy:
  - usługa `caddy` zostaje zatrzymana;
  - aplikacja nasłuchuje tylko na `127.0.0.1:${APP_PORT}`;
  - instalator kończy się kodem 0.
- Zakładając instalację w wariancie z własnym proxy, gdy właściciel zmieni wariant na `caddy` (mając ustawioną domenę) i uruchomi instalator, wtedy usługa `caddy` jest uruchomiona, a instalator kończy się kodem 0.
- Zakładając zmianę wariantu, gdy instalator zostanie uruchomiony, wtedy krok K3 jest zgłoszony jako „pominięty, już zrobione”, a treść `.env` się nie zmienia.

### S10: Pierwsze uruchomienie instalatora na instalacji ręcznej

1. Aplikacja działa już na serwerze, zainstalowana ręcznie według `docs/operations.md`. `.env` istnieje, ale nie ma zapisanego wariantu.
2. Po `git pull` właściciel uruchamia instalator.
3. Instalator pyta tylko o wariant i o wartości, których brakuje. Resztę pomija.

**Kryteria akceptacji**
- Zakładając ręcznie przygotowany `.env` z wszystkimi wartościami poza wariantem i działającą bazą z danymi, gdy właściciel uruchomi instalator w terminalu, wtedy:
  - instalator pyta wyłącznie o wariant;
  - nie zmienia żadnej istniejącej wartości;
  - kończy się kodem 0;
  - dane w bazie są dostępne.
- Zakładając ręczny `.env` z `APP_BASE_URL` i pustą `APP_DOMAIN`, gdy instalator dojdzie do K5, wtedy wylicza `APP_DOMAIN` z `APP_BASE_URL` bez pytania.
- Zakładając ręczny `.env` bez kluczy dodanych w późniejszych etapach (np. bez `VAPID_*`), gdy instalator zostanie uruchomiony, wtedy dopisuje brakujące klucze z wartościami, a pozostałą treść pliku zostawia bez zmian.

### S11: Dokumentacja dwóch ścieżek

1. Właściciel czyta `README.md` („Wdrożenie”) albo `docs/operations.md` („Pierwsze uruchomienie”, „Aktualizacja”).
2. Instalator jest opisany jako zalecana ścieżka. Dotychczasowe kroki ręczne zostają jako alternatywa.

**Kryteria akceptacji**
- Zakładając `README.md`, gdy właściciel przeczyta sekcję „Wdrożenie”, wtedy znajdzie polecenie instalatora i odnośnik do ręcznej ścieżki.
- Zakładając `docs/operations.md`, gdy właściciel przeczyta „Pierwsze uruchomienie”, wtedy znajdzie:
  - instalator jako zalecaną ścieżkę;
  - listę zmiennych środowiskowych do trybu bez interakcji, z nazwą i wartościami zmiennej wariantu;
  - bezpieczny sposób podania sekretów bez interakcji, tak żeby nie trafiły do historii powłoki;
  - opis zmiany wariantu (S9);
  - pełną ręczną listę kroków jako alternatywę.
- Zakładając `docs/operations.md`, gdy właściciel przeczyta „Aktualizację”, wtedy znajdzie `git pull` i ponowne uruchomienie instalatora jako zalecaną ścieżkę.

### S12: Uporządkowany `.env.example`

1. Ktoś kopiuje `.env.example` do `.env`: ręcznie albo przez instalator.
2. Każda zmienna jest zdefiniowana raz, z wartością akceptowaną przez aplikację.

**Kryteria akceptacji**
- Zakładając `.env.example`, gdy sprawdzimy jego klucze, wtedy żaden klucz nie występuje więcej niż raz.
- Zakładając `.env.example`, gdy sprawdzimy `PUSH_MODE`, wtedy jego wartość to `web-push`.
- Zakładając `.env` skopiowany z `.env.example` i uzupełniony o wymagane wartości, gdy aplikacja wystartuje, wtedy nie zgłasza błędu konfiguracji.

## Dane

Instalator nie tworzy danych biznesowych aplikacji. Zapisuje wyłącznie konfigurację w `.env` na serwerze:

- `POSTGRES_PASSWORD`: sekret, generowany.
- `APP_DOMAIN`, `APP_BASE_URL`: z domeny podanej przez właściciela.
- `ALLOWED_EMAIL`: adres Google jedynej osoby, która może się logować. [DANE OSOBOWE]
- `GOOGLE_CLIENT_ID`; `GOOGLE_CLIENT_SECRET` (sekret).
- `BACKUP_AGE_RECIPIENT`: klucz publiczny, nie jest sekretem.
- `VAPID_PUBLIC_KEY`; `VAPID_PRIVATE_KEY` (sekret, generowany).
- Wariant HTTPS: `caddy` albo własne proxy. Nazwę klucza i dokładne wartości ustala architekt.

`.env` nie trafia do repozytorium, ma uprawnienia tylko dla właściciela pliku i nie jest kopiowany przez instalator nigdzie indziej.

## Integracje zewnętrzne

Brak nowych. Instalator korzysta tylko z Dockera i Compose na serwerze. Konfiguracja klienta OAuth w Google Cloud Console zostaje ręczna, a instalator tylko o niej przypomina.

## Wymagania niefunkcjonalne

- **Wymagania właściciela co do formy (issue #140):**
  - jeden skrypt `scripts/install.sh` w bashu, korzystający z `scripts/lib.sh`, uruchamiany w katalogu sklonowanego repozytorium;
  - na hoście potrzebuje tylko Dockera z Compose ≥ 2.24 i basha.
- **Idempotencja:** wielokrotne uruchomienie daje ten sam stan.
  - Instalator nigdy nie nadpisuje niepustej wartości w `.env`. Dotyczy to zwłaszcza `POSTGRES_PASSWORD` (nowe hasło odcina dostęp do wolumenu bazy) i kluczy VAPID (nowe unieważniają subskrypcje push).
  - Wartości zmienia wyłącznie właściciel, ręcznie.
- **Odporność na przerwanie:** przerwanie w dowolnym momencie nie zostawia `.env` w połowie zapisanego.
- **Bezpieczeństwo:**
  - instalator nie wypisuje sekretów i sam nie zapisuje ich nigdzie poza `.env`;
  - wpisywane w terminalu sekrety nie są wyświetlane.
- **Język:** komunikaty po polsku.
- **Czas:** sprawdzenie zdrowia czeka najwyżej 3 minuty.
- **Testowalność:** każde kryterium akceptacji ma test automatyczny, także kryteria trybu z pytaniami, braku Dockera i limitu 3 minut. Sposób symulacji ustala architekt.
- **Test w CI (wymaganie z issue #140):** instalator uruchamia się dwa razy bez interakcji, z atrapami wartości i odizolowany od innych instalacji na tym samym hoście.
  - CI sprawdza, że drugie uruchomienie pomija K2–K6 i że `.env` się nie zmienia.
  - Na koniec CI sprząta po sobie, razem z danymi.

## Przypadki brzegowe i błędy

- **`.env` z ręcznymi zmianami albo komentarzami:** instalator zachowuje treść, kolejność i komentarze. Uzupełnia tylko puste klucze z K3–K6 albo dopisuje te, których brakuje.
- **Puste `POSTGRES_PASSWORD` (także po usunięciu `.env`), ale baza tej instalacji już ma dane:** instalator zatrzymuje się z komunikatem, że baza ma już hasło, którego nie ma w `.env`, i niczego nie generuje. Nowe hasło odcięłoby dostęp do danych.
- **Uruchomienie spoza katalogu repozytorium** (np. `cd /tmp && /srv/app/scripts/install.sh`): instalator działa na katalogu repozytorium, w którym leży skrypt.
- **Port aplikacji (`APP_PORT`) zajęty przez inny program:** błąd w K8 z nazwą `APP_PORT`. Instalator nie uznaje odpowiedzi obcego programu za działającą aplikację.
- **Domena nie wskazuje na serwer albo porty 80/443 są zamknięte:** instalator tego nie sprawdza.
  - Certyfikat się nie wystawi, ale sprawdzenie zdrowia przechodzi, bo odbywa się na serwerze.
  - Przypomnienie z K9 i sekcja „Diagnostyka” w `docs/operations.md` mówią, co sprawdzić.
- **Brak miejsca na dysku albo błąd budowania:** błąd w K8 z kodem różnym od zera. Ponowne uruchomienie dokańcza instalację (S4).

## Poza zakresem

- Klonowanie repozytorium przez instalator (`curl … | bash`).
- `git pull` wykonywany przez instalator; właściciel robi go sam.
- Zmiana już ustawionych wartości przez instalator, np. opcja „zmień wartość”, oraz automatyczne poprawianie błędnych wartości.
- Automatyczne wdrożenie z CI.
- Konfiguracja klienta OAuth w Google Cloud Console i szyfrowanie dysku (instalator tylko przypomina).
- Generowanie pary kluczy `age` na serwerze.
- Sprawdzanie DNS domeny i otwartych portów 80/443.
- Instalacja Dockera i Compose.
- Wypisywanie logów aplikacji przy błędzie.
- Jakiekolwiek zmiany w kodzie aplikacji.

## Etapy dostarczenia

- **Etap 1: uporządkowany `.env.example`** (S12). Usuwa zdublowany blok „Powiadomienia push” i nieprawidłowe `PUSH_MODE=webpush`. Ręczna instalacja daje od razu poprawną konfigurację. Etap jest niezależny od instalatora.
- **Etap 2: instalator** (S1–S11) razem z testem w CI i dokumentacją obu ścieżek. Instalator buduje na pliku z etapu 1, więc ten etap wymaga etapu 1.

## Założenia

- **Wylicz zamiast pytać:** gdy ustawiona jest tylko jedna z dwóch wartości domeny (`APP_DOMAIN` albo `APP_BASE_URL`), instalator wylicza drugą zamiast pytać. Właściciel podaje jedną wartość zamiast dwóch powiązanych.
- **Wybór trybu:** o trybie bez interakcji decyduje brak terminala, a nie osobna opcja. CI działa wtedy bez pytań bez dodatkowej konfiguracji.
- **Sprawdzenie zdrowia na serwerze:** instalator sprawdza zdrowie aplikacji na serwerze, nie przez domenę. Wynik nie zależy od DNS i certyfikatu, a test w CI działa bez domeny.
- **`VAPID_SUBJECT`:** instalator zostawia go pustym. Aplikacja używa wtedy `APP_BASE_URL`, co opisuje `.env.example`.
- **Uprawnienia `.env`:** instalator ogranicza je przy każdym uruchomieniu, bez zmiany treści pliku. Zmiana uprawnień nie wpływa na treść, a chroni sekrety.
- **Puste hasło przy istniejącej bazie:** instalator zatrzymuje się, zamiast generować hasło. To jedyna bezpieczna opcja, bo nowe hasło odcina dostęp do danych.
- **Przerwanie pytania:** Ctrl+C albo Ctrl+D kończy instalator bez zapisu bieżącej odpowiedzi. Wcześniejsze odpowiedzi zostają, a ponowne uruchomienie dokańcza instalację.

Odpowiedzi właściciela z wywiadu (14.10.2026):
- Specyfikacja trafia do osobnego pliku.
- Instalator działa w sklonowanym repozytorium.
- Wartości bierze z pytań i ze zmiennych środowiskowych.
- Ponowne uruchomienie służy jako aktualizacja, bez `git pull`.
- Przy brakujących wartościach instalator się zatrzymuje.
- Wariant jest zapamiętany po pierwszym wyborze, a ręczna zmiana wariantu jest stosowana przy ponownym uruchomieniu.
- Właściciel zmienia wartości ręcznie w `.env`.
- Błędne wartości zapisane w `.env` zatrzymują instalator przed startem.
- Sprawdzenie zdrowia ma limit 3 minut i podaje polecenie do logów.
- Domena jest sprawdzana tylko pod kątem formatu.
- Instalator pyta wyłącznie o klucz publiczny `age`.

## Sekcje techniczne

> Uzupełnia architekt po zatwierdzeniu specyfikacji: architektura, model danych, kontrakty API, plan implementacji.
