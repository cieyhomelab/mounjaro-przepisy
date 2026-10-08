# Mounjaro Przepisy

## TLDR

Prywatna aplikacja webowa, instalowalna na telefonie jako PWA, w której jedna osoba na diecie wspieranej lekiem Mounjaro gromadzi sprawdzone przepisy z serwisów kulinarnych i własne. Aplikacja filtruje je pod potrzeby tej diety (dużo białka, małe i lekkostrawne porcje), prowadzi przez gotowanie także bez internetu, a w kolejnych etapach dodaje wyszukiwanie w zaufanych serwisach, planer tygodnia z listą zakupów oraz dziennik zdrowia. Aplikacja nie generuje przepisów i nie wylicza dawek leku.

## Problem i cel

Osoba przyjmująca Mounjaro je mało, często ma nudności i musi pilnować białka. Przepisy w internecie nie są opisane pod te potrzeby, a przepisom generowanym przez AI nie da się ufać co do smaku. Właściciel chce jednego miejsca ze sprawdzonymi przepisami (z prawdziwych źródeł, z ocenami ludzi), które szybko odpowiada na pytanie „co dziś ugotować, żeby było smaczne, białkowe i żebym to dobrze zniósł”.

**Miara sukcesu:** po miesiącu od uruchomienia etapu 1 użytkownik gotuje z aplikacji co najmniej 3 razy w tygodniu. Źródłem pomiaru jest historia tygodniowa ugotowań w aplikacji (S8).

## Słownik

- **Kolekcja:** wszystkie przepisy użytkownika.
- **Kolekcja własna:** nazwana grupa przepisów utworzona przez użytkownika (np. „Śniadania”).
- **Przepis z linku / przepis ręczny:** przepis odczytany z cudzej strony albo wpisany przez użytkownika.
- **Brak danych:** stan wartości odżywczej, której nie podało źródło, nie dało się wyliczyć i użytkownik jej nie wpisał.
- **Offline:** urządzenie bez połączenia z internetem.

## Użytkownicy i role

- **Użytkownik (jedyna rola):** jedna osoba wskazana przy instalacji aplikacji (właściciel albo bliska mu osoba). Ma dostęp do wszystkich funkcji i wszystkich danych. Konto nie jest współdzielone.
- Aplikacja obsługuje dokładnie jedno konto. Zalogować się może wyłącznie jeden adres Google ustawiony przy instalacji aplikacji.
- **Osoba niezalogowana** widzi tylko ekran logowania. Nie widzi żadnych przepisów ani danych.
- Nie ma rejestracji, ról administracyjnych, udostępniania ani widoków publicznych.

## Scenariusze

Kryteria dotyczące odczytu cudzych stron i wyszukiwania (S2, S3, S5, S17, S18) są weryfikowane na zestawie stron testowych opisanym w „Wymaganiach niefunkcjonalnych”, a nie na żywych serwisach.

### Etap 1: kolekcja przepisów (MVP)

#### S1: Logowanie kontem Google

1. Użytkownik otwiera aplikację i wybiera „Zaloguj przez Google”.
2. Po zalogowaniu dozwolonym kontem widzi swoją kolekcję.

**Kryteria akceptacji**
- Zakładając, że użytkownik nie jest zalogowany, gdy otwiera dowolny adres aplikacji, wtedy widzi ekran logowania i żadnych danych.
- Zakładając, że użytkownik loguje się dozwolonym adresem Google z ekranu głównego, gdy logowanie się powiedzie, wtedy widzi kolekcję.
- Zakładając, że niezalogowany użytkownik otworzył adres konkretnego ekranu (np. przepisu), gdy zaloguje się dozwolonym adresem, wtedy widzi ten ekran.
- Zakładając, że ktoś loguje się innym adresem Google, gdy logowanie w Google się powiedzie, wtedy aplikacja pokazuje komunikat „To konto nie ma dostępu” i nie pokazuje żadnych danych.
- Zakładając, że użytkownik jest zalogowany i ma internet, gdy wybiera „Wyloguj”, wtedy wraca na ekran logowania.
- Zakładając urządzenie, na którym aplikacja była otwierana z internetem w ciągu ostatnich 30 dni, gdy użytkownik ją otworzy, wtedy jest zalogowany bez ponownego logowania.
- Zakładając urządzenie, na którym aplikacja nie była otwierana z internetem przez ponad 30 dni (test przesuwa zegar), gdy użytkownik ją otworzy, wtedy widzi ekran logowania i żadnych danych.
- Zakładając, że użytkownik dodał przepis na telefonie, gdy loguje się tym samym kontem na komputerze, wtedy widzi ten przepis.

#### S2: Dodanie przepisu z linku

1. Użytkownik wybiera „Dodaj przepis” → „Z linku” i wkleja adres strony z przepisem.
2. Aplikacja odczytuje przepis i pokazuje podgląd.
3. Użytkownik może poprawić dane i zapisuje przepis.

**Kryteria akceptacji**
- Zakładając link do strony testowej „czytelna”, gdy użytkownik go wklei i zatwierdzi, wtedy widzi podgląd z tytułem, zdjęciem, listą składników, krokami, liczbą porcji oraz oceną i liczbą opinii ze źródła, zgodnymi z treścią strony testowej.
- Zakładając podgląd odczytanego przepisu, gdy użytkownik wybierze „Zapisz”, wtedy przepis pojawia się w kolekcji z pełną treścią, zdjęciem, linkiem do źródła, oceną ze źródła i liczbą opinii.
- Zakładając zapisany przepis z linku, gdy użytkownik otworzy jego szczegóły, wtedy widzi nazwę serwisu źródłowego i link otwierający oryginalną stronę.
- Zakładając link do strony testowej „bez oceny”, gdy przepis zostanie zapisany, wtedy w miejscu oceny ze źródła widnieje „brak oceny”.
- Zakładając link do strony testowej „bez liczby porcji”, gdy pojawi się podgląd, wtedy pole liczby porcji jest puste, a zapis jest możliwy dopiero po jego wypełnieniu.
- Zakładając link do strony testowej „bez zdjęcia”, gdy przepis zostanie zapisany, wtedy ma grafikę zastępczą, a zdjęcie da się dodać przy edycji.
- Zakładając, że przepis z tego samego adresu jest już w kolekcji, gdy użytkownik wklei ten link ponownie, wtedy aplikacja informuje, że przepis już jest, i proponuje przejście do niego zamiast tworzenia kopii. Adresy są uznawane za takie same, jeśli różnią się tylko protokołem, przedrostkiem „www”, końcowym ukośnikiem, parametrami po „?” lub fragmentem po „#”.
- Zakładając, że odczyt trwa, gdy użytkownik czeka, wtedy widzi wskaźnik postępu, a najpóźniej po 15 sekundach podgląd albo komunikat z S3.

#### S3: Link, którego nie da się odczytać

1. Użytkownik wkleja link, z którego aplikacja nie potrafi odczytać całego przepisu.
2. Aplikacja otwiera formularz ręczny z linkiem i tym, co udało się odczytać.
3. Użytkownik uzupełnia braki i zapisuje.

**Kryteria akceptacji**
- Zakładając link do strony testowej „bez składników” albo „nie-przepis”, gdy użytkownik go zatwierdzi, wtedy aplikacja pokazuje komunikat „Nie udało się odczytać całego przepisu” i otwiera formularz ręczny z wypełnionym linkiem do źródła oraz polami, które udało się odczytać.
- Zakładając taki formularz, gdy użytkownik uzupełni tytuł, liczbę porcji, co najmniej jeden składnik i co najmniej jeden krok, a potem zapisze, wtedy przepis trafia do kolekcji z linkiem do źródła.
- Zakładając link do strony testowej „niedostępna” (brak odpowiedzi przez 15 sekund albo błąd), gdy użytkownik go zatwierdzi, wtedy widzi komunikat „Strona nie odpowiada” i może ponowić próbę albo przejść do formularza ręcznego z zachowanym linkiem.
- Zakładając tekst, który nie jest adresem strony, gdy użytkownik go zatwierdzi, wtedy widzi komunikat „To nie jest poprawny link” i pole pozostaje do poprawy.

#### S4: Ręczne dodanie przepisu

1. Użytkownik wybiera „Dodaj przepis” → „Ręcznie”.
2. Wpisuje tytuł, liczbę porcji, składniki (ilość, jednostka, nazwa), kroki; opcjonalnie dodaje zdjęcie, link do źródła i wartości odżywcze na porcję.
3. Zapisuje.

**Kryteria akceptacji**
- Zakładając wypełniony tytuł, liczbę porcji, co najmniej jeden składnik i co najmniej jeden krok, gdy użytkownik wybierze „Zapisz”, wtedy przepis pojawia się w kolekcji oznaczony jako „ręczny”.
- Zakładając brak tytułu, liczby porcji, składników albo kroków, gdy użytkownik wybierze „Zapisz”, wtedy przepis nie zostaje zapisany, a każde brakujące pole jest wskazane komunikatem.
- Zakładając pole liczby porcji, gdy użytkownik wpisze wartość spoza zakresu 0,5–99 albo niebędącą wielokrotnością 0,5, wtedy przepis nie zostaje zapisany i pole jest wskazane komunikatem.
- Zakładając składnik, gdy użytkownik poda tylko nazwę bez ilości i jednostki (np. „sól do smaku”), wtedy składnik zostaje przyjęty.
- Zakładając przepis ręczny bez zdjęcia, gdy pojawia się on na liście, wtedy ma grafikę zastępczą.
- Zakładając utratę połączenia w chwili zapisu, gdy zapis się nie powiedzie, wtedy użytkownik widzi komunikat, a wpisane dane pozostają w formularzu.

