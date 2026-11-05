// What the data tools share: the database's load and save, the " | " lists they read, the change
// list they leave. Each tool runs once on a database of known counts, so a failed run is run again
// only if the database was not yet written.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dbUrl = new URL('../data/name_database.tagged.json', import.meta.url);
const serialise = db => JSON.stringify(db, null, 2).replace(/\n/g, '\r\n');

/** The database, after proving that saving it unchanged would give back the same bytes. */
export function loadDb() {
    const raw = readFileSync(dbUrl, 'utf8');
    const db = JSON.parse(raw);
    assert.equal(serialise(db), raw, 'the database format would not survive a rewrite');
    return db;
}

/** Lines to fields: " | " separates, blank lines and those starting with # are left out. */
export const parseLines = text => text
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split(' | '));

/** parseLines of a file in tools/. */
export const readLines = file => parseLines(readFileSync(new URL(file, import.meta.url), 'utf8'));

/**
 * Writes the change list to logs/work/<milestone>-changes.txt in the repo, then the
 * database, in that order: the tool's count asserts refuse a second run on a written database, so
 * the list must exist by then. Returns the list's path.
 */
export function saveWithChanges(db, milestone, changeLines) {
    const dir = new URL('../logs/work/', import.meta.url);
    mkdirSync(dir, { recursive: true });
    const out = new URL(`${milestone}-changes.txt`, dir);
    writeFileSync(out, changeLines.join('\n') + '\n');
    writeFileSync(dbUrl, serialise(db));
    return fileURLToPath(out);
}
