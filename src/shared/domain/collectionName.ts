import { COLLECTION_NAME_MAX } from '../contracts/collection';

export type CollectionNameProblem = 'empty' | 'too_long' | 'duplicate';

/** The name as stored: trimmed, inner runs of whitespace collapsed to one space. */
export const cleanCollectionName = (name: string): string => name.trim().replace(/\s+/g, ' ');

/** Key for the uniqueness check: the cleaned name in lower case. */
export const collectionNameKey = (name: string): string =>
  cleanCollectionName(name).toLocaleLowerCase('pl-PL');

/**
 * Checks a name for a new or renamed own collection (S11). `others` are the names of the other
 * collections; the comparison ignores letter case.
 */
export function checkCollectionName(
  name: string,
  others: readonly string[],
): { ok: true; name: string } | { ok: false; problem: CollectionNameProblem } {
  const cleaned = cleanCollectionName(name);
  if (cleaned === '') return { ok: false, problem: 'empty' };
  if (cleaned.length > COLLECTION_NAME_MAX) return { ok: false, problem: 'too_long' };
  const key = collectionNameKey(cleaned);
  if (others.some((other) => collectionNameKey(other) === key)) {
    return { ok: false, problem: 'duplicate' };
  }
  return { ok: true, name: cleaned };
}
