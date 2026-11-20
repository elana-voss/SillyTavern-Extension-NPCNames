// Milestone 10b's one data change: the common surnames of tools/m10b-names.txt enter, each from
// name-dataset's rank lists and read by three readers (tools/m10ab-read.mjs last); nothing here invents a
// name and no name leaves. Writes the change list to logs/work/10b-changes.txt.
//
// Run on the database as it stood before the milestone (main's): node tools/m10b-apply-surnames.mjs
// Its count asserts refuse a database already changed.
//
// Lines of the list, fields separated by " | ", lists by ",", an empty list or no gender "-":
//   last | culture | name | gender | source | eras | roles | allure | commonness | genres | themes
import assert from 'node:assert/strict';
import { addNames, loadDb, readLines, saveWithChanges } from './db.mjs';
import { loadOverused } from './overused.mjs';

const db = loadDb();
assert.equal(db.first_names.length, 9263, 'first names');
assert.equal(db.last_names.length, 2621, 'surnames');

const changes = addNames(db, readLines('m10b-names.txt'), loadOverused(), ['last']);
saveWithChanges(db, '10b', changes);
