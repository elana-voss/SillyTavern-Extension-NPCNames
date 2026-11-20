// Milestone 5's one data change: the new names of tools/m5-names.txt, the style tags on names
// new and present, the franchise dragons out. Nothing here invents a name: each line of the list
// names its public source and went through two readers before it was stored there.
// Writes the change list to logs/work/5-changes.txt.
//
// Run on the database as it stood before the milestone (main's): node tools/m5-apply-names.mjs
// Its count asserts refuse a database already changed.
//
// Lines of the list, fields separated by " | ", lists by ",", an empty list or no gender "-":
//   first | culture | name | gender | source | ages | eras | roles | intelligence | allure | commonness | genres | themes
//   last | culture | name | gender | source | eras | roles | allure | commonness | genres | themes
//   tag | culture | name | field | value
//   remove | culture | name | why
import assert from 'node:assert/strict';
import { loadDb, readLines, saveWithChanges } from './db.mjs';
import { norm } from './name-lists.mjs';
import { loadOverused } from './overused.mjs';

const db = loadDb();
assert.equal(db.first_names.length, 4266, 'first names');
assert.equal(db.last_names.length, 1809, 'surnames');

const overused = loadOverused();
const RACE = { fantasyDragon: 'dragon' };
const TAG_FIELDS = new Set(['age', 'era', 'genre', 'themes']);
const list = s => (s === '-' ? [] : s.split(','));
const key = (culture, name) => `${culture}|${norm(name)}`;

const lines = readLines('m5-names.txt');

// Removals first, so that a replacement of the same name may enter.
for (const [kind, culture, name] of lines) {
    if (kind !== 'remove') continue;
    const at = db.first_names.findIndex(e => e.language_ethnicity === culture && e.name === name);
    assert.ok(at >= 0, `remove: no ${culture}/${name}`);
    db.first_names.splice(at, 1);
}

const firsts = new Map(db.first_names.map(e => [`${e.language_ethnicity}|${e.name}`, e]));
const foldedFirst = new Set(db.first_names.map(e => key(e.language_ethnicity, e.name)));
const foldedLast = new Set(db.last_names.map(e => key(e.language_ethnicity, e.name)));
const added = { first: new Map(), last: new Map() }; // culture -> {male, female, none}
const count = (kind, culture, gender) => {
    const m = added[kind].get(culture) ?? {};
    m[gender] = (m[gender] ?? 0) + 1;
    added[kind].set(culture, m);
};

for (const [kind, culture, name, gender, , ...f] of lines) {
    if (kind !== 'first' && kind !== 'last') continue;
    assert.ok(!overused.has(norm(name)), `on the overused list: ${name}`);
    const folded = kind === 'first' ? foldedFirst : foldedLast;
    assert.ok(!folded.has(key(culture, name)), `twice in ${culture}: ${name}`);
    folded.add(key(culture, name));
    if (kind === 'first') {
        const [ages, eras, roles, intelligence, allure, commonness, genres, themes] = f;
        const entry = { name, gender, language_ethnicity: culture, mythology: null, race: RACE[culture] ?? 'human',
            age: list(ages), era: list(eras), role: list(roles), intelligence, allure, commonness, genre: list(genres), themes: list(themes) };
        db.first_names.push(entry);
        firsts.set(`${culture}|${name}`, entry);
    } else {
        const [eras, roles, allure, commonness, genres, themes] = f;
        const entry = { name };
        if (gender !== '-') entry.gender = gender;
        Object.assign(entry, { language_ethnicity: culture, mythology: null, race: 'human',
            era: list(eras), role: list(roles), allure, commonness, genre: list(genres), themes: list(themes) });
        db.last_names.push(entry);
    }
    count(kind, culture, gender);
}

const tagged = {};
for (const [kind, culture, name, field, value] of lines) {
    if (kind !== 'tag') continue;
    assert.ok(TAG_FIELDS.has(field), `tag field ${field}`);
    const entry = firsts.get(`${culture}|${name}`);
    assert.ok(entry, `tag: no ${culture}/${name}`);
    if (entry[field].includes(value)) continue;
    entry[field].push(value);
    tagged[value] = (tagged[value] ?? 0) + 1;
}

const onList = list_ => list_.filter(e => overused.has(norm(e.name))).length;
const out = saveWithChanges(db, 5, lines.map(l => l.join(' | ')));

const firstAdded = [...added.first.values()].reduce((n, m) => n + Object.values(m).reduce((a, b) => a + b, 0), 0);
const lastAdded = [...added.last.values()].reduce((n, m) => n + Object.values(m).reduce((a, b) => a + b, 0), 0);
console.log(`first names ${db.first_names.length} (+${firstAdded}), surnames ${db.last_names.length} (+${lastAdded})`);
console.log(`removed ${lines.filter(l => l[0] === 'remove').length}, tags ${JSON.stringify(tagged)}`);
console.log(`present names on the overused list, kept: ${onList(db.first_names)} first, ${onList(db.last_names)} surnames`);
console.log(out);