#### S5: Wartości odżywcze

Każdy przepis ma cztery wartości na porcję: kalorie (kcal), białko (g), tłuszcz (g), błonnik (g). Każda wartość ma pochodzenie: „ze źródła”, „szacunkowe”, „wpisane ręcznie” albo jest w stanie „brak danych”. Kalorie są pokazywane w liczbach całkowitych, pozostałe wartości z dokładnością do 1 g.

1. Jeśli źródło podaje wartości, aplikacja je przejmuje.
2. Jeśli źródło nie podaje wartości (lub przepis jest ręczny i użytkownik ich nie wpisał), aplikacja wylicza je z listy składników.
3. Użytkownik może każdą wartość wpisać ręcznie.

**Kryteria akceptacji**
- Zakładając link do strony testowej „z wartościami odżywczymi”, gdy przepis zostanie zapisany, wtedy cztery wartości są równe podanym na stronie i oznaczone „ze źródła”.
- Zakładając przepis referencyjny bez wartości ze źródła, którego wszystkie składniki są w zestawie danych testowych o składnikach, gdy zostanie zapisany, wtedy każda wartość jest oznaczona „szacunkowe” i równa sumie wartości składników podzielonej przez liczbę porcji, z tolerancją zaokrąglenia ±1.
- Zakładając przepis, w którym części składników nie udało się rozpoznać, gdy użytkownik otworzy szczegóły wartości odżywczych, wtedy widzi listę nierozpoznanych składników i informację, że nie zostały one wliczone.
- Zakładając przepis bez wartości ze źródła, w którym nie rozpoznano żadnego składnika, gdy użytkownik otworzy jego szczegóły, wtedy każda z czterech wartości pokazuje „brak danych” i możliwość wpisania jej ręcznie.
- Zakładając link do strony testowej „z częścią wartości”, gdy przepis zostanie zapisany, wtedy wartości podane na stronie są oznaczone „ze źródła”, a pozostałe „szacunkowe”.
- Zakładając dowolny przepis, gdy użytkownik wpisze własną wartość (przy tworzeniu albo później) i zapisze, wtedy wartość jest oznaczona „wpisane ręcznie”.
- Zakładając wartość „wpisane ręcznie” albo „ze źródła”, gdy użytkownik zmieni składniki lub liczbę porcji przepisu i zapisze, wtedy ta wartość się nie zmienia.
- Zakładając wartość „szacunkowe”, gdy użytkownik zmieni składniki lub liczbę porcji przepisu i zapisze, wtedy wartość zostaje wyliczona ponownie z aktualnych danych.
- Zakładając wartość „wpisane ręcznie”, gdy użytkownik wybierze „Przywróć wyliczenie”, wtedy wraca wartość ze źródła, a gdy źródło jej nie podało, wartość wyliczona z aktualnych składników.
- Zakładając pole wartości odżywczej, gdy użytkownik wpisze liczbę ujemną albo tekst, wtedy wartość nie zostaje zapisana i widoczny jest komunikat.

#### S6: Przeglądanie kolekcji, filtry i sortowanie

1. Użytkownik otwiera kolekcję i widzi listę przepisów.
2. Włącza filtry jednym tapnięciem i ewentualnie zmienia sortowanie.
3. Otwiera przepis.

Filtry pod Mounjaro: „Wysokie białko”, „Mała porcja”, „Lekkostrawne (mało tłuszczu)”, „Dużo błonnika”, „Mało kalorii”. Pozostałe filtry: „Dobrze toleruję” (S9), „Na gorsze dni” (S10), kolekcja własna (S11). „Mała porcja” i „Mało kalorii” świadomie korzystają z tej samej wartości (kalorie na porcję) z różnymi progami.

**Kryteria akceptacji**
- Zakładając kolekcję z przepisami, gdy użytkownik ją otworzy, wtedy przepisy są posortowane malejąco według białka na porcję, a każda pozycja pokazuje tytuł, zdjęcie albo grafikę zastępczą, białko i kalorie na porcję oraz, jeśli istnieją, ocenę ze źródła i własną ocenę.
- Zakładając przepis z „brak danych” dla białka lub kalorii, gdy pojawia się on na liście, wtedy w miejscu tej wartości widnieje „—”.
- Zakładając pustą kolekcję, gdy użytkownik ją otworzy, wtedy widzi zachętę do dodania pierwszego przepisu z przyciskami „Z linku” i „Ręcznie”.
- Zakładając próg białka 25 g, gdy użytkownik włączy „Wysokie białko”, wtedy lista zawiera tylko przepisy z białkiem ≥ 25 g na porcję.
- Zakładając próg małej porcji 300 kcal, gdy użytkownik włączy „Mała porcja”, wtedy lista zawiera tylko przepisy z ≤ 300 kcal na porcję.
- Zakładając próg tłuszczu 15 g, gdy użytkownik włączy „Lekkostrawne”, wtedy lista zawiera tylko przepisy z tłuszczem ≤ 15 g na porcję.
- Zakładając próg błonnika 5 g, gdy użytkownik włączy „Dużo błonnika”, wtedy lista zawiera tylko przepisy z błonnikiem ≥ 5 g na porcję.
- Zakładając próg kalorii 400 kcal, gdy użytkownik włączy „Mało kalorii”, wtedy lista zawiera tylko przepisy z ≤ 400 kcal na porcję.
- Zakładając przepis z „brak danych” dla białka, gdy użytkownik włączy „Wysokie białko”, wtedy przepisu nie ma na liście; ta sama zasada dotyczy każdego filtra opartego na wartości, której przepis nie ma.
- Zakładając kilka włączonych filtrów, gdy lista się odświeży, wtedy zawiera tylko przepisy spełniające wszystkie włączone filtry jednocześnie.
- Zakładając, że żaden przepis nie spełnia filtrów, gdy lista się odświeży, wtedy użytkownik widzi komunikat „Brak przepisów dla tych filtrów” i przycisk „Wyczyść filtry”.
- Zakładając listę przepisów, gdy użytkownik zmieni sortowanie, wtedy może wybrać: białko na porcję malejąco (domyślne), własna ocena malejąco, ocena ze źródła malejąco, kalorie rosnąco, ostatnio dodane.
- Zakładając dowolne sortowanie według wartości lub oceny, gdy na liście są przepisy bez tej wartości lub oceny, wtedy znajdują się one na końcu listy.
- Zakładając dwa przepisy o równej wartości sortowania, gdy lista się wyświetli, wtedy wyżej jest przepis dodany później.
- Zakładając kolekcję, gdy użytkownik wpisze tekst w pole wyszukiwania, wtedy lista zawiera tylko przepisy, których tytuł lub nazwa składnika zawiera ten tekst, bez rozróżniania wielkości liter i polskich znaków (np. „losos” znajduje „Łosoś pieczony”).
- Zakładając wpisany tekst wyszukiwania i włączone filtry, gdy lista się odświeży, wtedy zawiera tylko przepisy spełniające jedno i drugie.
- Zakładając włączone filtry i zmienione sortowanie, gdy użytkownik otworzy przepis i wróci do listy, wtedy filtry i sortowanie są zachowane; po ponownym uruchomieniu aplikacji lista jest bez filtrów i z sortowaniem domyślnym.

#### S7: Progi filtrów w ustawieniach

1. Użytkownik otwiera Ustawienia → „Progi filtrów”.
2. Zmienia wartości i zapisuje.

Wartości domyślne na porcję: białko ≥ 25 g, tłuszcz ≤ 15 g, błonnik ≥ 5 g, kalorie ≤ 400 kcal, mała porcja ≤ 300 kcal.

**Kryteria akceptacji**
- Zakładając nowe konto, gdy użytkownik otworzy „Progi filtrów”, wtedy widzi pięć wartości domyślnych podanych wyżej.
- Zakładając, że użytkownik zmieni próg białka na 30 g i zapisze, gdy włączy filtr „Wysokie białko”, wtedy lista zawiera tylko przepisy z białkiem ≥ 30 g na porcję.
- Zakładając zmienione progi, gdy użytkownik wybierze „Przywróć domyślne”, wtedy wracają wartości domyślne.
- Zakładając pole progu, gdy użytkownik wpisze wartość ujemną, zero albo tekst, wtedy zmiana nie zostaje zapisana i widoczny jest komunikat o błędzie.
- Zakładając progi zmienione na telefonie, gdy użytkownik otworzy aplikację na komputerze, wtedy obowiązują te same progi.

#### S8: Oznaczenie „Ugotowane” i własna ocena

1. Po ugotowaniu użytkownik wybiera „Ugotowane” w szczegółach przepisu.
2. Nadaje ocenę 1–5 gwiazdek.

