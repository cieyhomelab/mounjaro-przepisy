# Zgodność wsteczna

Aplikacja ma jednego użytkownika i jedno wdrożenie, a klient i serwer są wydawane razem z jednego obrazu. Mimo to kilka powierzchni przeżywa wdrożenie nowej wersji i trzeba je zmieniać ostrożnie. Recenzent sprawdza zmiany względem tej listy.

| Powierzchnia | Gdzie | Co jest zmianą łamiącą | Wymagana ścieżka |
| --- | --- | --- | --- |
| Schemat bazy danych | `src/server/db/schema.ts`, `drizzle/` | Usunięcie albo zmiana typu kolumny z danymi, edycja migracji obecnej na `main`, migracja niewykonalna na bazie z danymi | Nowa migracja, która zachowuje dane; przy usuwaniu kolumny najpierw wydanie, które przestaje jej używać. Opis w PR, jak migracja zachowa istniejące dane |
| Dane offline na urządzeniu | Schemat IndexedDB (Dexie) w `src/client/data/` | Zmiana struktury magazynów bez podbicia wersji schematu | Podbicie wersji schematu Dexie z funkcją aktualizacji albo wyczyszczeniem i ponownym pobraniem migawki; test E2E startu na starych danych |
| Service worker i zasoby w pamięci podręcznej | `src/client/sw.ts` | Zmiana nazw pamięci podręcznych lub strategii, po której stara wersja klienta zostaje na urządzeniu | Nowy service worker przejmuje kontrolę i usuwa stare pamięci; klient obsługuje odpowiedź serwera nowszego niż on sam (ponowne załadowanie) |
| Kontrakty API | `src/shared/contracts/`, trasy `/api` | Zmiana kształtu, której nie rozumie klient zapisany na urządzeniu offline | Klient z nieaktualną wersją wykrywa niezgodność po numerze wersji API w migawce i przeładowuje się; zmiana kontraktu i klienta w jednym PR |
| Format pliku eksportu | Trasa eksportu (S16) | Usunięcie pola albo zmiana jego nazwy lub znaczenia | Pole `formatVersion` w pliku; zmiana łamiąca podbija wersję i jest opisana w PR. Dodawanie pól jest dozwolone |
| Subskrypcje push | Tabela subskrypcji, klucze VAPID | Zmiana pary kluczy VAPID unieważnia wszystkie subskrypcje | Wymiana kluczy tylko świadomie; klient ponawia subskrypcję przy starcie, gdy klucz publiczny się zmienił |
| Zmienne środowiskowe | `src/server/config.ts`, `.env.example`, `compose.yml` | Zmiana nazwy, usunięcie albo nowa zmienna wymagana bez wartości domyślnej | Sekcja „Wymagane sekrety” w opisie PR; `.env.example` zaktualizowany w tym samym PR |
| Skrypty i kontrakt testów | `scripts/`, `.ai/agentic.config.json` | Zmiana nazwy skryptu, argumentów albo zachowania opisanego w kontrakcie E2E | Zmiana `AGENTS.md`, `SDLC.md`, `.ai/agentic.config.json` i CI w tym samym PR |
| Adresy ekranów | Trasy React Router | Zmiana ścieżki ekranu, do którego prowadzi powiadomienie albo zapisany skrót | Przekierowanie ze starej ścieżki |

Zmiana łamiąca bez wymaganej ścieżki to blocker w recenzji.
