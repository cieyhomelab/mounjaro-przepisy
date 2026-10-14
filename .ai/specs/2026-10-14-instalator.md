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

Uzupełnione przez architekta. Decyzje z uzasadnieniem i alternatywami: [ADR 0003](../../docs/adr/0003-instalator-na-serwer.md). Stos aplikacji: [ADR 0001](../../docs/adr/0001-stos-technologiczny.md). Zasady pracy w repozytorium: [AGENTS.md](../../AGENTS.md), sekcja „Instalator”.

### Architektura

#### Komponenty

| Plik | Odpowiedzialność |
| --- | --- |
| `scripts/install.sh` | Punkt wejścia. Ustala katalog repozytorium z własnego położenia (`scripts/lib.sh`, `ROOT_DIR`), wybiera tryb, wykonuje K1–K9 po kolei i wypisuje statusy. Każdy krok to funkcja `step_k1` … `step_k9` zwracająca „zrobione”, „pominięty, już zrobione” albo kończąca instalator błędem. |
| `scripts/lib/env.sh` | Czyste funkcje basha dla `.env`, bez wywołań Dockera: odczyt pliku do tablicy asocjacyjnej (parser, nigdy `source`), wykrywanie duplikatów, reguły poprawności z sekcji „Zasady poprawności”, wyliczanie domeny, atomowy zapis jednej wartości. Ładowany przez `install.sh`; testowalny osobno. |
| `scripts/lib.sh` | Bez zmian w zachowaniu; `install.sh` korzysta z `ROOT_DIR`. |
| `compose.yml` | Bez zmian. Instalator uruchamia go w projekcie `mounjaro-przepisy`, z profilem `tls` w wariancie `caddy`. |
| `.env.example` | Szablon `.env` (etap 1 porządkuje, etap 2 dodaje `HTTPS_MODE`). |
| `tests/installer/` | Testy kryteriów: Vitest z atrapą `docker` (`*.test.ts`, `harness.ts`, `fake-docker/docker`) i scenariusze na prawdziwym stosie (`stack/*.sh`, `compose.installer-test.yml`), uruchamiane przez `scripts/test-unit.sh` i `scripts/test-installer.sh`. |

#### Przepływ

1. **Start.** `set -euo pipefail`, `umask 077`, `trap` na `EXIT` usuwa pliki tymczasowe, `trap` na `INT` kończy kodem 130, `trap` na `TERM` kodem 143. Tryb z pytaniami, gdy `[ -t 0 ]`; w przeciwnym razie tryb bez interakcji. Instalator nigdy nie włącza `set -x`.
2. **K1** sprawdza `command -v docker`, `docker info` (dostęp), `docker compose version --short` (≥ 2.24). Do tego miejsca żaden plik nie jest tworzony ani zmieniany.
3. **K2–K6** czytają `.env` na nowo przed każdym krokiem i zapisują każdą wartość osobno, od razu po jej ustaleniu (atomowa zamiana pliku), więc przerwanie w dowolnym miejscu zostawia poprawny plik z wartościami ustalonymi do tej chwili.
4. **K7** waliduje cały plik i zatrzymuje instalator przed jakimkolwiek wywołaniem Compose, które coś uruchamia.
5. **K8** uruchamia Compose wyłącznie przez funkcję `compose`, która czyści środowisko (patrz „Kontrakt uruchamiania Compose”).
6. **K9** odpytuje zdrowie aplikacji wewnątrz kontenera `app` i wypisuje przypomnienie.

#### Tryby

| | Z pytaniami (`[ -t 0 ]`) | Bez interakcji |
| --- | --- | --- |
| Brakująca wartość | zmienna środowiskowa, potem pytanie | zmienna środowiskowa, potem błąd |
| Błędna wartość ze zmiennej środowiskowej | komunikat z nazwą zmiennej i pytanie | błąd z nazwą zmiennej |
| Błędna odpowiedź | komunikat i ponowne pytanie, bez zapisu | — |
| K5 | pyta po kolei, zapisuje każdą poprawną odpowiedź od razu | zapisuje od razu każdą poprawną wartość ze zmiennych, a nazwy wszystkich brakujących i błędnych wypisuje razem i kończy błędem |