**Kryteria akceptacji**
- Zakładając otwarty przepis, gdy użytkownik wybierze „Ugotowane”, wtedy aplikacja zapisuje ugotowanie z dzisiejszą datą, a szczegóły przepisu pokazują datę ostatniego ugotowania i łączną liczbę ugotowań.
- Zakładając przepis ugotowany dziś, gdy użytkownik wybierze „Ugotowane” ponownie, wtedy zapisuje się kolejne ugotowanie.
- Zakładając zapisane ugotowanie, gdy użytkownik wybierze „Cofnij ostatnie ugotowanie”, wtedy zostaje ono usunięte, a liczniki maleją o jeden.
- Zakładając trzy ugotowania zapisane w bieżącym tygodniu (poniedziałek–niedziela), gdy użytkownik otworzy kolekcję, wtedy widzi informację „W tym tygodniu ugotowano: 3”.
- Zakładając nowy tydzień bez ugotowań, gdy użytkownik otworzy kolekcję, wtedy licznik tygodniowy pokazuje 0.
- Zakładając licznik tygodniowy, gdy użytkownik go wybierze, wtedy widzi liczbę ugotowań w każdym z ostatnich 8 tygodni.
- Zakładając przepis bez własnej oceny, gdy użytkownik wybierze 4 gwiazdki, wtedy ocena 4 jest widoczna w szczegółach przepisu i na liście, podpisana „moja ocena”, osobno od oceny ze źródła.
- Zakładając przepis z własną oceną, gdy użytkownik wybierze inną liczbę gwiazdek, wtedy ocena zostaje zastąpiona.
- Zakładając przepis z własną oceną, gdy użytkownik wybierze „Usuń ocenę”, wtedy przepis nie ma własnej oceny.

#### S9: Ocena tolerancji i filtr „Dobrze toleruję”

1. Po posiłku użytkownik otwiera przepis i zaznacza tolerancję: dobrze, średnio albo źle.
2. Opcjonalnie zaznacza objawy: nudności, zgaga, wzdęcia, inne (z krótką notatką).

**Kryteria akceptacji**
- Zakładając przepis bez oceny tolerancji, gdy użytkownik zaznaczy „dobrze”, wtedy przepis pokazuje tolerancję „dobrze”.
- Zakładając, że użytkownik zaznacza „średnio” albo „źle”, gdy wybierze objawy i zapisze, wtedy objawy są widoczne w szczegółach przepisu.
- Zakładając przepisy z różną tolerancją i bez oceny tolerancji, gdy użytkownik włączy filtr „Dobrze toleruję”, wtedy lista zawiera tylko przepisy z tolerancją „dobrze”.
- Zakładając przepis z oceną tolerancji, gdy użytkownik ją zmieni albo usunie, wtedy filtr „Dobrze toleruję” uwzględnia nowy stan.
- Zakładając przepis z tolerancją „źle”, gdy pojawia się on na liście, wtedy ma etykietę „źle toleruję”.

#### S10: Tag „Na gorsze dni”

1. Użytkownik oznacza przepis tagiem „Na gorsze dni” (bardzo małe, łagodne posiłki na dni po zastrzyku).

**Kryteria akceptacji**
- Zakładając przepis bez tagu, gdy użytkownik włączy „Na gorsze dni”, wtedy tag jest widoczny w szczegółach i na liście.
- Zakładając przepisy z tagiem i bez, gdy użytkownik włączy filtr „Na gorsze dni”, wtedy lista zawiera tylko przepisy z tagiem.
- Zakładając przepis z tagiem, gdy użytkownik go wyłączy, wtedy przepis znika z wyników filtra „Na gorsze dni”.

#### S11: Kolekcje własne

1. Użytkownik tworzy kolekcję własną (np. „Śniadania”, „Do pracy”) i przypisuje do niej przepisy.

**Kryteria akceptacji**
- Zakładając, że użytkownik poda nazwę i zapisze, gdy otworzy listę kolekcji własnych, wtedy widzi nową kolekcję własną.
- Zakładając pustą nazwę albo nazwę istniejącej kolekcji własnej (bez rozróżniania wielkości liter), gdy użytkownik spróbuje utworzyć kolekcję albo zmienić nazwę, wtedy zmiana nie zostaje zapisana i widoczny jest komunikat.
- Zakładając przepis, gdy użytkownik przypisze go do dwóch kolekcji własnych, wtedy przepis jest widoczny w obu.
- Zakładając kolekcję własną z przepisami, gdy użytkownik wybierze ją jako filtr, wtedy lista zawiera tylko przepisy z tej kolekcji własnej, a pozostałe filtry działają łącznie z nią. Naraz można wybrać jedną kolekcję własną.
- Zakładając kolekcję własną, gdy użytkownik zmieni jej nazwę na nową, unikalną, wtedy przypisane przepisy pozostają w niej.
- Zakładając kolekcję własną z przepisami, gdy użytkownik ją usunie i potwierdzi, wtedy kolekcja własna znika, a przepisy pozostają w kolekcji.

#### S12: Skalowanie porcji

1. W szczegółach przepisu użytkownik zmienia liczbę porcji (np. z 4 na 2 albo na pół porcji).

Liczba porcji: od 0,5 do 99, co 0,5. Przeliczone ilości są zaokrąglane do jednego miejsca po przecinku.

**Kryteria akceptacji**
- Zakładając przepis na 4 porcje ze składnikiem „400 g piersi z kurczaka”, gdy użytkownik ustawi 2 porcje, wtedy składnik pokazuje „200 g”.
- Zakładając przepis na 1 porcję, gdy użytkownik ustawi 0,5 porcji, wtedy ilości wszystkich składników z podaną ilością są o połowę mniejsze.
- Zakładając przepis na 2 porcje ze składnikiem „3 jajka”, gdy użytkownik ustawi 1 porcję, wtedy składnik pokazuje „1,5 jajka”.
- Zakładając składnik bez ilości (np. „sól do smaku”), gdy użytkownik zmieni liczbę porcji, wtedy składnik wyświetla się bez zmian.
- Zakładając składnik zapisany jako sam tekst, którego nie udało się rozbić na ilość, jednostkę i nazwę, gdy użytkownik zmieni liczbę porcji, wtedy składnik wyświetla się bez zmian z dopiskiem „ilość nieprzeliczona”.
- Zakładając zmienioną liczbę porcji, gdy użytkownik patrzy na wartości odżywcze, wtedy wartości na porcję się nie zmieniają.
- Zakładając zmienioną liczbę porcji, gdy użytkownik zamknie i ponownie otworzy przepis, wtedy widzi pierwotną liczbę porcji (skalowanie nie zmienia zapisanego przepisu).

#### S13: Tryb gotowania

1. Użytkownik wybiera „Gotuj” w szczegółach przepisu.
2. Widzi listę składników, potem kolejne kroki, po jednym na ekranie.
3. Przechodzi między krokami i kończy gotowanie.

**Kryteria akceptacji**
- Zakładając otwarty przepis, gdy użytkownik wybierze „Gotuj”, wtedy widzi ekran z listą składników, bez elementów nawigacji aplikacji poza wyjściem z trybu, z tekstem o wielkości co najmniej 22 px.
- Zakładając przepis przeskalowany w S12, gdy użytkownik uruchomi tryb gotowania, wtedy składniki mają przeskalowane ilości.
- Zakładając tryb gotowania, gdy użytkownik przejdzie dalej, wtedy widzi dokładnie jeden krok na ekranie wraz z informacją „krok X z Y”.
- Zakładając dowolny krok, gdy użytkownik wybierze „Wstecz” albo „Dalej”, wtedy widzi krok poprzedni albo następny.
- Zakładając dowolny krok, gdy użytkownik wybierze „Składniki”, wtedy widzi listę składników i może wrócić do tego samego kroku.
- Zakładając włączony tryb gotowania na telefonie z obsługiwaną przeglądarką, gdy użytkownik nie dotyka ekranu przez 5 minut, wtedy ekran nie gaśnie.
- Zakładając wyjście z trybu gotowania, gdy użytkownik wraca do przepisu, wtedy blokada wygaszania ekranu jest wyłączona.
- Zakładając przeglądarkę, która nie pozwala zablokować wygaszania ekranu, gdy użytkownik uruchomi tryb gotowania, wtedy tryb działa, a użytkownik widzi jednorazową informację, że ekran może zgasnąć.
- Zakładając ostatni krok i połączenie z internetem, gdy użytkownik wybierze „Zakończ”, wtedy wraca do szczegółów przepisu i widzi przycisk „Ugotowane” (S8) oraz zachętę do oceny smaku i tolerancji.

#### S14: Instalacja na telefonie i praca offline

1. Użytkownik instaluje aplikację na ekranie głównym telefonu.
2. Bez internetu otwiera aplikację, przegląda kolekcję i gotuje.

Zasada ogólna dla całej aplikacji: offline wszystkie zapisane dane można przeglądać, a każda zmiana danych wymaga internetu. Jedyny wyjątek to odhaczanie listy zakupów (S20).

Obsługiwane przeglądarki: aktualne wersje Chrome na Androidzie i Safari na iOS (telefon) oraz Chrome, Safari, Firefox i Edge (komputer).

