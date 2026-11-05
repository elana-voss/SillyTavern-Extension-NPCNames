// Milestone 6's one data change: the genders, spellings, near-duplicates and tags of
// tools/m6-tags.txt, the names that leave, and the leaked `sentinel_fields` key out everywhere.
// Each line went through the readers named in PLAN.md; nothing here invents a name.
// Writes the change list to logs/work/6-changes.txt.
//
// Run on the database as it stood before the milestone (main's): node tools/m6-apply-tags.mjs
// Its count asserts refuse a database already changed.
//
// Lines of the list, fields separated by " | "; list is first or last:
//   gender | culture | name | new gender
//   rename | list | culture | name | new name
//   merge  | list | culture | name | the name it goes into (keeps both's list tags and gender)
//   remove | list | culture | name | why
//   tag    | culture | name | field | new value (commonness, allure, intelligence; "a,b" for age, role)
import assert from 'node:assert/strict';
import { loadDb, readLines, saveWithChanges } from './db.mjs';

const db = loadDb();
assert.equal(db.first_names.length, 6903, 'first names');
assert.equal(db.last_names.length, 2627, 'surnames');

const lists = { first: db.first_names, last: db.last_names };
const lines = readLines('m6-tags.txt');
const ARRAY_FIELDS = new Set(['age', 'era', 'role', 'genre', 'themes']);
const SCALAR_FIELDS = new Set(['intelligence', 'allure', 'commonness']);

function find(list, culture, name) {
    const entry = list.find(e => e.language_ethnicity === culture && e.name === name);
    assert.ok(entry, `no ${culture}/${name}`);
    return entry;
}

function drop(list, entry) {
    list.splice(list.indexOf(entry), 1);
}

/** The worse spelling goes into the better one, whose single values stand; it adds its list tags, and a gender if the better has none. */
function merge(list, culture, name, into) {
    const gone = find(list, culture, name);
    const kept = find(list, culture, into);
    for (const k of ARRAY_FIELDS) {
        if (k in kept) kept[k] = [...new Set([...kept[k], ...gone[k]])];
    }
    if (kept.gender === 'ambiguous') kept.gender = gone.gender;
    drop(list, gone);
}

const count = { gender: 0, rename: 0, merge: 0, remove: 0, tag: 0 };
for (const line of lines) {
    const [kind, ...f] = line;
    if (kind === 'gender') {
        const [culture, name, gender] = f;
        assert.ok(['male', 'female', 'ambiguous'].includes(gender), `gender ${gender}`);
        const entry = find(db.first_names, culture, name);
        assert.notEqual(entry.gender, gender, `${culture}/${name} already ${gender}`);
        entry.gender = gender;
    } else if (kind === 'rename') {
        const [list, culture, name, to] = f;
        assert.ok(!lists[list].some(e => e.language_ethnicity === culture && e.name === to), `rename: ${culture}/${to} exists`);
        find(lists[list], culture, name).name = to;
    } else if (kind === 'merge') {
        merge(lists[f[0]], f[1], f[2], f[3]);
    } else if (kind === 'remove') {
        drop(lists[f[0]], find(lists[f[0]], f[1], f[2]));
    } else if (kind === 'tag') {
        const [culture, name, field, value] = f;
        const entry = find(db.first_names, culture, name);
        assert.ok(ARRAY_FIELDS.has(field) || SCALAR_FIELDS.has(field), `tag field ${field}`);
        entry[field] = ARRAY_FIELDS.has(field) ? value.split(',') : value;
    } else {
        assert.fail(`kind ${kind}`);
    }
    count[kind]++;
}

let sentinels = 0;
for (const entry of [...db.first_names, ...db.last_names]) {
    if ('sentinel_fields' in entry) {
        delete entry.sentinel_fields;
        sentinels++;
    }
}
assert.equal(sentinels, 5, 'sentinel_fields');

const out = saveWithChanges(db, 6, [...lines.map(l => l.join(' | ')), `sentinel_fields removed from ${sentinels} entries`]);
console.log(`first names ${db.first_names.length}, surnames ${db.last_names.length}; ${JSON.stringify(count)}; sentinel_fields ${sentinels}`);
console.log(out);
