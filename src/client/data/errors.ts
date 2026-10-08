export const OFFLINE_MESSAGE = 'Ta akcja wymaga połączenia z internetem';

const messages: Record<string, string> = {
  offline: OFFLINE_MESSAGE,
  network: 'Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem.',
  validation: 'Dane są niepoprawne. Sprawdź je i spróbuj ponownie.',
  forbidden_origin: 'Nie udało się wykonać tej akcji. Odśwież aplikację i spróbuj ponownie.',
  not_found: 'Nie znaleziono tych danych.',
  conflict: 'Te dane zmieniły się w międzyczasie. Odśwież i spróbuj ponownie.',
  payload_too_large: 'Przesyłane dane są za duże.',
  unsupported_image: 'Nie udało się odczytać zdjęcia. Wybierz plik JPEG, PNG lub WebP.',
};

/** Polish text for an API error code; technical details never reach the user. */
export function errorMessage(code: string): string {
  return messages[code] ?? 'Coś poszło nie tak. Spróbuj ponownie.';
}
