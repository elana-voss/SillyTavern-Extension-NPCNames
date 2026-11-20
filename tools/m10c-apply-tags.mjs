// Milestone 10c's change, on main's database as milestone 10b2 left it: each decision of tools/m10c-tags.txt
// (tools/m10c-read.mjs) is applied by name-tags.mjs applyTags: tags by tagsFor; an unused name two readers put
// with another people moves there, or joins the same name held there (no name is lost); every human name's
// commonness follows its list's rank, or the readers where no list in its script has it (commonnessFor).
// Writes logs/work/10c-changes.txt and logs/work/m10c/classes.txt (changes per culture and kind); prints a summary.
//
// Run: node tools/m10c-apply-tags.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { loadDb, readLines, saveWithChanges } from './db.mjs';
import { loadLists } from './name-lists.mjs';
import { CULTURES } from './name-read.mjs';
import { applyTags, listRanks } from './name-tags.mjs';

const db = loadDb();
assert.deepEqual([db.first_names.length, db.last_names.length], [9819, 6208], 'runs on the database milestone 10b2 left');
const nd = loadLists();
const decisions = new Map(readLines('m10c-tags.txt').map(([kind, culture, name, used, periods, place, common]) =>
    [`${kind}|${culture}|${name}`, { used: used === '-' ? null : used === 'y', periods: periods === '-' ? '' : periods,
        place: place === '-' ? null : place, common: common === '-' ? null : common }]));
assert.equal(decisions.size, 8719, 'every human name held before milestone 10, once (6,198 first, 2,521 surnames)');

const changes = [], classes = new Map();
for (const kind of ['first', 'last']) {
    const { list, events } = applyTags(db[`${kind}_names`], kind, decisions, listRanks(nd, kind, Object.keys(CULTURES)));
    db[`${kind}_names`] = list;
    for (const { culture, what, line } of events) {
        changes.push(line);
        const k = `${kind}\t${culture}`;
        const c = classes.get(k) ?? classes.set(k, { tags: 0, common: 0, out: 0, in: 0 }).get(k);
        c[what]++;
    }
}

const rows = [...classes].sort(([a], [b]) => a.localeCompare(b)).map(([k, c]) => `${k}\t${c.tags}\t${c.common}\t${c.out}\t${c.in}`);
writeFileSync(new URL('../logs/work/m10c/classes.txt', import.meta.url), ['kind\tculture\ttags\tcommonness\tout\tin', ...rows].join('\n') + '\n');
const sum = w => [...classes.values()].reduce((n, c) => n + c[w], 0);
console.log(`tag changes ${sum('tags')}, commonness changed ${sum('common')}, moved or joined ${sum('out')} (joined ${changes.filter(l => l.includes('| joins ')).length})`);
console.log(`first names ${db.first_names.length}, surnames ${db.last_names.length}; table logs/work/m10c/classes.txt`);
console.log(saveWithChanges(db, '10c', changes));
