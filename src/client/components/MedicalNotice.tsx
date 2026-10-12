/** The notice every screen of the health stage carries. */
export const MEDICAL_NOTICE =
  'Aplikacja nie jest wyrobem medycznym i nie zastępuje zaleceń lekarza. Dawkę ustala lekarz.';

export function MedicalNotice() {
  return <p className="rounded-lg bg-surface-muted p-3 text-ink">{MEDICAL_NOTICE}</p>;
}
