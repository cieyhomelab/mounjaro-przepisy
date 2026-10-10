/** The notice every screen of the health stage carries. */
export const MEDICAL_NOTICE =
  'Aplikacja nie jest wyrobem medycznym i nie zastępuje zaleceń lekarza. Dawkę ustala lekarz.';

export function MedicalNotice() {
  return <p className="rounded-lg bg-neutral-100 p-3 text-neutral-900">{MEDICAL_NOTICE}</p>;
}
