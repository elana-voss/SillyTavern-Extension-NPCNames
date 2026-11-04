// The overused-name check of milestone 5: tools/overused-names.txt holds names that models of
// several vendors keep inventing; a new name on it does not enter, in any culture.
import { readFileSync } from 'node:fs';

/** Spelling variants of one name fold to one key: lower case, accents removed. */
export const foldName = name => name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** The folded names on the list; a line holds a name, lines starting with # say how it was made. */
export function loadOverused(url = new URL('overused-names.txt', import.meta.url)) {
    const lines = readFileSync(url, 'utf8').split(/\r?\n/);
    return new Set(lines.filter(l => l && !l.startsWith('#')).map(foldName));
}