**Kryteria akceptacji**
- Zakładając telefon z obsługiwaną przeglądarką, gdy użytkownik zainstaluje aplikację, wtedy uruchamia się ona z ikony na ekranie głównym, w osobnym oknie bez paska adresu.
- Zakładając zalogowanego użytkownika z internetem, gdy aplikacja skończy pobierać dane do pracy offline, wtedy w Ustawieniach widnieje „Dane offline: aktualne” z datą i godziną.
- Zakładając stan „Dane offline: aktualne”, gdy użytkownik otworzy aplikację offline, wtedy widzi całą kolekcję z treścią przepisów i zdjęciami.
- Zakładając pracę offline, gdy użytkownik używa filtrów, sortowania, wyszukiwania w kolekcji, skalowania porcji i trybu gotowania, wtedy działają one tak samo jak z internetem.
- Zakładając pracę offline, gdy użytkownik próbuje dodać, edytować, ocenić, oznaczyć jako ugotowany albo usunąć przepis lub zmienić ustawienia, wtedy akcja jest niedostępna i widoczny jest komunikat „Ta akcja wymaga połączenia z internetem”.
- Zakładając pracę offline, gdy użytkownik zakończy tryb gotowania, wtedy przycisk „Ugotowane” jest nieaktywny z dopiskiem „Oznacz po odzyskaniu połączenia”.
- Zakładając pracę offline, gdy aplikacja jest otwarta, wtedy widoczny jest znacznik „offline”.
- Zakładając przepis dodany na komputerze, gdy użytkownik otworzy aplikację na telefonie z internetem, poczeka na „Dane offline: aktualne”, a potem straci połączenie, wtedy ten przepis jest dostępny offline.
- Zakładając, że na urządzeniu brakuje miejsca na dane offline, gdy pobieranie się nie powiedzie, wtedy w Ustawieniach widnieje „Dane offline: niepełne” z wyjaśnieniem, a aplikacja z internetem działa normalnie.
- Zakładając zalogowanego użytkownika z internetem, gdy wybierze „Wyloguj”, wtedy dane offline zostają usunięte z urządzenia i po przejściu offline aplikacja pokazuje tylko ekran logowania.
- Zakładając urządzenie, na którym aplikacja nie była otwierana z internetem przez ponad 30 dni (S1), gdy użytkownik otworzy ją offline, wtedy widzi ekran logowania i żadnych danych.
- Zakładając przeglądarkę bez obsługi instalacji albo pracy offline, gdy użytkownik otworzy aplikację, wtedy działa ona w zwykłej karcie z internetem, a w Ustawieniach widnieje informacja, że praca offline jest niedostępna.

#### S15: Edycja i usunięcie przepisu

**Kryteria akceptacji**
- Zakładając dowolny przepis, gdy użytkownik zmieni tytuł, składniki, kroki, liczbę porcji albo zdjęcie i zapisze, wtedy szczegóły pokazują nowe dane.
- Zakładając edycję przepisu, gdy użytkownik usunie tytuł, liczbę porcji, wszystkie składniki albo wszystkie kroki i wybierze „Zapisz”, wtedy zmiana nie zostaje zapisana, a brakujące pola są wskazane komunikatem.
- Zakładając przepis z linku, gdy użytkownik go edytuje, wtedy link do źródła oraz ocena i liczba opinii ze źródła pozostają bez zmian.
- Zakładając dowolny przepis, gdy użytkownik wybierze „Usuń” i potwierdzi, wtedy przepis znika z kolekcji i ze wszystkich kolekcji własnych.
- Zakładając okno potwierdzenia usunięcia, gdy użytkownik wybierze „Anuluj”, wtedy przepis pozostaje bez zmian.
- Zakładając ten sam przepis zmieniony na dwóch urządzeniach, gdy oba zapisy dotrą do aplikacji, wtedy obowiązuje zapis, który dotarł później.

#### S16: Eksport danych i usunięcie konta

1. Użytkownik otwiera Ustawienia → „Moje dane”.
2. Pobiera plik ze wszystkimi danymi albo trwale usuwa konto z danymi.

**Kryteria akceptacji**
- Zakładając zalogowanego użytkownika z internetem, gdy wybierze „Eksportuj dane”, wtedy pobiera jeden plik zawierający wszystkie obiekty i pola z sekcji „Dane” istniejące na jego koncie, w ustrukturyzowanym formacie tekstowym, oraz zdjęcia przepisów.
- Zakładając konto z przepisem „Omlet testowy” z własną oceną 4, tolerancją „średnio” z objawem „zgaga” i jednym ugotowaniem, gdy użytkownik otworzy wyeksportowany plik, wtedy znajduje w nim tytuł, składniki, kroki, wartości odżywcze, ocenę 4, tolerancję z objawem i datę ugotowania tego przepisu.
- Zakładając, że użytkownik wybiera „Usuń konto i wszystkie dane”, gdy potwierdzi operację wpisaniem słowa „USUŃ”, wtedy wszystkie jego dane zostają usunięte z aplikacji, a użytkownik zostaje wylogowany.
- Zakładając usunięte konto, gdy użytkownik zaloguje się ponownie dozwolonym adresem, wtedy widzi pustą kolekcję i domyślne ustawienia.
- Zakładając usunięte konto i drugie urządzenie z danymi offline, gdy użytkownik otworzy na nim aplikację z internetem, wtedy widzi ekran logowania, a dane offline zostają usunięte z tego urządzenia.
- Zakładając okno potwierdzenia usunięcia, gdy użytkownik wpisze inne słowo albo anuluje, wtedy żadne dane nie zostają usunięte.

### Etap 2: wyszukiwanie w zaufanych serwisach

#### S17: Wyszukiwanie przepisów w zaufanych serwisach

1. Użytkownik otwiera „Szukaj w serwisach” i wpisuje frazę (np. „kurczak z warzywami”).
2. Widzi jedną listę wyników ze wszystkich aktywnych zaufanych serwisów.
3. Zapisuje wybrany przepis do kolekcji jednym tapnięciem, bez ekranu podglądu.

**Kryteria akceptacji**
- Zakładając aktywne zaufane serwisy testowe, gdy użytkownik wyszuka frazę, wtedy najpóźniej po 15 sekundach widzi jedną listę wyników, najwyżej 10 z każdego serwisu, a każdy wynik pokazuje tytuł, zdjęcie, nazwę serwisu, ocenę w skali 0–5 i liczbę opinii.
- Zakładając serwis, który podaje oceny w innej skali niż 0–5, gdy wyniki się wyświetlą, wtedy jego oceny są przeliczone proporcjonalnie na skalę 0–5.
- Zakładając wyniki z ocenami, gdy lista się wyświetli, wtedy jest posortowana od najwyżej ocenianych, a przy równej ocenie wyżej jest wynik z większą liczbą opinii; wyniki bez oceny są na końcu.
- Zakładając wynik prowadzący do strony testowej „czytelna”, gdy użytkownik wybierze „Zapisz”, wtedy przepis zostaje dodany do kolekcji z tymi samymi danymi co w S2 (bez podglądu), wynik zmienia oznaczenie na „w kolekcji”, a przepis podlega filtrom z S6.
- Zakładając wynik prowadzący do strony testowej „bez składników” albo „bez liczby porcji”, gdy użytkownik wybierze „Zapisz”, wtedy otwiera się formularz ręczny z S3 z odczytanymi polami.
- Zakładając wynik, którego adres jest już w kolekcji (reguła porównania adresów z S2), gdy lista się wyświetli, wtedy wynik jest oznaczony „w kolekcji” i nie ma przycisku „Zapisz”.
- Zakładając wynik wyszukiwania, gdy użytkownik wybierze jego tytuł, wtedy otwiera się oryginalna strona przepisu.
- Zakładając, że serwis testowy „niedostępny” nie odpowiada przez 15 sekund, gdy użytkownik wyszukuje, wtedy widzi wyniki z pozostałych serwisów i informację, którego serwisu nie udało się przeszukać.
- Zakładając frazę bez wyników, gdy wyszukiwanie się zakończy, wtedy użytkownik widzi komunikat „Brak wyników”.
- Zakładając pracę offline, gdy użytkownik otworzy „Szukaj w serwisach”, wtedy widzi komunikat, że wyszukiwanie wymaga połączenia.

#### S18: Edycja listy zaufanych serwisów

Lista startowa: aniagotuje.pl, kwestiasmaku.com, przepisy.pl, doradcasmaku.pl.

**Kryteria akceptacji**
- Zakładając nowe konto, gdy użytkownik otworzy Ustawienia → „Zaufane serwisy”, wtedy widzi cztery serwisy z listy startowej, wszystkie aktywne.
- Zakładając listę serwisów, gdy użytkownik wyłączy serwis, wtedy wyniki wyszukiwania nie zawierają przepisów z tego serwisu.
- Zakładając listę serwisów, gdy użytkownik usunie serwis i potwierdzi, wtedy serwis znika z listy, a przepisy zapisane z niego wcześniej pozostają w kolekcji.
- Zakładając, że użytkownik podaje adres serwisu testowego „przeszukiwalny”, gdy zatwierdzi, wtedy serwis pojawia się na liście jako aktywny, a jego przepisy pojawiają się w wynikach wyszukiwania.
- Zakładając, że użytkownik podaje adres serwisu testowego „nieprzeszukiwalny”, gdy zatwierdzi, wtedy serwis nie zostaje dodany, a użytkownik widzi komunikat, że przepisy z tego serwisu nadal może dodawać przez wklejenie linku.
- Zakładając serwis, który jest już na liście, gdy użytkownik poda jego adres ponownie, wtedy serwis nie zostaje dodany drugi raz i widoczny jest komunikat.
- Zakładając wszystkie serwisy wyłączone albo usunięte, gdy użytkownik otworzy wyszukiwanie, wtedy widzi komunikat z odesłaniem do ustawień zaufanych serwisów.
- Zakładając zmienioną listę zaufanych serwisów, gdy użytkownik wyeksportuje dane (S16), wtedy plik zawiera aktualną listę serwisów ze stanem aktywny / nieaktywny.

### Etap 3: planer tygodnia i lista zakupów

#### S19: Planer posiłków na tydzień

