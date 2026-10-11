# ADR 0002: Wygląd, motyw i zaplecze testów etapu 5

- **Status:** przyjęty
- **Data:** 2026-10-11
- **Specyfikacja:** [.ai/specs/2026-10-08-mounjaro-przepisy.md](../../.ai/specs/2026-10-08-mounjaro-przepisy.md), etap 5 (S26–S29, „Projekt wizualny”)
- **Uzupełnia:** [ADR 0001](0001-stos-technologiczny.md). Stos się nie zmienia.

## Kontekst

Etap 5 nadaje aplikacji wygląd „Mąka i jagody”: 22 nazwane kolory w dwóch trybach, dwa fonty dostarczane z aplikacją, osobną paletę ekranów zdrowia i nową nawigację. API, dane konta i logika domenowa zostają bez zmian. O rozwiązaniach decydują te wymagania:

- **Tryb jasny i ciemny (S26):** motyw „System / Jasny / Ciemny” zapamiętany tylko na urządzeniu, działa offline, zostaje po wylogowaniu i usunięciu konta, obowiązuje także na ekranie logowania. Testy sprawdzają atrybut `data-theme` elementu `<html>` i obliczone kolory.
- **Brak żądań do domen zewnętrznych (S29):** fonty, ikony i style pochodzą z aplikacji i działają offline.
- **Kontrast i pola dotyku na każdym ekranie (S29):** reguła `color-contrast` narzędzia axe w obu trybach, pola dotyku 44 × 44 px w szerokości 390 px i 1280 px.
- **Dwie palety (S29):** kolory `health*` wyłącznie na ekranach zdrowia, a tło `<body>` na tych ekranach to `health-bg`.
- **Zrzuty w PR (etapy dostarczenia):** opis każdego PR etapu 5 zawiera zrzuty zmienionych ekranów przed i po, w szerokości 390 px w obu trybach i w szerokości 1280 px. Zespół nie ma makiet, więc zrzuty są jedyną drogą, którą właściciel ocenia wygląd.
- **Stan wyjściowy:** klient używa Tailwind CSS 4 z domyślną paletą wpisaną w klasy komponentów (`bg-red-50`, `border-neutral-200`), `styles.css` zawiera tylko import Tailwinda, a CSP ma `script-src 'self'`, więc skrypt wpisany w `index.html` nie zadziała.

## Decyzja

| Obszar | Wybór |
| --- | --- |
| Kolory i wymiary | Tokeny jako zmienne CSS w `src/client/styles.css`, wystawione Tailwindowi 4 jako klasy semantyczne (`bg-surface`, `text-ink`, `rounded-md`) |
| Tryb ciemny | Te same klasy w obu trybach; zmienia się wartość zmiennych pod `html[data-theme='dark']`. Bez wariantów `dark:` w komponentach |
| Wybór motywu | `localStorage`, klucz `mp-theme` (`light` \| `dark`; brak klucza oznacza „System”) |
| Motyw przed pierwszym malowaniem | Mały skrypt klasyczny `theme-init.js` w `src/client/public/`, wczytywany w `<head>` |
| Paleta ekranów zdrowia | Atrybut `data-area="health"` na `<html>`, ustawiany przez powłokę aplikacji na podstawie adresu ekranu |
| Fonty | Pakiety Fontsource: `@fontsource-variable/bricolage-grotesque` i `@fontsource/atkinson-hyperlegible`, podzbiory `latin` i `latin-ext`; pliki `woff2` buduje Vite i trzyma service worker |
| Ikony | `lucide-react` (komponenty SVG w paczce klienta) |
| Nawigacja | Jedna powłoka z dolnym paskiem i bocznym menu; o tym, które widać, decyduje CSS od 768 px |
| CSP | Jawne `font-src 'self'` i `style-src 'self' 'unsafe-inline'`, bez źródeł `https:` |
| Test kontrastu | `@axe-core/playwright`, reguła `color-contrast` |
| Ekrany w testach przekrojowych | Katalog ekranów `tests/e2e/screens.ts` z danymi przykładowymi |
| Zrzuty ekranów | Pliki w `docs/screenshots/` w repozytorium, odświeżane skryptem `scripts/screenshots.sh` |

### Najważniejsze rozstrzygnięcia