Pierwszeństwo źródeł dla każdego klucza z K3–K6: niepusta wartość w `.env` → zmienna środowiskowa o tej samej nazwie → wartość wyliczona (domena, K4, K6) albo pytanie. Wartość z `.env` nigdy nie jest walidowana w K3–K6 ani zastępowana; jej błąd zgłasza dopiero K7.

### Model danych

Instalator nie dotyka bazy. Jedyny stan to `.env` w katalogu repozytorium (uprawnienia `600`) oraz wolumen `<projekt>_db-data`, który instalator tylko sprawdza.

#### Klucze uzupełniane przez instalator

| Klucz | Krok | Źródło, gdy pusty | Sekret | Reguła (K5 dla wpisywanych, K7 dla całego pliku) |
| --- | --- | --- | --- | --- |
| `HTTPS_MODE` | K3 | `.env` → zmienna → pytanie | nie | `caddy` albo `proxy` |
| `POSTGRES_PASSWORD` | K4 | `.env` → zmienna → generowany (64 znaki szesnastkowe z 32 bajtów `/dev/urandom`) | tak | niepusty |
| `APP_DOMAIN` | K5 | `.env` → zmienna → wyliczony z `APP_BASE_URL` → pytanie o domenę | nie | nazwa hosta: etykiety `[A-Za-z0-9-]` (1–63 znaki, bez `-` na początku i końcu), co najmniej dwie, oddzielone kropkami; wymagany w wariancie `caddy` |
| `APP_BASE_URL` | K5 | `.env` → zmienna → `https://<APP_DOMAIN>` | nie | `https://<host>` bez ścieżki i ukośnika; `:<port>` (1–65535) tylko w wariancie `proxy`; w wariancie `caddy` host równy `APP_DOMAIN` |
| `ALLOWED_EMAIL` | K5 | `.env` → zmienna → pytanie | nie (dane osobowe) | `lokalna@domena.tld`: dokładnie jedno `@`, domena z kropką |
| `GOOGLE_CLIENT_ID` | K5 | `.env` → zmienna → pytanie | nie | niepusty |
| `GOOGLE_CLIENT_SECRET` | K5 | `.env` → zmienna → pytanie bez echa | tak | niepusty |
| `BACKUP_AGE_RECIPIENT` | K5 | `.env` → zmienna → pytanie | nie | zaczyna się od `age1` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | K6 | `.env` → para ze zmiennych (obie naraz) → generowana para | prywatny tak | niepuste |

Dodatkowe reguły K7 dla kluczy, których instalator nie uzupełnia: `PUSH_MODE` pusty albo `web-push`; `AUTH_MODE` pusty albo `google`; żaden klucz nie występuje dwa razy. Komunikat K7 przy `PUSH_MODE` i `AUTH_MODE` podaje dozwoloną wartość; przy pozostałych podaje regułę, nigdy wartość.

Wszystkie wartości wpisywane przez instalator (z pytań i ze zmiennych) muszą składać się ze znaków `A–Z a–z 0–9 . _ @ + : / = -`. Inna wartość jest błędna („niedozwolone znaki”), bo zapis bez cudzysłowów musi być jednoznaczny dla Compose. Wartości ręcznie wpisane w `.env` mogą mieć cudzysłowy; parser zdejmuje parę otaczających `'…'` albo `"…"` przed sprawdzeniem.

#### Format `.env` i zapis