1. Użytkownik otwiera planer i widzi bieżący tydzień (poniedziałek–niedziela) z czterema porami na każdy dzień: śniadanie, obiad, kolacja, przekąska.
2. Dodaje przepisy z kolekcji do wybranych pór, z liczbą porcji.

**Kryteria akceptacji**
- Zakładając pusty planer, gdy użytkownik go otworzy, wtedy widzi 7 dni bieżącego tygodnia, każdy z czterema porami.
- Zakładając wybraną porę, gdy użytkownik doda do niej przepis z kolekcji i poda liczbę porcji (0,5–99, co 0,5; domyślnie 1), wtedy przepis jest widoczny w tej porze z liczbą porcji.
- Zakładając porę z jednym przepisem, gdy użytkownik doda drugi, wtedy oba są widoczne w tej porze.
- Zakładając przepis w planerze, gdy użytkownik go usunie z pory, wtedy pora go nie zawiera, a przepis pozostaje w kolekcji.
- Zakładając przepis w planerze, gdy użytkownik go wybierze, wtedy otwierają się szczegóły przepisu z liczbą porcji ustawioną jak w planerze.
- Zakładając planer, gdy użytkownik przejdzie do następnego albo poprzedniego tygodnia, wtedy widzi plan tego tygodnia.
- Zakładając przepis zaplanowany w planerze, gdy użytkownik usuwa ten przepis z kolekcji, wtedy okno potwierdzenia uprzedza, że przepis zniknie też z planera, a po potwierdzeniu planer go nie zawiera.
- Zakładając pracę offline, gdy użytkownik otworzy planer, wtedy widzi ostatnio pobrany plan, a jego zmiana jest niedostępna z komunikatem „Ta akcja wymaga połączenia z internetem”.

#### S20: Lista zakupów z planera

1. Użytkownik wybiera w planerze „Lista zakupów” dla oglądanego tygodnia.
2. W sklepie odhacza pozycje; może dopisać własne.

Dwa składniki są „tym samym składnikiem”, gdy mają identyczną nazwę (bez rozróżniania wielkości liter i nadmiarowych spacji) i identyczną jednostkę. Lista jest ułożona alfabetycznie; pozycje odhaczone są pod nieodhaczonymi, również alfabetycznie.

**Kryteria akceptacji**
- Zakładając tydzień z zaplanowanymi przepisami, gdy użytkownik otworzy listę zakupów, wtedy widzi składniki wszystkich zaplanowanych przepisów w ilościach przeliczonych na zaplanowaną liczbę porcji.
- Zakładając „200 g Twaróg” w jednym zaplanowanym przepisie i „300 g twaróg” w drugim, gdy lista się wyświetli, wtedy zawiera jedną pozycję „twaróg 500 g”.
- Zakładając ten sam przepis zaplanowany dwa razy w tygodniu, gdy lista się wyświetli, wtedy ilości jego składników są zsumowane.
- Zakładając składnik o tej samej nazwie w różnych jednostkach (np. „2 szt.” i „300 g”), gdy lista się wyświetli, wtedy zawiera osobne pozycje dla każdej jednostki.
- Zakładając składnik bez ilości albo zapisany jako sam tekst, gdy lista się wyświetli, wtedy występuje na niej jeden raz, bez ilości.
- Zakładając pozycję na liście, gdy użytkownik ją odhaczy, wtedy jest oznaczona jako kupiona i przeniesiona do części odhaczonej; ponowne tapnięcie cofa odhaczenie.
- Zakładając listę zakupów, gdy użytkownik dopisze własną pozycję (np. „papier do pieczenia”), wtedy pozycja jest na liście i da się ją odhaczyć oraz usunąć.
- Zakładając listę z własnymi pozycjami i odhaczeniami, gdy użytkownik zmieni planer tego tygodnia, wtedy lista odzwierciedla nowy plan, własne pozycje pozostają, odhaczenie pozycji o niezmienionej ilości zostaje zachowane, a pozycja o zmienionej ilości wraca do nieodhaczonych.
- Zakładając tydzień bez zaplanowanych przepisów, gdy użytkownik otworzy listę zakupów, wtedy widzi komunikat „Zaplanuj posiłki, żeby wygenerować listę” oraz możliwość dopisania własnych pozycji.
- Zakładając listę zakupów pobraną do pracy offline (S14), gdy użytkownik otworzy ją offline, wtedy widzi wszystkie pozycje z ich stanem odhaczenia.
- Zakładając pracę offline, gdy użytkownik odhaczy pozycję albo cofnie odhaczenie, wtedy zmiana jest od razu widoczna na tym urządzeniu i pozostaje po zamknięciu i ponownym otwarciu aplikacji.
- Zakładając pozycje odhaczone offline, gdy urządzenie odzyska połączenie i aplikacja jest otwarta, wtedy odhaczenia zapisują się na koncie i po odświeżeniu są widoczne na drugim urządzeniu.
- Zakładając pracę offline, gdy użytkownik próbuje dopisać albo usunąć własną pozycję, wtedy akcja jest niedostępna i widoczny jest komunikat „Ta akcja wymaga połączenia z internetem”.
- Zakładając tę samą pozycję zmienioną offline na dwóch urządzeniach, gdy oba odzyskają połączenie, wtedy obowiązuje stan z urządzenia, które zsynchronizowało się później.
- Zakładając plan tygodnia i listę zakupów z własną pozycją, gdy użytkownik wyeksportuje dane (S16), wtedy plik zawiera plan i listę wraz ze stanem odhaczenia.

### Etap 4: zdrowie

Ekrany: dziennik dawek, formularz dawki, dziennik wagi i samopoczucia oraz licznik białka i wody zawierają stałą informację: „Aplikacja nie jest wyrobem medycznym i nie zastępuje zaleceń lekarza. Dawkę ustala lekarz.”

Zgodnie z zasadą z S14 dzienniki i liczniki można przeglądać offline, a dodawanie, edycja i usuwanie wpisów wymagają internetu.

#### S21: Dziennik dawek

1. Po zastrzyku użytkownik dodaje wpis: data, dawka w mg przepisana przez lekarza, miejsce wkłucia, opcjonalna notatka.

**Kryteria akceptacji**
- Zakładając formularz nowego wpisu, gdy użytkownik go otworzy, wtedy zawiera on wyłącznie pola: data (ustawiona na dziś), dawka w mg (puste), miejsce wkłucia (niezaznaczone), notatka (pusta), oraz informację o wyrobie medycznym podaną wyżej.
- Zakładając podaną datę, dawkę w mg i miejsce wkłucia, gdy użytkownik zapisze, wtedy wpis jest widoczny w dzienniku dawek w miejscu wynikającym z jego daty.
- Zakładając brak dawki, dawkę niebędącą liczbą dodatnią albo brak miejsca wkłucia, gdy użytkownik spróbuje zapisać, wtedy wpis nie zostaje zapisany, a błędne pole jest wskazane komunikatem.
- Zakładając datę z przyszłości, gdy użytkownik spróbuje zapisać, wtedy wpis nie zostaje zapisany i widoczny jest komunikat.
- Zakładając istniejący wpis, gdy użytkownik go edytuje albo usunie (z potwierdzeniem), wtedy dziennik pokazuje stan po zmianie.
- Zakładając dziennik z wpisami, gdy użytkownik go otworzy, wtedy wpisy są ułożone od najnowszej daty (przy tej samej dacie wyżej wpis dodany później) i każdy pokazuje datę, dawkę w mg i miejsce wkłucia.
- Zakładając pracę offline, gdy użytkownik otworzy dziennik dawek, wtedy widzi ostatnio pobrane wpisy, a dodanie wpisu jest niedostępne z komunikatem „Ta akcja wymaga połączenia z internetem”.
- Zakładając wpis dawki, gdy użytkownik wyeksportuje dane (S16), wtedy plik zawiera datę, dawkę, miejsce wkłucia i notatkę tego wpisu.

#### S22: Rotacja miejsc wkłucia

Miejsca, w stałej kolejności: brzuch lewa strona, brzuch prawa strona, udo lewe, udo prawe, ramię lewe, ramię prawe.

**Kryteria akceptacji**
- Zakładając formularz nowego wpisu dawki, gdy użytkownik wybiera miejsce wkłucia, wtedy ma do wyboru dokładnie sześć miejsc wymienionych wyżej.
- Zakładając co najmniej jeden wpis w dzienniku dawek, gdy użytkownik otworzy formularz nowego wpisu, wtedy widzi tekst z miejscem i datą ostatniego wkłucia oraz tekst „Proponowane miejsce: …”; żadne miejsce nie jest zaznaczone.
- Zakładając wpisy, w których co najmniej jedno z sześciu miejsc nie było użyte, gdy aplikacja proponuje miejsce, wtedy wskazuje pierwsze nieużyte miejsce w kolejności listy.
- Zakładając wpisy obejmujące wszystkie sześć miejsc, gdy aplikacja proponuje miejsce, wtedy wskazuje to, którego ostatnie użycie ma najstarszą datę.
- Zakładając propozycję miejsca, gdy użytkownik wybierze inne miejsce, wtedy wpis zapisuje się z miejscem wybranym przez użytkownika.
- Zakładając pusty dziennik dawek, gdy użytkownik otworzy formularz, wtedy nie ma propozycji i żadne miejsce nie jest zaznaczone.

#### S23: Przypomnienie o zastrzyku

