// Milestone 4's one data change and its measurement: yoruba and swahili relabelled whole,
// misfiled names moved by tools/m4-readings.txt where both readers gave the same answer; a
// surname's gender moves with it, gods are not read. Writes the change list and the table
// per changed culture to <tmp>/SillyTavern-Extension-NPCNames/4-changes.txt.
//
// Run on the database as it stood before the milestone (main's): node tools/m4-apply-cultures.mjs
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
assert.equal(db.first_names.length, 4283, 'first names');
assert.equal(db.last_names.length, 1794, 'surnames');

const RELABEL = { yoruba: 'ghanaian', swahili: 'ethiopian' };
const NEW_KEYS = ['ghanaian', 'ethiopian', 'romanian', 'baltic', 'albanian', 'azerbaijani', 'hungarian', 'fijian'];
const culturesOf = l => l.map(e => e.language_ethnicity);
const allowed = new Set([...culturesOf(db.first_names), ...culturesOf(db.last_names), ...NEW_KEYS]);
const key = (culture, name) => `${culture}|${name}`;
const firsts = new Map(db.first_names.map(e => [key(e.language_ethnicity, e.name), e]));
const lasts = new Map(db.last_names.map(e => [key(e.language_ethnicity, e.name), e]));
assert.equal(firsts.size, db.first_names.length, 'a first name twice in its culture');
assert.equal(lasts.size, db.last_names.length, 'a surname twice in its culture');

const lines = readFileSync(new URL('tools/m4-readings.txt', root), 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split(' | '));

// Where a line sends its name: a key, key+surname, or null when it stays.
function destination(from, claude, second) {
    const label = RELABEL[from];
    const agreed = claude === second && claude !== 'stays' ? claude : null;
    if (!label) return agreed;
    assert.equal(claude, label, `Claude's answer on a name of ${from}`);
    return agreed ?? label;
}

const asFirstOrLast = kind => (kind === 'first' ? firsts : lasts);
const moves = [];
const disagreed = [];
for (const [kind, from, name, claude, second, gender] of lines) {
    assert.ok(kind === 'first' || kind === 'last', `kind ${kind}`);
    const entry = asFirstOrLast(kind).get(key(from, name));
    assert.ok(entry, `${kind} name ${name} in ${from}`);
    assert.equal(entry.race, 'human', `${name} is read only if human`);
    const to = destination(from, claude, second);
    if (!to) {
        disagreed.push(`${name} [${kind}, ${from}]: Claude ${claude}, second reader ${second}; stays`);
        continue;
    }
    const [culture, surnamed] = to.split('+');
    assert.ok(allowed.has(culture), `destination ${culture} of ${name}`);
    assert.ok(!surnamed || (surnamed === 'surname' && kind === 'first'), `answer ${to} of ${name}`);
    moves.push({ kind, entry, from, culture, toLast: kind === 'last' || !!surnamed, gender, claude, second });
}
for (const [from] of Object.entries(RELABEL)) {
    for (const [kind, list] of [['first', db.first_names], ['last', db.last_names]]) {
        const read = moves.filter(m => m.kind === kind && m.from === from).length;
        assert.equal(read, list.filter(e => e.language_ethnicity === from).length, `${kind} names of ${from} all read`);
    }
}

const removeFirst = new Set();
const removeLast = new Set();
const addLast = [];
const changes = [];
for (const { kind, entry, from, culture, toLast, gender, claude, second } of moves) {
    const target = toLast ? lasts : firsts;
    const listed = `${entry.name} [${kind === 'first' && toLast ? 'first name to surname' : kind}]: ${from} -> ${culture}; Claude ${claude}, second reader ${second}`;
    if (target.has(key(culture, entry.name))) {
        (kind === 'first' ? removeFirst : removeLast).add(entry);
        changes.push(`${listed}; already there, merged`);
        continue;
    }
    if (kind === 'first' && toLast) {
        removeFirst.add(entry);
        const { name, age: _age, intelligence: _intelligence, gender: _gender, ...rest } = entry;
        const moved = { name, ...(gender ? { gender } : {}), ...rest, language_ethnicity: culture };
        addLast.push(moved);
        lasts.set(key(culture, name), moved);
        changes.push(`${listed}${gender ? `; gender ${gender}` : ''}`);
        continue;
    }
    entry.language_ethnicity = culture;
    target.set(key(culture, entry.name), entry);
    if (gender) {
        assert.equal(kind, 'last', `a gender on arrival belongs to a surname: ${entry.name}`);
        assert.ok(!('gender' in entry), `${entry.name} has a gender already`);
        const { name, ...rest } = entry;
        for (const k of Object.keys(entry)) delete entry[k];
        Object.assign(entry, { name, gender, ...rest });
    }
    changes.push(`${listed}${entry.gender && kind === 'last' ? `; gender ${entry.gender}` : ''}`);
}
db.first_names = db.first_names.filter(e => !removeFirst.has(e));
db.last_names = [...db.last_names.filter(e => !removeLast.has(e)), ...addLast];
writeFileSync(dbUrl, serialise(db));

const changed = new Set(moves.flatMap(m => [m.from, m.culture]));
const count = (list, values) => values.map(v => list.filter(e => (e.gender ?? 'none') === v).length).join('/');
const table = [...changed].sort().map(c => {
    const f = db.first_names.filter(e => e.language_ethnicity === c);
    const l = db.last_names.filter(e => e.language_ethnicity === c);
    const gods = f.filter(e => e.race === 'mythical').length;
    return `${c}: first ${f.length} (male/female/ambiguous ${count(f, ['male', 'female', 'ambiguous'])}; gods ${gods}), surnames ${l.length} (male/female/none ${count(l, ['male', 'female', 'none'])})`;
});
const short = NEW_KEYS.filter(c => !db.first_names.some(e => e.language_ethnicity === c) || !db.last_names.some(e => e.language_ethnicity === c));
const merged = changes.filter(c => c.endsWith('merged')).length;
const summary = [
    `Moved: ${moves.length - merged}; merged into an existing entry: ${merged}; first names made surnames: ${addLast.length}`,
    `Readers disagreed, stayed: ${disagreed.length}`,
    `New cultures lacking first names or surnames: ${short.join(', ') || 'none'}`,
    `First names now: ${db.first_names.length}; surnames now: ${db.last_names.length}`,
];
const dir = join(tmpdir(), 'SillyTavern-Extension-NPCNames');
mkdirSync(dir, { recursive: true });
const out = join(dir, '4-changes.txt');
writeFileSync(out, [
    '== Moved', ...changes.sort(),
    '', '== Readers disagreed', ...disagreed.sort(),
    '', '== Per changed culture', ...table,
    '', '== Summary', ...summary, '',
].join('\n'));
console.log(summary.join('\n'));
console.log(out);
