// Milestone 2's one data change: gods to `race: mythical`, handles to the culture
// `cyberpunkHandle`, entries that name nothing deleted. Reads tools/m2-readings.txt
// (one line per name read by Claude and a second reader; a reading changes a name only
// where both agree) and writes the change list to
// <tmp>/SillyTavern-Extension-NPCNames/2-changes.txt.
//
// Run once on the database as it stood before the milestone: node tools/m2-apply-names.mjs
// Its count asserts refuse a database already changed.
import assert from 'node:assert/strict';
import { loadDb, readLines, saveWithChanges } from './db.mjs';

const db = loadDb();

const first = db.first_names;
const lastCount = db.last_names.length;
const isHandle = e => e.genre.includes('cyberpunk');
const isAmbAncient = e => e.gender === 'ambiguous' && e.era.includes('ancient');
const open = first.filter(e => !e.mythology && e.race === 'human' && !isHandle(e));
const count = (list, expected, what) => assert.equal(list.length, expected, what);
const withMythology = first.filter(e => e.mythology);
const handles = first.filter(isHandle);
count(first, 4339, 'first names');
count(db.last_names, 1950, 'surnames');
count(withMythology, 165, 'names with a mythology');
assert.ok(withMythology.every(e => e.race === 'human'));
count(handles, 100, 'handles');
assert.ok(handles.every(e => e.language_ethnicity === 'english'));

const ruleAncient = open.filter(e => isAmbAncient(e) && e.language_ethnicity !== 'english');
count(ruleAncient, 297, 'ambiguous ancient outside English');
const groups = {
    'english-ancient': open.filter(e => isAmbAncient(e) && e.language_ethnicity === 'english'),
    'other-ancient': open.filter(e => e.gender !== 'ambiguous' && e.era.includes('ancient')),
    'english-ambiguous': open.filter(e => e.gender === 'ambiguous' && !e.era.includes('ancient')
        && e.language_ethnicity === 'english'),
    mayan: open.filter(e => e.language_ethnicity === 'mayan' && !e.era.includes('ancient')),
};
count(groups['english-ancient'], 46, 'English ambiguous ancient');
count(groups['other-ancient'], 24, 'other ancient');
count(groups['english-ambiguous'], 79, 'English ambiguous');
count(groups.mayan, 92, 'Mayan not ancient');

const VERDICTS = new Set(['god', 'person', 'not']);
const readings = readLines('m2-readings.txt').map(fields => {
    const [list, culture, name, group, claude, second, why = 'names nothing'] = fields;
    assert.ok(VERDICTS.has(claude) && VERDICTS.has(second), `verdict in: ${fields.join(' | ')}`);
    return { list, culture, name, group, claude, second, why };
});
for (const [group, entries] of Object.entries(groups)) {
    const read = readings.filter(r => r.group === group).map(r => r.name).sort();
    assert.deepEqual(read, entries.map(e => e.name).sort(), `reading list of ${group}`);
}

const findEntry = r => {
    const pool = r.list === 'last' ? db.last_names : first;
    const hits = pool.filter(e => e.name === r.name && e.language_ethnicity === r.culture);
    assert.equal(hits.length, 1, `${r.list} name ${r.name} in ${r.culture}`);
    return hits[0];
};

const toGod = new Map(); // entry -> why
for (const e of withMythology) toGod.set(e, `has the mythology ${e.mythology}`);
for (const e of ruleAncient) toGod.set(e, 'ambiguous and ancient outside English');

const toDelete = new Set();
const deleted = [];
const undecided = [];
for (const r of readings) {
    const entry = findEntry(r);
    if (r.claude !== r.second) {
        const outcome = toGod.has(entry) ? 'stays under the rule: race mythical' : 'unchanged';
        undecided.push(`${r.name} [${r.culture}]: Claude ${r.claude}, second reader ${r.second}; ${outcome}`);
    } else if (r.claude === 'not') {
        toDelete.add(entry);
        toGod.delete(entry);
        const list = r.list === 'last' ? 'surname, ' : '';
        deleted.push(`${r.name} [${list}${r.culture}]: deleted; ${r.why}`);
    } else if (r.claude === 'god') {
        toGod.set(entry, 'both readers: a god, spirit or monster');
    }
}

const changes = [];
for (const [e, why] of toGod) {
    changes.push(`${e.name} [${e.language_ethnicity}]: race human -> race mythical; ${why}`);
    e.race = 'mythical';
}
for (const e of handles) {
    changes.push(`${e.name}: culture english -> culture cyberpunkHandle; a handle`);
    e.language_ethnicity = 'cyberpunkHandle';
}
db.first_names = first.filter(e => !toDelete.has(e));
db.last_names = db.last_names.filter(e => !toDelete.has(e));

const summary = [
    `Became race mythical: ${toGod.size}`,
    `Moved to cyberpunkHandle: ${handles.length}`,
    `Deleted: ${deleted.length} (first names ${first.length - db.first_names.length}, surnames ${lastCount - db.last_names.length})`,
    `Readers disagreed: ${undecided.length}`,
    `First names now: ${db.first_names.length}; surnames now: ${db.last_names.length}`,
];
const out = saveWithChanges(db, 2, [
    '== Changed', ...changes.sort(),
    '', '== Deleted', ...deleted.sort(),
    '', '== Readers disagreed', ...undecided.sort(),
    '', '== Summary', ...summary,
]);
console.log(summary.join('\n'));
console.log(out);