- Parser rozpoznaje: puste linie, komentarze (`#` po opcjonalnych spacjach), `KLUCZ=wartość` z opcjonalnym `export ` na początku. Inne linie zostawia bez zmian i ich nie interpretuje.
- Klucz pusty: występuje z pustą wartością albo nie występuje. Klucz zdublowany: instalator go nie uzupełnia, K7 go zgłasza.
- Uzupełnienie: gdy klucz występuje z pustą wartością, zmieniana jest tylko ta linia (`KLUCZ=` → `KLUCZ=wartość`); gdy nie występuje, linia jest dopisywana na końcu pliku (z dopisaniem brakującego znaku nowej linii przed nią). Reszta pliku, kolejność i komentarze zostają bajt w bajt.
- Zapis: nowa treść do pliku z `mktemp "$ROOT_DIR/.env.XXXXXX"` (wzorzec pasuje do `.gitignore` `.env.*`), `chmod 600`, `mv -f` na `.env`. Plik tymczasowy usuwa `trap`.
- K2: gdy `.env` nie ma, kopiuje `.env.example` tą samą metodą. Gdy jest, a ma uprawnienia szersze niż `600` (`stat -c %a`), robi `chmod 600` i zgłasza „pominięty, już zrobione”.

#### Wykrycie istniejącej bazy (K4)

Gdy `POSTGRES_PASSWORD` jest pusty w `.env` i w zmiennej środowiskowej, K4 wywołuje `docker volume inspect <projekt>_db-data`. Wolumen istnieje → błąd „Baza danych tej instalacji już istnieje i ma hasło, którego nie ma w .env. Wpisz dotychczasowe hasło do POSTGRES_PASSWORD w .env (albo podaj je w zmiennej POSTGRES_PASSWORD) i uruchom instalator ponownie.” Nic nie jest generowane ani zapisywane, Compose nie jest uruchamiany.

#### K6: niekompletna para

Gdy w `.env` dokładnie jeden z kluczy VAPID jest niepusty, K6 kończy się błędem z nazwą pustego klucza („uzupełnij ręcznie albo wyczyść oba”), bo nowa para nadpisałaby ustawioną wartość. To samo dla pary ze zmiennych środowiskowych, gdy podana jest tylko jedna.

### Kontrakty

#### Wywołanie

```
scripts/install.sh
```

Bez argumentów (argument powoduje błąd z opisem użycia). Działa z dowolnego katalogu bieżącego.

| Kod wyjścia | Znaczenie |
| --- | --- |
| `0` | K9 potwierdził `ok` |
| `1` | błąd w dowolnym kroku, także Ctrl+D przy pytaniu |
| `130` | Ctrl+C (`SIGINT`) |
| `143` | `SIGTERM` |

#### Wyjście

Każdy krok wypisuje jedną linię statusu na standardowe wyjście, dokładnie w formacie:

```
K<n> <nazwa kroku>: zrobione
K<n> <nazwa kroku>: pominięty, już zrobione
K<n> <nazwa kroku>: błąd
```

Nazwy kroków: `Wymagania`, `Plik .env`, `Wariant HTTPS`, `Hasło bazy`, `Wartości od właściciela`, `Klucze push`, `Kontrola .env`, `Start`, `Sprawdzenie`. Po linii „błąd” następują wiersze `  - <NAZWA_ZMIENNEJ>: <co jest nie tak>` albo `  - <opis>` i ewentualnie polecenie do wykonania. Komunikaty błędów idą na standardowe wyjście błędów. Wszystkie teksty po polsku. Kroki K1, K7, K8 i K9 nigdy nie zgłaszają „pominięty”; K8 i K9 po sukcesie zgłaszają „zrobione”, K1 i K7 też.

Komunikaty K1 (każdy z wykrytą wartością tam, gdzie ją znamy):

