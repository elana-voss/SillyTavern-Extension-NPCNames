// What the data tools share: the database's load and save, the " | " lists they read, the new names
// they add from them (addNames), the change list they leave. Each tool runs once on a database of known counts, so a failed run is run again
// only if the database was not yet written.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { norm } from './name-lists.mjs';
import { foldName } from './overused.mjs';

const dbUrl = new URL('../data/name_database.tagged.json', import.meta.url);
const serialise = db => JSON.stringify(db, null, 2).replace(/\n/g, '\r\n');

/**
 * The database, after proving that saving it unchanged would give back the same bytes; with `at`, as it stood
 * at that commit (with the work tree's line ends, so the same proof holds), for a read pinned to the data it found.
 */
export function loadDb(at = null) {
    const raw = at ? execFileSync('git', ['cat-file', '--filters', `${at}:data/name_database.tagged.json`],
        { encoding: 'utf8', maxBuffer: 1 << 28, cwd: fileURLToPath(new URL('..', import.meta.url)) }) : readFileSync(dbUrl, 'utf8');
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

const csv = s => (s === '-' ? [] : s.split(','));

/**
 * The names of a names file's lines (readLines; first: 13 fields, last: 11, see namesFileText in
 * name-read.mjs) pushed onto `db`, each asserted to be of a known culture, not overused (`overused` holds
 * folded names) and not yet held in its culture by spelling key. Returns the change lines; nothing leaves.
 */
export function addNames(db, lines, overused, kinds = ['first', 'last']) {
    const cultures = new Set(db.first_names.map(e => e.language_ethnicity));
    const held = { first: new Set(db.first_names.map(e => `${e.language_ethnicity}|${norm(e.name)}`)),
        last: new Set(db.last_names.map(e => `${e.language_ethnicity}|${norm(e.name)}`)) };
    return lines.map(f => {
        const kind = f[0];
        assert.ok(kinds.includes(kind), `kind: ${f.join(' | ')}`);
        assert.equal(f.length, kind === 'first' ? 13 : 11, `fields: ${f.join(' | ')}`);
        const [, culture, name, gender, source] = f;
        assert.ok(cultures.has(culture), `no culture ${culture}`);
        assert.ok((kind === 'first' ? ['male', 'female', 'ambiguous'] : ['male', 'female', '-']).includes(gender), `gender of ${name}`);
        assert.ok(!overused.has(foldName(name)), `overused ${name}`);
        const key = `${culture}|${norm(name)}`;
        assert.ok(!held[kind].has(key), `already held: ${culture}/${name}`);
        held[kind].add(key);
        if (kind === 'first') {
            const [, , , , , ages, eras, roles, intelligence, allure, commonness, genres, themes] = f;
            db.first_names.push({
                name, gender, language_ethnicity: culture, mythology: null, race: 'human',
                age: csv(ages), era: csv(eras), role: csv(roles), intelligence, allure, commonness,
                genre: csv(genres), themes: csv(themes),
            });
            return `add first ${culture} ${name} ${gender} (${source})`;
        }
        const [, , , , , eras, roles, allure, commonness, genres, themes] = f;
        db.last_names.push({
            name, ...(gender === '-' ? {} : { gender }), language_ethnicity: culture, mythology: null, race: 'human',
            era: csv(eras), role: csv(roles), allure, commonness, genre: csv(genres), themes: csv(themes),
        });
        return `add last ${culture} ${name} ${gender === '-' ? 'no gender' : gender} (${source})`;
    });
}
