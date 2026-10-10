import { INJECTION_SITES, type DoseEntry, type InjectionSite } from '../contracts/dose';
import { formatCookedOn } from './cookStats';

export const SITE_LABELS: Record<InjectionSite, string> = {
  abdomen_left: 'brzuch lewa strona',
  abdomen_right: 'brzuch prawa strona',
  thigh_left: 'udo lewe',
  thigh_right: 'udo prawe',
  arm_left: 'ramię lewe',
  arm_right: 'ramię prawe',
};

type Dated = Pick<DoseEntry, 'date' | 'createdAt' | 'id'>;

/** Newest day first; on one day the entry added later comes first. */
export const compareDoseEntries = (a: Dated, b: Dated) =>
  b.date.localeCompare(a.date) ||
  b.createdAt.localeCompare(a.createdAt) ||
  b.id.localeCompare(a.id);

/** The entries of the journal in the order it shows them. */
export const sortDoseEntries = <T extends Dated>(entries: readonly T[]): T[] =>
  [...entries].sort(compareDoseEntries);

export type SiteSuggestion = {
  /** The latest injection: where and on which day. */
  last: { site: InjectionSite; date: string };
  /** The site to use next, a suggestion only. */
  site: InjectionSite;
};

/**
 * The site after the entries (S22): the first site of the list that was never used, else the one
 * whose latest use is the oldest. Null for an empty journal.
 */
export function suggestSite(
  entries: readonly Pick<DoseEntry, 'date' | 'site' | 'createdAt' | 'id'>[],
): SiteSuggestion | null {
  const [latest] = sortDoseEntries(entries);
  if (!latest) return null;
  const lastUse = new Map<InjectionSite, string>();
  for (const entry of entries) {
    const known = lastUse.get(entry.site);
    if (known === undefined || entry.date > known) lastUse.set(entry.site, entry.date);
  }
  const unused = INJECTION_SITES.find((site) => !lastUse.has(site));
  let site: InjectionSite = unused ?? INJECTION_SITES[0];
  if (!unused) {
    for (const candidate of INJECTION_SITES) {
      // Strictly older only, so the earlier site of the list wins a tie.
      if ((lastUse.get(candidate) ?? '') < (lastUse.get(site) ?? '')) site = candidate;
    }
  }
  return { last: { site: latest.site, date: latest.date }, site };
}

/** "2,5" for a dose of 2.5 mg. */
export const formatDose = (doseMg: number) => String(doseMg).replace('.', ',');

/** "9 października 2026" for `2026-10-09`. */
export const formatDoseDay = formatCookedOn;

const DOSE_PATTERN = /^\d+(?:[.,]\d{1,3})?$/;

/** The dose typed in the form (comma or dot), or null when it is not a number. */
export function parseDoseInput(text: string): number | null {
  const trimmed = text.trim();
  if (!DOSE_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}