- brak `docker`: „Brakuje Dockera (polecenie docker nie istnieje). Zainstaluj Docker Engine z wtyczką Compose.”
- `docker info` kończy się błędem z `permission denied`: „Brak dostępu do Dockera dla użytkownika <użytkownik>. Dodaj go do grupy docker i zaloguj się ponownie.”; inny błąd `docker info`: „Docker nie odpowiada. Sprawdź, czy usługa docker działa.”
- Compose: „Wymagany Docker Compose w wersji co najmniej 2.24, wykryto: <wersja albo „brak”>.” Wersja z `docker compose version --short`, z obciętym prefiksem `v` i sufiksem po `-`; porównanie liczbowe major.minor.

#### Pytania (tryb z pytaniami)

Teksty pytań są stałe; testy na nie czekają.

| Klucz | Tekst przed pytaniem | Pytanie |
| --- | --- | --- |
| `HTTPS_MODE` | „caddy – wbudowana usługa caddy wystawia aplikację po HTTPS i sama odnawia certyfikat (porty 80 i 443). proxy – serwer ma własne reverse proxy, aplikacja nasłuchuje na 127.0.0.1:<APP_PORT>.” | `Wariant HTTPS [caddy/proxy]: ` |
| domena | — | `Domena aplikacji (np. przepisy.example.pl): ` |
| `ALLOWED_EMAIL` | — | `Adres Google, który może się logować: ` |
| `GOOGLE_CLIENT_ID` | „Dane klienta OAuth z Google Cloud Console (docs/operations.md, „Klient OAuth w Google”).” | `Google Client ID: ` |
| `GOOGLE_CLIENT_SECRET` | — | `Google Client secret (nie będzie widoczny): ` (`read -rs`) |
| `BACKUP_AGE_RECIPIENT` | „Na własnym komputerze wygeneruj parę kluczy: age-keygen -o klucz-kopii.txt. Klucz prywatny zostaje u Ciebie, poza serwerem. Wklej klucz publiczny (age1…).” | `Klucz publiczny age: ` |

Błędna odpowiedź: wiersz `  ! <NAZWA_ZMIENNEJ>: <co jest nie tak>` i to samo pytanie ponownie. Pusta odpowiedź jest błędna („wartość jest wymagana”). Koniec wejścia (Ctrl+D, `read` zwraca kod różny od zera): „Przerwano wpisywanie, <NAZWA_ZMIENNEJ> nie została zapisana.” i kod 1.

#### Zmienne środowiskowe instalatora

| Zmienna | Znaczenie |
| --- | --- |
| `HTTPS_MODE`, `APP_DOMAIN`, `APP_BASE_URL`, `ALLOWED_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BACKUP_AGE_RECIPIENT`, `POSTGRES_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Wartość dla pustego klucza `.env` o tej samej nazwie |
| `MP_INSTALL_PROJECT` | Tylko testy. Nazwa projektu Compose, domyślnie `mounjaro-przepisy` |
| `MP_INSTALL_COMPOSE_OVERRIDE` | Tylko testy. Ścieżka dodatkowego pliku Compose (`-f`) |
| `MP_INSTALL_HEALTH_TIMEOUT` | Tylko testy. Limit K9 w sekundach, domyślnie `180` |

#### Kontrakt uruchamiania Compose

Jedna funkcja `compose` w `install.sh`:

```bash
env -i PATH="$PATH" HOME="$HOME" … ${DOCKER_HOST:+DOCKER_HOST="$DOCKER_HOST"} … \
  docker compose -p "$PROJECT" --project-directory "$ROOT_DIR" --env-file "$ROOT_DIR/.env" \
  -f "$ROOT_DIR/compose.yml" ${MP_INSTALL_COMPOSE_OVERRIDE:+-f "$MP_INSTALL_COMPOSE_OVERRIDE"} "$@"
```

Przepuszczane zmienne (tylko gdy ustawione): `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `XDG_RUNTIME_DIR`, `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`, `DOCKER_CERT_PATH`, `DOCKER_TLS_VERIFY`, `DOCKER_BUILDKIT`. Żadne inne wywołanie `docker compose` w instalatorze nie istnieje.

K8:

| Wariant | Polecenia |
| --- | --- |
| `caddy` | `compose --profile tls up -d --build --remove-orphans` |
| `proxy` | `compose --profile tls rm -sf caddy`, potem `compose up -d --build --remove-orphans` |

Wyjście Compose jest przepuszczane na ekran i równocześnie zapisywane do pliku tymczasowego. Gdy `up` kończy się błędem, a zapis zawiera `port is already allocated` albo `address already in use`, K8 wypisuje „Port APP_PORT (<numer>) jest zajęty przez inny program. Zmień APP_PORT w .env albo zwolnij port.” (w wariancie `caddy` dodatkowo „albo porty 80/443”). Każdy inny błąd: „Uruchomienie nie powiodło się. Usuń przyczynę i uruchom instalator ponownie.”

#### K9: sprawdzenie zdrowia

Co 2 sekundy, do upływu `MP_INSTALL_HEALTH_TIMEOUT` (domyślnie 180 s, licznik `SECONDS` od startu K9):

```bash
compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(b=>process.exit(b.status==='ok'?0:1)).catch(()=>process.exit(1))"
```

Wyjście tego polecenia jest wyciszane. Sukces: „K9 Sprawdzenie: zrobione” i przypomnienie. Przekroczenie limitu: „K9 Sprawdzenie: błąd”, „Aplikacja nie odpowiada po 3 minutach.” i „Logi aplikacji: docker compose --project-directory <katalog> -p <projekt> logs --tail 100 app”. Instalator nie wypisuje logów sam.

Przypomnienie (po sukcesie) wymienia, w tej kolejności: adres powrotu OAuth `<APP_BASE_URL>/api/auth/google/callback` do wpisania w Google Cloud Console; zaszyfrowany dysk serwera; klucz prywatny `age` trzymany poza serwerem; w wariancie `caddy` rekord DNS domeny i otwarte porty 80 i 443; listę kontrolną odbioru w `docs/operations.md`.

#### Generowanie kluczy VAPID (K6)

```bash
docker run --rm --network none node:24-bookworm-slim node -e "<skrypt>"
```

Skrypt tworzy parę `crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })`, eksportuje JWK i wypisuje dwie linie: klucz publiczny jako base64url z bajtu `0x04`, `x` i `y` (65 bajtów) oraz klucz prywatny `d` (32 bajty, base64url). Instalator czyta je do zmiennych, sprawdza długość (87 i 43 znaki) i zapisuje bez wypisywania. Obraz zgadza się z `ARG NODE_IMAGE` w `Dockerfile`.

### Integracje

Brak integracji zewnętrznych i nowych sekretów. Instalator korzysta z Dockera i Compose na serwerze oraz z obrazu `node:24-bookworm-slim` (ten sam, z którego budowana jest aplikacja). W testach Docker zastępuje atrapa `tests/installer/fake-docker/docker`, sterowana plikiem stanu, a scenariusze na prawdziwym stosie działają w projektach `inst-*` z nakładką `tests/installer/compose.installer-test.yml` (bez portów hosta, `caddy` z lokalnym urzędem certyfikacji zamiast ACME, bez usługi `backup`). Konfiguracja klienta OAuth w Google zostaje ręczna.

### Plan implementacji

Wspólne dla wszystkich kroków:

- Testy kryteriów tej specyfikacji to Vitest w `tests/installer/*.test.ts` (atrapa `docker`, uruchamiane przez `scripts/test-unit.sh`) i scenariusze `tests/installer/stack/*.sh` (prawdziwy stos, `scripts/test-installer.sh`). Playwright nie bierze w nich udziału. Każdy test ma w nazwie identyfikator scenariusza (`S6: …`).
- Na prawdziwym stosie sprawdzamy tylko: dane w bazie po ponownym uruchomieniu i przy wyczyszczonym haśle (S3), pierwszeństwo `.env` w działającej aplikacji (S2, S3), uruchomienie i zatrzymanie `caddy` oraz wiązanie portu `127.0.0.1` (S1, S9), instalację ręczną z danymi (S10) i dwa uruchomienia bez interakcji z sumą kontrolną `.env` (wymaganie CI). Wszystko inne na atrapie.
- Limit 3 minut sprawdza test z `MP_INSTALL_HEALTH_TIMEOUT=3` i osobny test, że bez tej zmiennej komunikat i limit wynoszą 180 s.
- Każdy test sprawdza, że pełne wyjście nie zawiera wartości sekretów, które dostał instalator.