1. Użytkownik w Ustawieniach włącza przypomnienie, wybiera dzień tygodnia i godzinę oraz zgadza się na powiadomienia na danym urządzeniu.
2. W wybranym dniu i o wybranej godzinie urządzenie pokazuje powiadomienie.
3. Jeśli do tej samej godziny następnego dnia nie ma wpisu dawki, powiadomienie przychodzi jeszcze raz.

Godziny są liczone w czasie polskim. „Dzień przypomnienia” to wybrany dzień tygodnia, „dzień ponowienia” to dzień po nim. Przykłady niżej zakładają ustawienie: czwartek 19:00.

**Kryteria akceptacji**
- Zakładając włączone przypomnienie i brak wpisu dawki z datą czwartkową, gdy nadejdzie czwartek 19:00, wtedy w ciągu 5 minut każde urządzenie ze zgodą na powiadomienia pokazuje powiadomienie o dniu zastrzyku, także gdy aplikacja jest zamknięta.
- Zakładając wpis dawki z datą czwartkową zapisany przed 19:00, gdy nadejdzie czwartek 19:00, wtedy powiadomienie nie przychodzi i nie ma ponowienia w piątek.
- Zakładając wysłane przypomnienie, gdy do piątku 19:00 nie istnieje wpis dawki z datą czwartkową ani piątkową, wtedy w piątek między 19:00 a 19:05 przychodzi jedno ponowne powiadomienie.
- Zakładając wysłane przypomnienie, gdy użytkownik zapisze wpis dawki z datą czwartkową albo piątkową przed piątkiem 19:00, wtedy ponowne powiadomienie nie przychodzi.
- Zakładając ponowne powiadomienie bez reakcji, gdy mijają kolejne dni, wtedy następne powiadomienie przychodzi dopiero w kolejny czwartek o 19:00.
- Zakładając powiadomienie na ekranie i połączenie z internetem, gdy użytkownik je wybierze, wtedy otwiera się formularz nowego wpisu dawki; offline otwiera się dziennik dawek z komunikatem „Ta akcja wymaga połączenia z internetem”.
- Zakładając dowolne powiadomienie, gdy jest widoczne na zablokowanym ekranie, wtedy jego treść to „Przypomnienie: dziś zaplanowany zastrzyk” i nie zawiera dawki, miejsca wkłucia ani nazwy leku.
- Zakładając, że użytkownik odmówił zgody na powiadomienia albo urządzenie ich nie obsługuje, gdy włącza przypomnienie, wtedy widzi wyjaśnienie, jak je włączyć (na iPhonie: zainstalować aplikację na ekranie głównym).
- Zakładając włączone przypomnienie, gdy użytkownik otworzy aplikację między czwartkiem 19:00 a końcem piątku i nie istnieje wpis dawki z datą czwartkową ani piątkową, wtedy widzi baner „Dziś zaplanowany zastrzyk” z przejściem do formularza dawki; baner znika po zapisaniu takiego wpisu albo z końcem piątku.
- Zakładając włączone przypomnienie, gdy użytkownik je wyłączy albo zmieni dzień i godzinę, wtedy kolejne powiadomienia stosują się do nowych ustawień.

#### S24: Dziennik wagi i samopoczucia

1. Użytkownik dodaje wpis: data, waga w kg (opcjonalnie), samopoczucie w skali 1–5, gdzie 1 to „bardzo źle”, a 5 to „bardzo dobrze” (opcjonalnie), notatka (opcjonalnie).

**Kryteria akceptacji**
- Zakładając formularz wpisu, gdy użytkownik poda wagę lub samopoczucie i zapisze, wtedy wpis pojawia się w dzienniku z datą.
- Zakładając formularz bez wagi i bez samopoczucia, gdy użytkownik spróbuje zapisać, wtedy wpis nie zostaje zapisany i widoczny jest komunikat.
- Zakładając wagę niebędącą liczbą dodatnią albo datę z przyszłości, gdy użytkownik spróbuje zapisać, wtedy wpis nie zostaje zapisany i widoczny jest komunikat.
- Zakładając istniejący wpis z danego dnia, gdy użytkownik w formularzu nowego wpisu wybierze tę samą datę, wtedy formularz wypełnia się danymi istniejącego wpisu, a zapis go aktualizuje zamiast tworzyć drugi.
- Zakładając dziennik z wpisami, gdy użytkownik go otworzy, wtedy widzi listę wpisów od najnowszej daty.
- Zakładając co najmniej dwa wpisy z wagą, gdy użytkownik otworzy dziennik, wtedy nad listą widzi wykres wagi w czasie; przy mniej niż dwóch wpisach z wagą w miejscu wykresu jest tekst „Dodaj co najmniej dwa pomiary, żeby zobaczyć wykres”.
- Zakładając istniejący wpis, gdy użytkownik go edytuje albo usunie (z potwierdzeniem), wtedy lista i wykres pokazują stan po zmianie.
- Zakładając wpis wagi i samopoczucia, gdy użytkownik wyeksportuje dane (S16), wtedy plik zawiera datę, wagę, samopoczucie i notatkę tego wpisu.

#### S25: Licznik białka i wody

1. Użytkownik ustawia w Ustawieniach dzienny cel białka (g) i wody (ml) oraz wielkość szklanki (domyślnie 250 ml).
2. W ciągu dnia oznacza przepis jako zjedzony (z liczbą porcji), dopisuje białko ręcznie i dodaje wodę przyciskiem.

**Kryteria akceptacji**
- Zakładając przepis z 30 g białka na porcję, gdy użytkownik wybierze „Zjedzone” i poda 1 porcję, wtedy dzisiejszy licznik białka rośnie o 30 g, a na liście dzisiejszych wpisów pojawia się ten przepis.
- Zakładając ten sam przepis, gdy użytkownik poda 0,5 porcji, wtedy licznik białka rośnie o 15 g.
- Zakładając wpis białka z przepisu, gdy użytkownik później zmieni wartość białka tego przepisu albo usunie przepis, wtedy wpis zachowuje nazwę przepisu i ilość z chwili dodania.
- Zakładając przepis z „brak danych” dla białka, gdy użytkownik wybierze „Zjedzone”, wtedy aplikacja prosi o ręczne podanie białka.
- Zakładając licznik białka, gdy użytkownik dopisze ręcznie 20 g z opisem „jogurt”, wtedy licznik rośnie o 20 g, a wpis jest widoczny na liście dzisiejszych wpisów.
- Zakładając wielkość szklanki 250 ml, gdy użytkownik wybierze przycisk dodania wody, wtedy licznik wody rośnie o 250 ml.
- Zakładając wpis białka albo wody z dzisiejszego dnia, gdy użytkownik go usunie, wtedy licznik maleje o wartość tego wpisu.
- Zakładając cel białka 100 g i sumę 60 g, gdy użytkownik otworzy licznik, wtedy widzi „60 / 100 g”; gdy suma jest równa celowi albo większa, licznik ma oznaczenie „cel osiągnięty”. To samo dotyczy wody.
- Zakładając brak ustawionego celu, gdy użytkownik otworzy licznik, wtedy widzi samą sumę z dnia i zachętę do ustawienia celu; aplikacja nie proponuje wartości celu.
- Zakładając pole celu albo wielkości szklanki, gdy użytkownik wpisze wartość niebędącą liczbą dodatnią, wtedy zmiana nie zostaje zapisana i widoczny jest komunikat.
- Zakładając wpisy z dnia poprzedniego, gdy użytkownik otworzy licznik po północy czasu polskiego, wtedy liczniki dzisiejsze zaczynają od zera.
- Zakładając licznik, gdy użytkownik wybierze „Poprzedni dzień”, wtedy widzi sumy i wpisy tego dnia bez możliwości ich zmiany.
- Zakładając wpisy białka i wody, gdy użytkownik wyeksportuje dane (S16), wtedy plik zawiera te wpisy oraz ustawione cele.

## Dane

Wszystkie dane należą do jednego użytkownika i wszystkie są danymi osobowymi [DANE OSOBOWE]. Sama nazwa aplikacji ujawnia przyjmowanie leku, dlatego całość danych konta jest chroniona tak jak dane o zdrowiu. Pozycje bezpośrednio opisujące zdrowie są dodatkowo oznaczone [DANE OSOBOWE – zdrowie].

- **Konto:** adres e-mail Google [DANE OSOBOWE].
- **Przepis:** tytuł; rodzaj (z linku / ręczny); liczba porcji; składniki (ilość, jednostka, nazwa, tekst oryginalny); kroki w kolejności; zdjęcie; link do źródła i nazwa serwisu; ocena ze źródła i liczba opinii; wartości odżywcze na porcję (kcal, białko, tłuszcz, błonnik), każda z pochodzeniem: ze źródła / szacunkowe / wpisane ręcznie / brak danych; lista nierozpoznanych składników; własna ocena 1–5; daty ugotowań; tag „Na gorsze dni” [DANE OSOBOWE – zdrowie]; przypisane kolekcje własne; data dodania.
- **Ocena tolerancji przepisu:** dobrze / średnio / źle; objawy (nudności, zgaga, wzdęcia, inne z notatką) [DANE OSOBOWE – zdrowie].
- **Kolekcja własna:** nazwa, przypisane przepisy.
- **Ustawienia:** progi filtrów; cele dzienne białka i wody [DANE OSOBOWE – zdrowie]; wielkość szklanki; przypomnienie: włączone / wyłączone, dzień tygodnia, godzina [DANE OSOBOWE – zdrowie].
- **Zgoda na powiadomienia (etap 4):** osobno dla każdego urządzenia.
- **Zaufany serwis (etap 2):** adres, nazwa, aktywny / nieaktywny.
- **Plan tygodnia (etap 3):** tydzień, dzień, pora, przepis, liczba porcji.
- **Lista zakupów (etap 3):** tydzień; pozycje (nazwa, ilość, jednostka, czy własna, czy odhaczona).
- **Wpis dawki (etap 4):** data, dawka w mg, miejsce wkłucia, notatka [DANE OSOBOWE – zdrowie].
- **Wpis wagi i samopoczucia (etap 4):** data, waga w kg, samopoczucie 1–5, notatka [DANE OSOBOWE – zdrowie].
- **Wpis białka (etap 4):** data, ilość w g, źródło (nazwa przepisu i liczba porcji albo opis ręczny) [DANE OSOBOWE – zdrowie].
- **Wpis wody (etap 4):** data, ilość w ml [DANE OSOBOWE – zdrowie].

