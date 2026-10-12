/** The notice every screen of the health stage carries. */
export const MEDICAL_NOTICE =
  'Aplikacja nie jest wyrobem medycznym i nie zastępuje zaleceń lekarza. Dawkę ustala lekarz.';

/** Neutral on the culinary screens; the health palette comes from `html[data-area='health']` (styles.css). */
export function MedicalNotice() {
  return (
    <p className="medical-notice rounded-lg bg-neutral-100 p-3 text-neutral-900">
      {MEDICAL_NOTICE}
    </p>
  );
}
