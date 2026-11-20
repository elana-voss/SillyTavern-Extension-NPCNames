// The overused-name check of milestone 5: tools/overused-names.txt holds names that models of
// several vendors keep inventing; a new name on it does not enter, in any culture.
import { readFileSync } from 'node:fs';
import { norm } from './name-lists.mjs';

/** The names on the list by their spelling key (name-lists.mjs `norm`); a line holds a name, lines starting with # say how it was made. */
export function loadOverused(url = new URL('overused-names.txt', import.meta.url)) {
    const lines = readFileSync(url, 'utf8').split(/\r?\n/);
    return new Set(lines.filter(l => l && !l.startsWith('#')).map(norm));
}
