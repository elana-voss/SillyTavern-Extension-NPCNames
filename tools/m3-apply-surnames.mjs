// Milestone 3's one data change: a gender on the surnames of four cultures, non-surnames out
// of the surnames by tools/m3-readings.txt, Mongolian surnames gone, surnames out of the
// Chinese first names. Writes the change list to
// <tmp>/SillyTavern-Extension-NPCNames/3-changes.txt.
//
// Run once on the database as it stood before the milestone: node tools/m3-apply-surnames.mjs
// Its count asserts refuse a database already changed.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const dbUrl = new URL('data/name_database.tagged.json', root);
const raw = readFileSync(dbUrl, 'utf8');
const db = JSON.parse(raw);
const serialise = d => JSON.stringify(d, null, 2).replace(/\n/g, '\r\n');
assert.equal(serialise(db), raw, 'the database format would not survive a rewrite');
assert.equal(db.first_names.length, 4290, 'first names');
assert.equal(db.last_names.length, 1948, 'surnames');
assert.ok(db.last_names.every(e => !('gender' in e)), 'a surname already has a gender');

const GENDERED = ['slavicPolish', 'slavicRussian', 'slavicOther', 'icelandic'];
const REMOVERS = new Set(['given', 'word', 'place', 'fragment']);
const LAST_VERDICTS = new Set([...REMOVERS, 'surname', 'unsure']);
const FIRST_VERDICTS = new Set(['given', 'surname', 'unsure']);
const lines = readFileSync(new URL('tools/m3-readings.txt', root), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split(' | '));

const key = (culture, name) => `${culture}|${name}`;
const surnames = new Map(db.last_names.map(e => [key(e.language_ethnicity, e.name), e]));
const firsts = new Map(db.first_names.map(e => [key(e.language_ethnicity, e.name), e]));
assert.equal(surnames.size, db.last_names.length, 'a surname twice in its culture');

const removeLast = new Map(); // entry -> why
const removeFirst = new Map();
const undecided = [];
const genders = new Map();
for (const [kind, culture, name, a, b] of lines) {
    if (kind === 'last') {
        assert.ok(LAST_VERDICTS.has(a) && LAST_VERDICTS.has(b), `verdict of ${name}`);
        const e = surnames.get(key(culture, name));
        assert.ok(e, `surname ${name} in ${culture}`);
        if (REMOVERS.has(a) && REMOVERS.has(b)) removeLast.set(e, a === b ? a : `${a}, second reader ${b}`);
        else if (a !== b) undecided.push(`${name} [surname, ${culture}]: Claude ${a}, second reader ${b}; unchanged`);
    } else if (kind === 'first') {
        assert.ok(FIRST_VERDICTS.has(a) && FIRST_VERDICTS.has(b), `verdict of ${name}`);
        const e = firsts.get(key(culture, name));
        assert.ok(e, `first name ${name} in ${culture}`);
        if (a === 'surname' && b === 'surname') removeFirst.set(e, 'a surname filed as a first name');
        else if (a !== b) undecided.push(`${name} [first name, ${culture}]: Claude ${a}, second reader ${b}; unchanged`);
    } else {
        assert.equal(kind, 'gender', `kind ${kind}`);
        assert.ok(['male', 'female', 'none'].includes(a), `gender of ${name}`);
        assert.ok(surnames.has(key(culture, name)), `gendered surname ${name} in ${culture}`);
        genders.set(key(culture, name), a);
    }
}

const mongolian = db.last_names.filter(e => e.language_ethnicity === 'mongolian');
assert.equal(mongolian.length, 50, 'Mongolian surnames');
for (const e of mongolian) removeLast.set(e, 'Mongolian gets no surname');

// Every surname of the four cultures that stays is read for gender, and only those.
const staying = db.last_names.filter(e => GENDERED.includes(e.language_ethnicity) && !removeLast.has(e));
assert.deepEqual(
    [...genders.keys()].sort(),
    staying.map(e => key(e.language_ethnicity, e.name)).sort(),
    'gender readings against the surnames that stay',
);

const changes = [];
db.last_names = db.last_names.filter(e => !removeLast.has(e)).map(e => {
    const gender = genders.get(key(e.language_ethnicity, e.name));
    if (!gender || gender === 'none') return e;
    changes.push(`${e.name} [${e.language_ethnicity}]: no gender -> ${gender}; read by ending`);
    const { name, ...rest } = e;
    return { name, gender, ...rest };
});
db.first_names = db.first_names.filter(e => !removeFirst.has(e));
writeFileSync(dbUrl, serialise(db));

const deleted = [
    ...[...removeLast].map(([e, why]) => `${e.name} [surname, ${e.language_ethnicity}]: deleted; ${why}`),
    ...[...removeFirst].map(([e, why]) => `${e.name} [first name, ${e.language_ethnicity}]: deleted; ${why}`),
];
const gendered = GENDERED.map(c => {
    const list = db.last_names.filter(e => e.language_ethnicity === c);
    const n = g => list.filter(e => (e.gender ?? 'none') === g).length;
    return `${c}: male ${n('male')}, female ${n('female')}, no gender ${n('none')}`;
});
const summary = [
    ...gendered,
    `Surnames deleted: ${removeLast.size} (Mongolian ${mongolian.length}); first names deleted: ${removeFirst.size}`,
    `Readers disagreed: ${undecided.length}`,
    `First names now: ${db.first_names.length}; surnames now: ${db.last_names.length}`,
];
const dir = join(tmpdir(), 'SillyTavern-Extension-NPCNames');
mkdirSync(dir, { recursive: true });
const out = join(dir, '3-changes.txt');
writeFileSync(out, [
    '== Gender', ...changes.sort(),
    '', '== Deleted', ...deleted.sort(),
    '', '== Readers disagreed', ...undecided.sort(),
    '', '== Summary', ...summary, '',
].join('\n'));
console.log(summary.join('\n'));
console.log(out);
