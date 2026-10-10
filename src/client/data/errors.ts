export const OFFLINE_MESSAGE = 'Ta akcja wymaga połączenia z internetem';

const messages: Record<string, string> = {
  offline: OFFLINE_MESSAGE,
  network: 'Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem.',
  confirmation_mismatch: 'Wpisz słowo „USUŃ”, aby potwierdzić usunięcie konta.',
  validation: 'Dane są niepoprawne. Sprawdź je i spróbuj ponownie.',
  forbidden_origin: 'Nie udało się wykonać tej akcji. Odśwież aplikację i spróbuj ponownie.',
  push_unavailable:
    'Powiadomienia nie są jeszcze skonfigurowane na serwerze, więc to urządzenie ich nie dostanie.',
  not_found: 'Nie znaleziono tych danych.',
  conflict: 'Te dane zmieniły się w międzyczasie. Odśwież i spróbuj ponownie.',
  payload_too_large: 'Przesyłane dane są za duże.',
  invalid_url: 'To nie jest poprawny link',
  source_unavailable: 'Strona nie odpowiada',
  duplicate_source: 'Przepis z tego adresu już jest w Twojej kolekcji.',
  duplicate_site: 'Ten serwis jest już na Twojej liście.',
  not_searchable:
    'Nie da się przeszukać tego serwisu. Przepisy z niego nadal możesz dodawać, wklejając link do przepisu.',
  duplicate_name: 'Kolekcja o takiej nazwie już istnieje.',
  unsupported_image: 'Nie udało się odczytać zdjęcia. Wybierz plik JPEG, PNG lub WebP.',
};

/** Polish text for an API error code; technical details never reach the user. */
export function errorMessage(code: string): string {
  return messages[code] ?? 'Coś poszło nie tak. Spróbuj ponownie.';
}
