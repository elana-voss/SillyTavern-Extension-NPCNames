// Milestone 10a's one data change: the common first names of tools/m10a-names.txt enter, each from
// name-dataset's rank lists and read by three readers (tools/m10a-read.mjs); nothing here invents a
// name and no name leaves. Writes the change list to logs/work/10a-changes.txt.
//
// Run on the database as it stood before the milestone (main's): node tools/m10a-apply-first-names.mjs
// Its count asserts refuse a database already changed.
//
// Lines of the list, fields separated by " | ", lists by ",", an empty list "-":
//   first | culture | name | gender | source | ages | eras | roles | intelligence | allure | commonness | genres | themes
import assert from 'node:assert/strict';
import { addNames, loadDb, readLines, saveWithChanges } from './db.mjs';
import { loadOverused } from './overused.mjs';

const db = loadDb();
assert.equal(db.first_names.length, 6858, 'first names');
assert.equal(db.last_names.length, 2621, 'surnames');

const changes = addNames(db, readLines('m10a-names.txt'), loadOverused());
saveWithChanges(db, '10a', changes);