1. **Tokeny semantyczne zamiast kolorów w komponentach.** Każdy kolor z tabeli specyfikacji to zmienna CSS o tej samej nazwie (`--bg`, `--surface`, `--ink`, `--health-bg`…), zdefiniowana raz dla trybu jasnego i raz dla ciemnego. Tailwind dostaje je przez `@theme`, więc komponent pisze `bg-surface text-ink`. Jedno miejsce z wartościami sprawia, że kryteria S26 i S29 o obliczonych kolorach są sprawdzalne, a tryb ciemny nie wymaga dotykania komponentów. Domyślna paleta Tailwinda i kolory szesnastkowe w komponentach są zabronione; pilnuje tego test jednostkowy przeszukujący `src/client`. Dwa kolory zastępcze niezależne od trybu (`#F2D3AC`, `#F2E3B3`) też są tokenami.
2. **Motyw to atrybut `data-theme` na `<html>`, zawsze ustawiony.** Wartość to wynik (`light` albo `dark`), nie wybór użytkownika: przy „System” wylicza się z `prefers-color-scheme`, a gdy przeglądarka go nie podaje, wynikiem jest `light` (S26). Zmienne trybu jasnego są przypisane do `:root`, ciemnego do `html[data-theme='dark']`. Nie stosujemy reguły `@media (prefers-color-scheme)` w CSS: przy wyborze „Jasny” na ciemnym systemie dałaby sprzeczne źródła prawdy.
3. **Wybór motywu w `localStorage`, poza IndexedDB.** IndexedDB, Cache Storage i kolejka są czyszczone przy wylogowaniu, odpowiedzi 401 i usunięciu konta, a motyw ma to przetrwać (S26). `localStorage` jest też czytany synchronicznie, czego wymaga punkt 4. Klucz `mp-theme` nie zawiera danych konta. Funkcja czyszcząca dane lokalne nie dotyka `localStorage`.
4. **Skrypt startowy w osobnym pliku.** Bez niego użytkownik z wyborem innym niż system widziałby przy każdym uruchomieniu błysk złego trybu, zanim załaduje się moduł aplikacji. Wpisanie skryptu w `index.html` blokuje CSP, a rozluźnianie `script-src` w aplikacji z danymi o zdrowiu odpada. Dlatego `theme-init.js` jest zwykłym plikiem z `public/`: czyta `mp-theme`, sprawdza `matchMedia` i ustawia `data-theme`. Ma kilka linii, trafia do pamięci service workera razem z powłoką i działa offline. Późniejsze zmiany (wybór w Ustawieniach, zmiana trybu systemu przy „System”) obsługuje moduł `src/client/data/theme.ts`; regułę „wybór + tryb systemu → wynik” oba pliki realizują tak samo, a testy E2E S26 sprawdzają obie ścieżki (pierwsze uruchomienie i zmianę bez przeładowania).
5. **Paleta zdrowia przez atrybut na `<html>`.** Powłoka aplikacji ustawia `data-area="health"` dla ekranów zdrowia i usuwa atrybut dla pozostałych; CSS zmienia wtedy tło `<body>` na `health-bg`. Przypisanie adresu do części (kulinarna albo zdrowie) i do pozycji nawigacji to jedna czysta funkcja z testem jednostkowym, bo korzystają z niej nawigacja (S27), paleta (S29) i testy. Ustawienia ze wszystkimi podekranami, także przypomnieniem i celami, należą do części kulinarnej.
6. **Fonty z pakietów npm, nie z plików wrzuconych ręcznie.** Fontsource to najpopularniejszy sposób dostarczania fontów z aplikacją: wersja jest w `package-lock.json`, licencja (SIL OFL) w pakiecie, a Vite sam dodaje pliki do builda z nazwą zawierającą skrót treści. Importujemy tylko podzbiory `latin` i `latin-ext` (polskie znaki) i tylko grubości ze specyfikacji. Wzorzec plików service workera dostaje rozszerzenie `woff2`, więc fonty są w pamięci powłoki od pierwszej wizyty (kryterium S29 o fontach offline).
7. **Ikony jako komponenty React.** `lucide-react` jest powszechnie znany, do paczki trafiają tylko użyte ikony, a ikona jest zwykłym SVG dziedziczącym kolor tekstu, więc działa z tokenami i trybem ciemnym. Ikona bez podpisu dostaje nazwę przez `aria-label` przycisku, sama jest ukryta przed czytnikiem ekranu.
8. **Oba układy nawigacji w jednym drzewie, przełączane przez CSS.** Dolny pasek i boczne menu renderują się zawsze; poniżej 768 px boczne menu ma `display: none`, od 768 px dolny pasek. Element z `display: none` nie istnieje dla czytnika ekranu ani dla asercji widoczności Playwrighta, więc kryteria S27 są spełnione bez nasłuchiwania szerokości okna w JavaScripcie. Tryb gotowania pozostaje poza powłoką, jak dotąd.
9. **CSP bez `https:`.** Domyślne dyrektywy `@fastify/helmet` dopuszczają fonty i style z dowolnego adresu `https:`. Wymaganie „brak żądań do domen zewnętrznych” ma być wymuszone przez przeglądarkę, a nie tylko przez test, więc ustawiamy `font-src 'self'` i `style-src 'self' 'unsafe-inline'` (`'unsafe-inline'` zostaje ze względu na atrybuty `style` ustawiane przez React, np. w liście wirtualnej). Test integracyjny sprawdza nagłówek.
10. **Katalog ekranów jako wspólne źródło dla testów przekrojowych i zrzutów.** `tests/e2e/screens.ts` zawiera listę wszystkich ekranów z funkcją otwierającą każdy z nich na stałych danych przykładowych i stałym czasie. Korzystają z niego: test „każdy ekran się otwiera” (w każdym przebiegu E2E), testy S29 (pola dotyku, kontrast, przewijanie poziome, żądania zewnętrzne, kolory części zdrowia) oraz zrzuty. Nowy ekran dopisuje się do katalogu w tym samym PR, w którym powstaje.
11. **Zrzuty w repozytorium, pokazywane przez różnicę w PR.** `scripts/screenshots.sh` zapisuje `docs/screenshots/<wariant>/<ekran>.png` w trzech wariantach: `mobile-light` i `mobile-dark` (390 × 844) oraz `desktop-light` (1280 × 800). Stan z gałęzi `main` jest zrzutem „przed”, stan z gałęzi PR zrzutem „po”; GitHub pokazuje oba obok siebie w zakładce zmian, a opis PR wstawia je przez adresy z identyfikatorem commita. Dane i czas są stałe, więc ekran bez zmian daje identyczny plik i nie pojawia się w różnicy. Zrzuty bazowe sprzed etapu 5 dodaje ten sam PR co ten ADR.
12. **Szerokości i tryb ustawia test, nie nowy projekt Playwrighta.** Kryteria podają konkretne wymiary (360, 390, 1280 px; 390 × 844). Test ustawia je przez `page.setViewportSize`, a tryb przez `page.emulateMedia({ colorScheme })`. Dodanie projektów „390 jasny”, „390 ciemny” i „1280” pomnożyłoby cały zestaw (dziś około 17 minut w CI) przez liczbę wariantów. Testy przekrojowe S29 po katalogu ekranów działają tylko w `mobile-chromium`: sprawdzają obliczone style i wymiary, które nie zależą od silnika, a obejmują kilkadziesiąt ekranów w kilku wariantach. Scenariusze zachowania (S26, S27, S28 i zmienione kryteria) działają na wszystkich trzech projektach.