## Integracje zewnętrzne

- **Logowanie Google** (wymaganie właściciela): potwierdzenie tożsamości użytkownika.
- **Strony serwisów kulinarnych:** odczyt przepisu z wklejonego linku (etap 1) i wyszukiwanie przepisów w zaufanych serwisach (etap 2).
- **Źródło danych o wartościach odżywczych składników:** do szacowania wartości przepisu, gdy źródło ich nie podaje. Dostawcę wybiera architekt.
- **Powiadomienia push w przeglądarce / PWA** (wymaganie właściciela): przypomnienie o zastrzyku (etap 4).

Brak płatności, e-maili i SMS-ów.

## Wymagania niefunkcjonalne

- **Platforma (wymaganie właściciela):** aplikacja w przeglądarce, instalowalna jako PWA na telefonie. Projektowana najpierw pod telefon (od szerokości 360 px); działa też na komputerze. Obsługiwane przeglądarki: lista w S14.
- **Język (wymaganie właściciela):** interfejs i przepisy wyłącznie po polsku.
- **Skala:** jeden użytkownik, kolekcja do 1000 przepisów.
- **Wydajność:** przy 1000 przepisach czas od tapnięcia filtra, zmiany sortowania albo wpisania znaku w wyszukiwaniu do odświeżenia listy nie przekracza 1 sekundy na telefonie średniej klasy; odczyt przepisu z linku i wyszukiwanie w serwisach kończą się wynikiem albo komunikatem w czasie do 15 sekund.
- **Offline (wymaganie właściciela):** przeglądanie wszystkich zapisanych danych; zmiany wymagają internetu, z wyjątkiem odhaczania listy zakupów. Szczegóły w S14, S19, S20 i w scenariuszach etapu 4. Dane offline są dostępne tylko dla zalogowanego użytkownika i znikają z urządzenia po wylogowaniu, po usunięciu konta i po wygaśnięciu sesji.
- **Sesja (wymaganie właściciela):** wygasa po 30 dniach bez otwarcia aplikacji z internetem na danym urządzeniu.
- **Synchronizacja:** zmiana zapisana na jednym urządzeniu jest widoczna na drugim po otwarciu albo odświeżeniu aplikacji z internetem. Przy sprzecznych zmianach obowiązuje ta, która dotarła później.
- **Bezpieczeństwo:** żadne dane nie są dostępne bez zalogowania dozwolonym kontem; cała komunikacja jest szyfrowana; wszystkie dane użytkownika przechowywane poza jego urządzeniem są zaszyfrowane; przepisy i zdjęcia nie mają publicznych adresów; treść danych użytkownika nie trafia do logów ani do zewnętrznych narzędzi analitycznych; aplikacja nie zawiera reklam ani zewnętrznych skryptów śledzących.
- **RODO:** dane o zdrowiu to szczególna kategoria danych. Aplikacja zbiera tylko dane wymienione w sekcji „Dane”, daje eksport wszystkich danych i usunięcie konta (S16), nie przekazuje danych nikomu poza dostawcami niezbędnymi do działania. Po usunięciu konta dane znikają także z kopii zapasowych najpóźniej po 30 dniach.
- **Prawa autorskie:** pełna treść i zdjęcia cudzych przepisów są przechowywane wyłącznie do prywatnego użytku użytkownika; przy każdym takim przepisie widoczne jest źródło z linkiem. Aplikacja nie ma funkcji udostępniania treści przepisów.
- **Kopie zapasowe:** awaria nie powoduje utraty danych starszych niż 24 godziny. Weryfikowane procedurą odtworzenia, nie testem E2E.
- **Dostępność:** elementy dotykowe mają co najmniej 44 × 44 px; tekst kroków i składników w trybie gotowania ma co najmniej 22 px; kontrast tekstu jest zgodny z WCAG AA.
- **Komunikaty błędów:** przy każdym błędzie użytkownik widzi komunikat po polsku i możliwość ponowienia; nigdy nie widzi technicznej treści błędu.
- **Zestaw testowy:** zespół utrzymuje własne strony testowe, na których sprawdzane są kryteria odczytu i wyszukiwania: przepis „czytelna”, „bez oceny”, „bez liczby porcji”, „bez zdjęcia”, „bez składników”, „nie-przepis”, „z wartościami odżywczymi”, „z częścią wartości”, „niedostępna”; serwisy „przeszukiwalny”, „nieprzeszukiwalny”, „niedostępny”, „z ocenami w skali 0–10”; oraz zestaw danych testowych o składnikach z przepisem referencyjnym. Działanie z czterema serwisami z listy startowej jest sprawdzane ręcznie przy odbiorze etapów 1.2 i 2.

## Przypadki brzegowe i błędy

Każdy przypadek ma kryterium we wskazanym scenariuszu.

- **Link do strony wymagającej logowania, płatnej albo niebędącej przepisem:** komunikat i formularz ręczny z linkiem (S3).
- **Strona nie odpowiada albo tekst nie jest linkiem:** komunikat i możliwość poprawy (S3).
- **Źródło bez liczby porcji, oceny albo zdjęcia:** S2.
- **Składnik, którego nie da się rozbić na ilość, jednostkę i nazwę:** zostaje zapisany jako tekst i nie jest skalowany (S12); na liście zakupów występuje bez ilości (S20).
- **Wartości odżywczej nie da się ustalić:** „brak danych”, przepis nie przechodzi filtra dla tej wartości (S5, S6).
- **Utrata połączenia w trakcie zapisu:** komunikat, dane pozostają w formularzu (S4).
- **Sesja wygasła:** ekran logowania, po zalogowaniu powrót do otwieranego ekranu (S1).
- **Edycja tego samego przepisu na dwóch urządzeniach:** obowiązuje późniejszy zapis (S15).
- **Brak miejsca na dane offline albo przeglądarka bez pracy offline:** S14.
- **Przeglądarka bez blokady wygaszania ekranu:** S13.
- **Usunięcie przepisu obecnego w planerze:** przepis znika z planera po uprzedzeniu (S19).
- **Usunięcie przepisu obecnego we wpisach białka:** wpisy pozostają (S25).
- **Jeden z zaufanych serwisów nie odpowiada:** wyniki z pozostałych i informacja (S17).
- **Brak zgody na powiadomienia:** wyjaśnienie i baner w aplikacji (S23).
- **Serwis źródłowy zmienił albo usunął stronę:** zapisany przepis pozostaje w kolekcji bez zmian; link może nie działać. Aplikacja tego nie sprawdza.

## Poza zakresem

- Kalkulator kliknięć pena i jakiekolwiek wyliczanie albo podpowiadanie dawki. Odliczanie kliknięć w celu uzyskania dawki pośredniej jest niezgodne z instrukcją producenta i grozi błędem dawkowania; dawkę ustala lekarz.
- Porady medyczne i dietetyczne, w tym proponowanie celów białka, wody czy wagi.
- Przepisy generowane przez AI.
- Wielu użytkowników, rejestracja, współdzielenie konta, udostępnianie przepisów, wersja publiczna.
- Języki inne niż polski, tłumaczenie przepisów.
- Dodawanie i edycja danych offline, z jednym wyjątkiem: odhaczanie pozycji listy zakupów (S20). Dotyczy to także oznaczania „Ugotowane” i wpisów zdrowotnych.
- Dodatkowa blokada sekcji zdrowotnych (PIN, biometria).
- Przypomnienia e-mail i SMS, przypomnienia o piciu wody.
- Filtry pod Mounjaro na wynikach wyszukiwania w serwisach (działają po zapisie przepisu).
- Grupowanie listy zakupów według działów sklepu, przeliczanie jednostek, ceny, integracje ze sklepami.
- Własne pory posiłków w planerze.
- Własna lista miejsc wkłucia.
- Edycja wpisów białka i wody z poprzednich dni.
- Inne wartości odżywcze niż kalorie, białko, tłuszcz i błonnik.
- Automatyczne odświeżanie zapisanych przepisów i ocen ze źródła.
- Import danych z innych aplikacji oraz import z pliku eksportu.
- Aplikacje natywne w sklepach z aplikacjami.

## Etapy dostarczenia

Etapy 1–4 zatwierdził właściciel. Etap 1 jest podzielony na pionowe wycinki dostarczane po kolei; każdy daje działającą funkcję i wymaga wycinków poprzednich. Kryterium, które odwołuje się do funkcji z późniejszego wycinka, jest sprawdzane przy dostarczeniu tego późniejszego wycinka (wymienione niżej).