#### Etap 1: uporządkowany `.env.example` (S12)

Zależy od: nic.

1. Usunąć z `.env.example` blok „Powiadomienia push (od etapu 4.2)” z drugą kopią `VAPID_*` i `PUSH_MODE=webpush`. Zostaje blok z sekcji „Przypomnienie o zastrzyku” z `PUSH_MODE=web-push`.
2. Test jednostkowy `src/server/envExample.test.ts` (projekt `unit-node`; `.env.example` jest w obrazie `dev`): żaden klucz nie występuje dwa razy; `PUSH_MODE` to `web-push`; `loadConfig` dla wartości z `.env.example` uzupełnionych o wymagane (`APP_ENV=production`, `DATABASE_URL`, `ALLOWED_EMAIL`, `APP_BASE_URL`, `GOOGLE_CLIENT_*`) nie rzuca błędu.

#### Etap 2.1: szkielet instalatora, `.env` i kontrole (K1, K2, K7; S5, S7, część S4)

Zależy od: etap 1.

1. `scripts/lib/env.sh`: parser, wykrywanie duplikatów, reguły poprawności z tabeli „Klucze uzupełniane przez instalator”, atomowy zapis jednej wartości, wyliczanie `APP_DOMAIN` ↔ `APP_BASE_URL`.
2. `scripts/install.sh`: start (tryb, `trap`, `umask`), funkcja `compose`, wypisywanie statusów, K1, K2, K7. Kroki K3–K6 i K8–K9 jeszcze nie istnieją; bez nich instalator kończy się po K7 kodem 1 z komunikatem „Instalator nie jest jeszcze kompletny” (usuwany w 2.3).
3. `.env.example`: klucz `HTTPS_MODE=` z opisem w sekcji „Podstawy” (`caddy` | `proxy`, ustawia instalator) i zakomentowany opis `MP_INSTALL_*` w sekcji „Testy”.
4. Atrapa `docker`: brak polecenia (osobny `PATH` bez atrapy), brak dostępu, wersja Compose.
5. Testy: S5 (trzy kryteria, `.env` nie powstaje), K2 (tworzy z uprawnieniami `600`, zawęża szersze bez zmiany treści), S7 (cztery kryteria, `.env` bez zmian po K7), duplikaty, cudzysłowy w ręcznym `.env`, uruchomienie spoza katalogu repozytorium.

#### Etap 2.2: wartości (K3–K6; S1 bez startu, S2, S4, S6, S10 bez startu)

Zależy od: etap 2.1.

1. K3 i K5 w obu trybach, z tekstami pytań z „Kontraktów”, ukrytym wpisywaniem sekretu i ponownym pytaniem po błędnej odpowiedzi; zbiorczy błąd w trybie bez interakcji.
2. K4 z wykryciem wolumenu, K6 z generowaniem pary w kontenerze i obsługą niekompletnej pary.
3. Atrapa `docker`: istniejący wolumen, wynik `docker run` dla kluczy VAPID.
4. Testy: S1 (wartości w `.env`, Ctrl+C i Ctrl+D bez zapisu, brak sekretów w wyjściu), S2 (bez pytań, pierwszeństwo `.env` przed zmienną, pytania tylko o brakujące), S3 (K2–K6 pominięte, suma kontrolna, brak pytań w terminalu, wyczyszczone albo usunięte `.env` przy istniejącym wolumenie; K3 poprzedza K4, więc test bez terminala podaje `HTTPS_MODE` w zmiennej, a test w terminalu odpowiada na pytanie o wariant), S4 (hasło zostaje, pytania tylko o puste, brak urwanych linii po przerwaniu w każdym pytaniu), S6 (pięć kryteriów), S10 (pytanie tylko o wariant, wyliczenie `APP_DOMAIN`, dopisanie brakujących `VAPID_*` z resztą pliku bez zmian).

