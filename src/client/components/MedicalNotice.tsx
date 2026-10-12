/** The notice every screen of the health stage carries. */
export const MEDICAL_NOTICE =
  'Aplikacja nie jest wyrobem medycznym i nie zastępuje zaleceń lekarza. Dawkę ustala lekarz.';

export function MedicalNotice() {
  return <p className="rounded-md bg-health-soft p-3 text-on-health-soft">{MEDICAL_NOTICE}</p>;
}