- **1.1 Logowanie i przepisy ręczne:** S1; S4; S15 (bez kryterium o przepisie z linku); z S6 lista kolekcji i pusta kolekcja. Użytkownik loguje się, dodaje przepis ręcznie, edytuje go, usuwa i widzi na telefonie i komputerze. Wartości odżywcze w tym wycinku są tylko wpisywane ręcznie; brakujące pokazują „—”.
- **1.2 Przepis z linku i wartości odżywcze:** S2, S3, S5; kryterium S15 o przepisie z linku.
- **1.3 Filtry pod Mounjaro, ugotowania i oceny:** pozostałe kryteria S6; S7, S8, S9, S10, S11.
- **1.4 Gotowanie i offline:** S12, S13, S14.
- **1.5 Moje dane:** S16.
- **2 Wyszukiwanie w zaufanych serwisach:** S17, S18.
- **3 Planer tygodnia i lista zakupów:** S19, S20.
- **4 Zdrowie**, w wycinkach:
  - **4.1 Dawki i rotacja:** S21, S22.
  - **4.2 Przypomnienie o zastrzyku:** S23. Wymaga 4.1.
  - **4.3 Waga i samopoczucie:** S24.
  - **4.4 Liczniki białka i wody:** S25.

Etapy 2, 3 i 4 wymagają całego etapu 1. Są od siebie niezależne i mogą być dostarczane w dowolnej kolejności. Wycinki 4.1, 4.3 i 4.4 są od siebie niezależne. Każdy etap rozszerza eksport z S16 o swoje dane (kryteria w S18, S20, S21, S24, S25).

## Założenia

### Decyzje właściciela z wywiadu

Dla porządku: poniższe rozstrzygnięcia pochodzą od właściciela, nie są założeniami analityka.

- Jeden użytkownik, PWA, tylko język polski, cztery etapy, zakres „poza zakresem” dotyczący dawek i AI.
- Miara sukcesu: gotowanie z aplikacji co najmniej 3 razy w tygodniu po miesiącu; przycisk „Ugotowane” z licznikiem tygodniowym.
- Logowanie Google, jeden adres ustawiony przy instalacji, sesja wygasa po 30 dniach bez używania.
- Nieczytelny link: zapis linku i formularz ręczny z odczytanymi polami.
- Tolerancja, tag „Na gorsze dni” i kolekcje własne w etapie 1.
- Wartości wyliczone oznaczone jako szacunkowe, z listą nierozpoznanych składników i ręczną poprawką; brak danych nie przechodzi filtra.
- Progi filtrów domyślne i edytowalne; wartości domyślne: białko ≥ 25 g, tłuszcz ≤ 15 g, błonnik ≥ 5 g, kalorie ≤ 400 kcal, mała porcja ≤ 300 kcal.
- Offline: przeglądanie, gotowanie i skalowanie; zmiany wymagają internetu; wyjątek: odhaczanie listy zakupów.
- Eksport wszystkich danych i usunięcie konta; bez dodatkowej blokady sekcji zdrowotnych.
- Planer ze stałymi porami; lista zakupów z sumowaniem, odhaczaniem i własnymi pozycjami.
- Sześć miejsc wkłucia z propozycją kolejnego; przypomnienie push w stały dzień i godzinę z jednym ponowieniem.
- Własne cele białka i wody; białko z przepisów oznaczonych jako zjedzone i ręcznie; woda przyciskiem.
- Wyszukiwanie: jedna lista sortowana według ocen, zapis jednym tapnięciem, filtry po zapisie; lista startowa czterech serwisów.
- Skale: własna ocena 1–5, tolerancja w trzech stopniach z objawami, samopoczucie 1–5.

### Doprecyzowania analityka

Właściciel nie odpowiedział na żadne pytanie „wybierz ty”. Poniższe szczegóły dopisał analityk, żeby kryteria dało się przetestować; właściciel nie był o nie pytany wprost. Merge PR oznacza ich akceptację.

1. „Ugotowane” nie działa offline (S14). Wynika to z decyzji „zmiany wymagają internetu”; skutek jest taki, że po gotowaniu bez zasięgu trzeba oznaczyć przepis później, inaczej nie wliczy się do miary sukcesu.
2. Licznik tygodniowy pokazuje też historię ostatnich 8 tygodni (S8). Bez historii nie da się sprawdzić miary sukcesu po miesiącu.
3. Ponowne wklejenie linku, który jest już w kolekcji, nie tworzy kopii; adresy porównujemy bez protokołu, „www”, końcowego ukośnika, parametrów i fragmentu (S2). Kopie zaśmiecałyby kolekcję i listę zakupów.
4. Liczba porcji jest obowiązkowa, w zakresie 0,5–99 co 0,5 (S2, S4, S12, S19). Od niej zależą wartości na porcję, skalowanie i lista zakupów.
5. Źródło podające tylko część wartości odżywczych: brakujące są szacowane osobno (S5). Dzięki temu filtry działają dla jak największej liczby przepisów.
6. Wartość wpisana ręcznie albo pochodząca ze źródła nie jest nadpisywana przy edycji składników (S5). Dane od człowieka i ze źródła są ważniejsze niż wyliczenie.
7. Kilka filtrów działa łącznie; wyszukiwanie w kolekcji ignoruje wielkość liter i polskie znaki; remisy w sortowaniu rozstrzyga data dodania; filtry nie są pamiętane po ponownym uruchomieniu (S6). To zachowania najbardziej przewidywalne na telefonie.
8. Dodatkowe sortowania i wyszukiwanie tekstowe w kolekcji (S6). Przy kilkudziesięciu przepisach bez nich trudno znaleźć konkretny przepis.
9. Skalowanie nie zmienia zapisanego przepisu ani wartości na porcję; ilości zaokrąglamy do jednego miejsca po przecinku (S12). Pół porcji dziś nie powinno zmieniać przepisu na stałe.
10. Progi liczbowe czytelności: tekst w trybie gotowania co najmniej 22 px, elementy dotykowe co najmniej 44 × 44 px (S13). Bez liczb „duży tekst” jest nietestowalny.
11. Obsługiwane przeglądarki: aktualne Chrome na Androidzie, Safari na iOS oraz Chrome, Safari, Firefox i Edge na komputerze (S14). To przeglądarki pokrywające typowe telefony i komputery.
12. Usunięcie konta wymaga wpisania słowa „USUŃ”; dane znikają z kopii zapasowych najpóźniej po 30 dniach (S16). Operacja jest nieodwracalna, a kopii nie da się wyczyścić natychmiast.
13. Wyszukiwanie w serwisach: najwyżej 10 wyników z serwisu, limit 15 sekund, oceny przeliczane na skalę 0–5 (S17). Limity utrzymują listę czytelną i porównywalną.
14. Nowy serwis, którego aplikacja nie potrafi przeszukać, nie jest dodawany do listy (S18). Serwis bez wyników na liście wprowadzałby w błąd.
15. Tydzień trwa od poniedziałku do niedzieli; lista zakupów dotyczy jednego tygodnia; domyślnie 1 porcja w planerze (S8, S19, S20). To polski zwyczaj i najprostszy model.
16. Składniki sumujemy tylko przy identycznej nazwie i jednostce; lista jest alfabetyczna (S20). Przeliczanie sztuk na gramy i zgadywanie, że „twaróg” to „twaróg półtłusty”, byłoby zgadywaniem.
17. Pole dawki jest zawsze puste i przyjmuje dowolną liczbę dodatnią w mg; miejsce wkłucia jest obowiązkowe (S21). Aplikacja nie może niczego sugerować w sprawie dawki, a bez miejsca rotacja nie działa.
18. Propozycja miejsca wkłucia: najpierw miejsca nieużyte w kolejności listy, potem użyte najdawniej; propozycja jest tekstem, nie zaznaczeniem (S22). To prosta reguła równomiernej rotacji, a wybór zostaje przy użytkowniku.
19. Przypomnienie: czas polski, doręczenie w ciągu 5 minut, brak powiadomienia, gdy dawka z tego dnia jest już zapisana, treść bez danych zdrowotnych i nazwy leku, baner w aplikacji do końca dnia ponowienia (S23). Powiadomienia bywają widoczne dla osób postronnych.
20. Jeden wpis wagi i samopoczucia na dzień; wykres wagi; samopoczucie 1 = bardzo źle, 5 = bardzo dobrze (S24). Dziennik bez trendu ma małą wartość.
21. Brak domyślnych celów białka i wody; szklanka domyślnie 250 ml; poprzednie dni liczników tylko do odczytu (S25). Cele powinny pochodzić od lekarza lub dietetyka, nie od aplikacji.
22. Wartości skali i wydajności: do 1000 przepisów, 1 sekunda na listę, 15 sekund na odczyt linku, utrata danych najwyżej z 24 godzin. Przyjęte jako rozsądne dla aplikacji jednej osoby.
23. Wszystkie dane konta chronimy jak dane o zdrowiu, a aplikacja nie przechowuje nazwy użytkownika z konta Google. Sama nazwa aplikacji ujawnia przyjmowanie leku; nazwa nie jest do niczego potrzebna.
24. Kryteria odczytu stron i wyszukiwania sprawdzamy na własnych stronach testowych, a działanie z prawdziwymi serwisami ręcznie przy odbiorze. Żywe serwisy zmieniają się i nie nadają się do powtarzalnych testów.

## Sekcje techniczne

> Uzupełnia architekt po zatwierdzeniu specyfikacji: architektura, model danych, kontrakty API, plan implementacji.