#### Etap 2.3: start i sprawdzenie (K8, K9; S8, S9, scenariusze na prawdziwym stosie)

Zależy od: etap 2.2.

1. K8 w obu wariantach z czyszczeniem środowiska i rozpoznaniem zajętego portu; K9 z limitem, poleceniem do logów i przypomnieniem. Usunąć tymczasowe zakończenie z 2.1.
2. Atrapa `docker`: błąd budowania, zajęty port, wynik sprawdzenia zdrowia; dziennik wywołań pozwala sprawdzić, że Compose nie dostaje zmiennych spoza listy.
3. Testy na atrapie: S8 (trzy kryteria), S9 (polecenia dla obu kierunków, K3 pominięty, `.env` bez zmian), S4 (błąd budowania, potem start), zajęty `APP_PORT`, zmienne środowiskowe nie trafiają do Compose, przypomnienie z adresem powrotu OAuth i krokami zależnymi od wariantu.
4. Scenariusze `tests/installer/stack/`: `10-noninteractive` (instalacja `caddy` bez interakcji, `caddy` działa, `.env` `600`; drugie uruchomienie: K2–K6 pominięte i ta sama suma kontrolna; zmienne `ALLOWED_EMAIL` i `POSTGRES_PASSWORD` inne niż w `.env`: aplikacja ma wartości z `.env` (`docker inspect`) i zdrowie `ok`; wiersz w bazie przetrwa ponowne uruchomienie; ręczna zmiana `ALLOWED_EMAIL` trafia do aplikacji; wyczyszczone hasło: błąd, kontener aplikacji ten sam, wiersz w bazie jest), `20-variant` (`proxy`: brak `caddy`, port tylko na `127.0.0.1`; zmiana na `caddy` i z powrotem), `30-manual` (instalacja ręczna przez `stack_compose` z danymi, potem instalator z `HTTPS_MODE`: wartości bez zmian, dane są, `VAPID_*` dopisane). `00-harness` zostaje.

#### Etap 2.4: dokumentacja dwóch ścieżek (S11)

Zależy od: etap 2.1 (kontrakt instalatora z tej sekcji jest stały, więc dokumentacja nie czeka na 2.2 i 2.3).

1. `README.md` („Wdrożenie”): polecenie `scripts/install.sh` jako zalecana ścieżka i odnośnik do ręcznej.
2. `docs/operations.md`: „Pierwsze uruchomienie” z instalatorem, listą zmiennych trybu bez interakcji (`HTTPS_MODE=caddy|proxy`), bezpiecznym podaniem sekretów (np. `read -rs GOOGLE_CLIENT_SECRET; export GOOGLE_CLIENT_SECRET` albo plik z uprawnieniami `600` wczytany przez `set -a; . plik; set +a` przed uruchomieniem, nigdy wartość w linii polecenia), zmianą wariantu (S9) i dotychczasową listą ręczną jako alternatywą; „Aktualizacja” z `git pull` i ponownym uruchomieniem instalatora; „Diagnostyka” z poleceniem logów z K9.
3. Test: scenariusz `tests/installer/stack/90-docs.sh` (bez Dockera; `README.md` i `docs/` nie trafiają do obrazu `dev`) sprawdza obecność polecenia, `HTTPS_MODE`, obu wartości, odnośnika do ścieżki ręcznej i opisu aktualizacji.
