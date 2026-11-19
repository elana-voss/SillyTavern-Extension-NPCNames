// Milestone 10c's change, on main's database as milestone 10b2 left it: each decision of tools/m10c-tags.txt
// (tools/m10c-read.mjs) sets its names' age, era and genre (name-tags.mjs tagsFor); an unused name two readers put
// with another people moves there, or joins the same name held there (no name is lost); every human name's
// commonness follows its list's rank, or the readers where no list in its script has it (commonnessFor).
// Writes logs/work/10c-changes.txt and logs/work/m10c/classes.txt (changes per culture and kind); prints a summary.
//
// Run: node tools/m10c-apply-tags.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { loadDb, readLines, saveWithChanges } from './db.mjs';
import { loadLists, norm } from './name-lists.mjs';
import { CULTURES } from './name-read.mjs';
import { commonnessFor, listRanks, tagsFor } from './name-tags.mjs';

const db = loadDb();
assert.deepEqual([db.first_names.length, db.last_names.length], [9819, 6194], 'runs on the database milestone 10b2 left');
const nd = loadLists();
const decisions = new Map(readLines('m10c-tags.txt').map(([kind, culture, name, used, periods, place, common]) =>
    [`${kind}|${culture}|${name}`, { used: used === '-' ? null : used === 'y', periods: periods === '-' ? '' : periods,
        place: place === '-' ? null : place, common: common === '-' ? null : common }]));
assert.equal(decisions.size, 8819, 'every human name held before milestone 10, once');

const changes = [], classes = new Map();
const count = (kind, culture, what) => {
    const k = `${kind}\t${culture}`;
    const c = classes.get(k) ?? classes.set(k, { tags: 0, common: 0, out: 0, in: 0 }).get(k);
    c[what]++;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const kind of ['first', 'last']) {
    const list = db[`${kind}_names`];
    const ranks = listRanks(nd, kind, Object.keys(CULTURES));
    const held = new Set(list.map(e => `${e.language_ethnicity}|${norm(e.name)}`));
    const gone = new Set();
    for (const e of list) {
        if (e.race !== 'human') continue;
        const d = decisions.get(`${kind}|${e.language_ethnicity}|${e.name}`);
        const was = e.language_ethnicity;
        if (d && d.used === false && d.place in CULTURES && d.place !== was) {
            const target = `${d.place}|${norm(e.name)}`;
            if (held.has(target)) {
                gone.add(e);
                changes.push(`${kind} | ${was} | ${e.name} | joins ${d.place}`);
                count(kind, was, 'out');
                continue;
            }
            held.add(target);
            e.language_ethnicity = d.place;
            changes.push(`${kind} | ${was} | ${e.name} | moves to ${d.place}`);
            count(kind, was, 'out');
            count(kind, d.place, 'in');
            continue;
        }
        if (d) {
            const t = tagsFor(e, d);
            const diff = Object.entries(t).filter(([k, v]) => !same(e[k] ?? [], v));
            for (const [k, v] of diff) {
                changes.push(`${kind} | ${was} | ${e.name} | ${k} ${(e[k] ?? []).join(',') || '-'} -> ${v.join(',') || '-'}`);
                e[k] = v;
            }
            if (diff.length) count(kind, was, 'tags');
        }
        const c = commonnessFor(e, ranks, d?.common ?? null);
        if (c !== e.commonness) {
            changes.push(`${kind} | ${was} | ${e.name} | commonness ${e.commonness} -> ${c}`);
            e.commonness = c;
            count(kind, was, 'common');
        }
    }
    db[`${kind}_names`] = list.filter(e => !gone.has(e));
}

const rows = [...classes].sort(([a], [b]) => a.localeCompare(b)).map(([k, c]) => `${k}\t${c.tags}\t${c.common}\t${c.out}\t${c.in}`);
writeFileSync(new URL('../logs/work/m10c/classes.txt', import.meta.url), ['kind\tculture\ttags\tcommonness\tout\tin', ...rows].join('\n') + '\n');
const sum = w => [...classes.values()].reduce((n, c) => n + c[w], 0);
console.log(`entries with tags changed ${sum('tags')}, commonness changed ${sum('common')}, moved or joined ${sum('out')} (joined ${changes.filter(l => l.includes('| joins ')).length})`);
console.log(`first names ${db.first_names.length}, surnames ${db.last_names.length}; table logs/work/m10c/classes.txt`);
console.log(saveWithChanges(db, '10c', changes));