## Rozważone alternatywy

- **Warianty `dark:` Tailwinda przy każdej klasie.** Każdy komponent miałby dwie listy kolorów, a pominięcie jednej klasy dawałoby błąd kontrastu tylko w jednym trybie. Tokeny przenoszą tę różnicę w jedno miejsce.
- **CSS Modules, CSS-in-JS albo biblioteka komponentów (shadcn/ui, Radix Themes, MUI).** Zmiana sposobu stylowania w działającej aplikacji z kilkudziesięcioma ekranami to przepisanie wszystkiego bez korzyści dla specyfikacji. Biblioteka komponentów narzuca własny wygląd, a projekt „Mąka i jagody” opisuje własny.
- **Motyw w IndexedDB albo w ustawieniach konta.** IndexedDB jest czyszczone przy wylogowaniu i czytane asynchronicznie; ustawienia konta przenosiłyby motyw między urządzeniami, co specyfikacja wyklucza („Poza zakresem”).
- **Motyw ustawiany dopiero w module aplikacji albo wyłącznie przez `prefers-color-scheme` w CSS.** Pierwsze daje błysk złego trybu, drugie nie obsługuje wyboru „Jasny” i „Ciemny”.
- **Skrypt wpisany w `index.html` ze skrótem albo `nonce` w CSP.** Skrót trzeba by przeliczać przy każdej zmianie skryptu, a `nonce` wymaga generowania `index.html` na serwerze, który dziś podaje go jako plik statyczny, także z pamięci service workera.
- **Pliki `woff2` wrzucone do repozytorium.** Działa, ale aktualizacja, podzbiory i licencja byłyby utrzymywane ręcznie. **Google Fonts albo inny CDN** odpada z powodu wymagania o braku żądań zewnętrznych.
- **Fonty systemowe.** Sprzeczne z wymaganiem właściciela.
- **Ikony pisane ręcznie jako SVG albo font z ikonami.** Ręczne SVG to więcej pracy i niespójny wygląd; font z ikonami to dodatkowy plik, gorsza dostępność i brak wycinania nieużywanych ikon.
- **Osobny układ strony dla telefonu i komputera wybierany w JavaScripcie.** Wymaga nasłuchiwania szerokości okna i daje stan pośredni przy pierwszym renderze.
- **Asercje wizualne (`toHaveScreenshot`) zamiast zrzutów do oglądania.** Porównanie pikseli blokowałoby PR przy każdej zamierzonej zmianie i wymagało osobnych wzorców dla trzech silników. Zrzuty służą tu właścicielowi do oceny, a poprawność pilnują kryteria S26–S29.
- **Zrzuty jako artefakt CI albo na zewnętrznym hostingu.** Artefakt to archiwum do pobrania, którego nie widać w opisie PR; zewnętrzny hosting to kolejny dostawca i ryzyko wygasłych adresów.
- **Dodatkowe projekty Playwrighta dla szerokości i trybów.** Patrz rozstrzygnięcie 12.

