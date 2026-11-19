// Milestone 10b2's one data change: the common first names and surnames of tools/m10b2-names.txt enter,
// each from Wikidata's counts of the people bearing it and read by three readers (tools/m10b2-read.mjs);
// nothing here invents a name and no name leaves. Writes the change list to logs/work/10b2-changes.txt.
//
// Run on the database as it stood before the milestone (main's): node tools/m10b2-apply-names.mjs
// Its count asserts refuse a database already changed. The lines' fields: db.mjs addNames.
import assert from 'node:assert/strict';
import { addNames, loadDb, readLines, saveWithChanges } from './db.mjs';
import { loadOverused } from './overused.mjs';

const db = loadDb();
assert.equal(db.first_names.length, 9263, 'first names');
assert.equal(db.last_names.length, 5610, 'surnames');
const changes = addNames(db, readLines('m10b2-names.txt'), loadOverused());
saveWithChanges(db, '10b2', changes);
