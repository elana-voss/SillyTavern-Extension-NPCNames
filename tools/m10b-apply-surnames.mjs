// Milestone 10b's one data change: the common surnames of tools/m10b-names.txt enter, each from
// name-dataset's rank lists and read by three readers (tools/m10b-read.mjs); nothing here invents a
// name and no name leaves. Writes the change list to logs/work/10b-changes.txt.
//
// Run on the database as it stood before the milestone (main's): node tools/m10b-apply-surnames.mjs
// Its count asserts refuse a database already changed.
//
// Lines of the list, fields separated by " | ", lists by ",", an empty list or no gender "-":
//   last | culture | name | gender | source | eras | roles | allure | commonness | genres | themes
import assert from 'node:assert/strict';
import { loadDb, readLines, saveWithChanges } from './db.mjs';
import { norm } from './name-lists.mjs';
import { foldName, loadOverused } from './overused.mjs';

const db = loadDb();
assert.equal(db.first_names.length, 9263, 'first names');
assert.equal(db.last_names.length, 2621, 'surnames');

const overused = loadOverused();
const list = s => (s === '-' ? [] : s.split(','));
const held = new Set(db.last_names.map(e => `${e.language_ethnicity}|${norm(e.name)}`));
const cultures = new Set(db.first_names.map(e => e.language_ethnicity));
const changes = [];

for (const f of readLines('m10b-names.txt')) {
    assert.equal(f.length, 11, `fields: ${f.join(' | ')}`);
    const [kind, culture, name, gender, source, eras, roles, allure, commonness, genres, themes] = f;
    assert.equal(kind, 'last');
    assert.ok(cultures.has(culture), `no culture ${culture}`);
    assert.ok(['male', 'female', '-'].includes(gender), `gender of ${name}`);
    assert.ok(!overused.has(foldName(name)), `overused ${name}`);
    const key = `${culture}|${norm(name)}`;
    assert.ok(!held.has(key), `already held: ${culture}/${name}`);
    held.add(key);
    db.last_names.push({
        name, ...(gender === '-' ? {} : { gender }), language_ethnicity: culture, mythology: null, race: 'human',
        era: list(eras), role: list(roles), allure, commonness, genre: list(genres), themes: list(themes),
    });
    changes.push(`add last ${culture} ${name} ${gender === '-' ? 'no gender' : gender} (${source})`);
}

saveWithChanges(db, '10b', changes);