## Konsekwencje

**Pozytywne**

- Tryb ciemny i paleta zdrowia nie wymagają żadnej logiki w komponentach; nowy ekran pisany tokenami działa w obu trybach od razu.
- Kryteria o kolorach, kontraście, polach dotyku i żądaniach zewnętrznych są sprawdzane na wszystkich ekranach jedną pętlą po katalogu.
- Właściciel widzi zmianę wyglądu w PR bez uruchamiania aplikacji.
- Brak nowych usług, zmiennych środowiskowych, migracji i zmian kontraktów API.

**Negatywne i ryzyka**

- Trzy nowe zależności klienta (dwa pakiety fontów, `lucide-react`) i jedna testowa (`@axe-core/playwright`). Dodaje je inżynier w pierwszym kroku wycinka 5.1 przez `scripts/npm.sh install`.
- Reguła „wybór + tryb systemu → wynik” istnieje w dwóch plikach (`theme-init.js` i `data/theme.ts`). Jest jednolinijkowa, a rozjazd wykryją testy S26.
- Zrzuty powiększają repozytorium: około 80 plików PNG, a wycinek 5.1 wymieni wszystkie. Szacunkowo kilkanaście megabajtów w historii po całym etapie 5. Poza etapem 5 zrzuty odświeża tylko PR, który zmienia wygląd ekranu.
- Zrzuty nie są asercją: PR może je pominąć albo zostawić nieaktualne. Pilnuje tego recenzent (reguła w `CODE_REVIEW.md`).
- Nowa nazwa pamięci powłoki service workera po dodaniu fontów wynika z istniejącego mechanizmu (skrót listy plików), więc stare urządzenia pobiorą nową powłokę przy najbliższym uruchomieniu z internetem.
- `document.fonts.check` w części przeglądarek zwraca prawdę także dla fontu, którego w ogóle nie zadeklarowano. Test kryterium S29 o fontach offline musi dodatkowo sprawdzić, że `document.fonts` zawiera załadowane kroje obu rodzin.
- Reguła `color-contrast` axe pomija tekst na tle, którego nie umie ustalić (obrazy, gradienty). Specyfikacja wymaga plakietki z własnym tłem pod każdym tekstem na zdjęciu, więc wyniki „do ręcznego sprawdzenia” (`incomplete`) tej reguły nie mogą zostać bez rozstrzygnięcia: test nie przechodzi, dopóki element nie dostanie jednoznacznego tła albo jawnego wyjątku z uzasadnieniem w katalogu ekranów.
