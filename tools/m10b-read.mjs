// Milestone 10b's read: each culture's 100 most common surnames after folding, from name-dataset's
// surname lists, read by the three readers of 10a (tools/name-read.mjs) with the surname question; the
// forms the database lacks are written to tools/m10b-names.txt for tools/m10b-apply-surnames.mjs.
// A surname's gendered forms (Ivanov, Ivanova) fold into one surname and each form enters with the sex
// two readers give it, in the cultures whose surnames are gendered (milestone 3's rules); elsewhere none.
// Where surnames are fathers' given names (PATRONYMIC), a string read as a given name counts as a surname.
//
// Run: node tools/m10b-read.mjs [--cultures a,b] [--window 200] [--budget 400000] [--write]
// The window is 200 entries, 400 on the lists in WIDE.
// Key: env NANOGPT_API_KEY. Answers are stored under logs/work/m10b/answers, so a rerun costs nothing;
// no new request starts once the stored answers' input tokens pass the budget (stored ones are still read).
// Writes logs/work/m10b/summary.txt (per culture), rejected.txt and entered.txt (the readers' answers); prints a short summary.
import { readFileSync, writeFileSync } from 'node:fs';
import { client } from './nanogpt.mjs';
import { countriesOf, loadLists, norm, rankedEntries, COUNTRIES } from './name-lists.mjs';
import { decide, knownKeys, lastNameTags, readersSaid, readJobs } from './name-read.mjs';
import { foldName, loadOverused } from './overused.mjs';

const TOP = 100;
const OUT = new URL('../logs/work/m10b/', import.meta.url);
// Cultures whose surnames have a man's and a woman's form (PLAN.md Decisions, milestones 3 and 5).
const GENDERED = new Set(['slavicPolish', 'slavicRussian', 'slavicOther', 'icelandic', 'ukrainian', 'turkish', 'swedish',
    'greek', 'nepalese', 'irishGaelic', 'baltic', 'azerbaijani', 'latin']);
// Cultures whose surnames are mostly fathers' given names (Ethiopian; Hausa in Nigeria's list: Musa, Ibrahim).
const PATRONYMIC = new Set(['ethiopian', 'nigerian']);

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const WINDOW = Number(arg('window', 200));
const BUDGET = Number(arg('budget', 400000));
const nd = loadLists();
// Ireland's list is English-speaking Ireland's: Irish Gaelic is filled in 10b2 (PLAN.md).
const LATER = ['irishGaelic'];
const CULTURES = arg('cultures', '') ? arg('cultures').split(',')
    : Object.keys(COUNTRIES).filter(c => countriesOf(nd, c, 'last').length && !LATER.includes(c));

const db = JSON.parse(readFileSync(new URL('../data/name_database.tagged.json', import.meta.url), 'utf8'));
const overused = loadOverused();
const llm = client(new URL('answers/', OUT));
const base = llm.spent();

// Lists whose first 200 entries gave fewer than 100 surnames (mostly other peoples' names) are read to 400.
const WIDE = new Set(['arabic', 'english', 'hebrew', 'korean', 'nigerian', 'slavicOther']);
const jobs = CULTURES.map(culture => ({ culture, tag: culture,
    entries: rankedEntries(nd, culture, 'last').slice(0, WIDE.has(culture) ? 400 : WINDOW) }));
await readJobs(llm, jobs, 'last', BUDGET);

const summary = ['culture\tread\tanswered(per reader)\tsurnames\ttop100 held\tnew forms\tmale/female/none\toverused'];
const rejected = [];
const lines = [];
let missingLines = 0, unread = 0;
for (const j of jobs) {
    const { answers, culture, entries } = j;
    if (!answers.every(a => a.size)) { unread++; continue; }
    missingLines += answers.reduce((n, a) => n + entries.length - a.size, 0);
    const held = new Set(db.last_names.filter(e => e.language_ethnicity === culture).map(e => norm(e.name)));
    const forms = decide(entries.map(e => e.name), answers, culture, k => held.has(k), 'last', { gendered: GENDERED.has(culture),
        patronymic: PATRONYMIC.has(culture) });
    // R3: a held native form read as a Latin spelling holds that spelling.
    const known = knownKeys([forms], held);
    const top = new Set([...new Set(forms.map(f => f.rank))].slice(0, TOP));
    const named = new Set(forms.flatMap(f => f.members));
    for (const [i, e] of entries.entries()) {
        if (!named.has(i + 1)) rejected.push(`${culture}\t${e.rank}\t${e.name}\t${readersSaid(answers, i + 1)}`);
    }
    const counts = { male: 0, female: 0, none: 0 };
    let slop = 0;
    for (const f of forms.filter(f => top.has(f.rank))) {
        if (f.keys.some(k => known.has(k))) continue;
        const e = entries[f.form - 1];
        if (f.keys.some(k => overused.has(k)) || overused.has(foldName(e.name))) { slop++; continue; }
        const gender = f.sex;
        counts[gender ?? 'none']++;
        lines.push({ culture, name: e.name, gender, source: `name-dataset ${e.country}`, tags: lastNameTags(f),
            said: `${e.rank}\t${readersSaid(answers, f.form)}` });
    }
    const groupsHeld = [...top].filter(r => forms.filter(f => f.rank === r).every(f => f.keys.some(k => known.has(k)))).length;
    summary.push([culture, entries.length, answers.map(a => a.size).join('/'), top.size, groupsHeld,
        Object.values(counts).reduce((a, b) => a + b, 0), Object.values(counts).join('/'), slop].join('\t'));
}

writeFileSync(new URL('summary.txt', OUT), summary.join('\n') + '\n');
writeFileSync(new URL('rejected.txt', OUT), 'culture\trank\tentry\treaders peoples:kind\n' + rejected.join('\n') + '\n');
writeFileSync(new URL('entered.txt', OUT), 'culture\tentry\trank\treaders peoples:kind\n'
    + lines.map(m => `${m.culture}\t${m.name}\t${m.said}`).join('\n') + '\n');
const list = s => (s.length ? s.join(',') : '-');
const text = lines.map(m => ['last', m.culture, m.name, m.gender ?? '-', m.source, list(m.tags.era), list(m.tags.role),
    m.tags.allure, m.tags.commonness, list(m.tags.genre), list(m.tags.themes)].join(' | '));
if (argv.includes('--write')) {
    writeFileSync(new URL('m10b-names.txt', import.meta.url), [
        '# Milestone 10b: the 100 most common surnames per culture, after folding, that the database lacked,',
        '# from name-dataset (rank lists by country), each read by three readers of different vendors; made by',
        '# tools/m10b-read.mjs. Fields: last | culture | name | gender (- none) | source | eras | roles |',
        '# allure | commonness | genres | themes', ...text].join('\n') + '\n');
}
const spent = llm.spent();
console.log(`jobs ${jobs.length}, unread ${unread}, stopped by budget ${llm.stats.stopped}; answer lines missing ${missingLines}`);
console.log(`input tokens: stored ${spent} (this run ${spent - base}); calls ${llm.stats.calls}, cached ${llm.stats.cached}, failed tries ${llm.stats.fail}`);
console.log(`new surname forms ${lines.length} (male ${lines.filter(m => m.gender === 'male').length}, female ${lines.filter(m => m.gender === 'female').length}); entries rejected ${rejected.length}`);
console.log(`tables: logs/work/m10b/summary.txt, rejected.txt, entered.txt${argv.includes('--write') ? '; list tools/m10b-names.txt' : ''}`);
