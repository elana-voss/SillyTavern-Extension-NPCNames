// Milestones 10a's and 10b's read, one script for both kinds:
// - first (10a): each culture's real 50 most common first names of each sex, by the M and F columns of
//   name-dataset's lists; the window is 80 entries, 240 on the lists in WIDE. A romanised entry is held when
//   either sex's list reads a held native entry as it (name-read.mjs knownKeys).
// - last (10b): each culture's 100 most common surnames after folding, read with the surname question; the window
//   is 200 entries, 400 on the lists in WIDE. A surname's gendered forms (Ivanov, Ivanova) fold into one surname and
//   each form enters with the sex two readers give it, in the cultures whose surnames are gendered (milestone 3's
//   rules); elsewhere none. Where surnames are fathers' given names (PATRONYMIC), a string read as a given name
//   counts as a surname.
// Each entry is read by three readers of different vendors (tools/name-read.mjs); the names the database lacked at
// 007a5b5 (the data both reads found, so a rerun gives the same lists) are written to tools/m10a-names.txt or
// m10b-names.txt for tools/m10a-apply-first-names.mjs or m10b-apply-surnames.mjs.
//
// Run: node tools/m10ab-read.mjs first|last [--cultures a,b] [--window N] [--budget N] [--write]
// Key: env NANOGPT_API_KEY. Answers are stored under logs/work/m10a/answers or m10b/answers, so a rerun costs nothing;
// no new request starts once the stored answers' input tokens pass the budget (stored ones are still read).
// Writes summary.txt, rejected.txt (and for surnames entered.txt) to logs/work/m10a/ or m10b/; prints a short summary.
import { writeFileSync } from 'node:fs';
import { arg, flag } from './cli.mjs';
import { keepEntered, loadDb, readLines } from './db.mjs';
import { client } from './nanogpt.mjs';
import { countriesOf, loadLists, norm, rankedEntries, COUNTRIES } from './name-lists.mjs';
import { namesFileText, newFirstNames, newSurnames, readJobs } from './name-read.mjs';
import { loadOverused } from './overused.mjs';

const KIND = process.argv[2];
const PART = { first: '10a', last: '10b' }[KIND];
if (!PART) throw new Error('usage: node tools/m10ab-read.mjs first|last [...]');
const OUT = new URL(`../logs/work/m${PART}/`, import.meta.url);
const TOP = { first: 50, last: 100 }[KIND];
const WINDOW = Number(arg('window', { first: 80, last: 200 }[KIND]));
const BUDGET = Number(arg('budget', { first: 450000, last: 400000 }[KIND]));
// Lists whose first entries gave fewer than TOP names (mostly other peoples' names) are read further.
const WIDE = KIND === 'first'
    ? new Set(['chinese-male', 'chinese-female', 'dutch-female', 'ghanaian-male', 'ghanaian-female', 'nigerian-male',
        'nigerian-female', 'persian-male', 'persian-female', 'slavicRussian-male', 'slavicRussian-female'])
    : new Set(['arabic', 'english', 'hebrew', 'korean', 'nigerian', 'slavicOther']);
const WIDE_WINDOW = { first: 240, last: 400 }[KIND];

const nd = loadLists();
const CULTURES = arg('cultures', '') ? arg('cultures').split(',')
    : Object.keys(COUNTRIES).filter(c => countriesOf(nd, c, KIND).length);
const db = loadDb('007a5b5');
const overused = loadOverused();
const llm = client(new URL('answers/', OUT));

const jobs = KIND === 'first'
    ? CULTURES.flatMap(culture => ['male', 'female'].map(sex => ({ culture, sex, tag: `${culture}-${sex}` })))
    : CULTURES.map(culture => ({ culture, tag: culture }));
for (const j of jobs) j.entries = rankedEntries(nd, j.culture, KIND, j.sex ?? null).slice(0, WIDE.has(j.tag) ? WIDE_WINDOW : WINDOW);

const base = llm.spent();
await readJobs(llm, jobs, KIND, BUDGET);

const heldSets = new Map(); // one set per culture, built once: decide asks per key
const heldOf = c => heldSets.get(c) ?? heldSets.set(c, new Set(db[`${KIND}_names`].filter(e => e.language_ethnicity === c).map(e => norm(e.name)))).get(c);
const r = KIND === 'first' ? newFirstNames(jobs, heldOf, overused, TOP) : newSurnames(jobs, heldOf, overused, TOP);
writeFileSync(new URL('summary.txt', OUT), r.summary.join('\n') + '\n');
writeFileSync(new URL('rejected.txt', OUT), `culture\t${KIND === 'first' ? 'sex\t' : ''}rank\tentry\treaders peoples:kind\n` + r.rejected.join('\n') + '\n');
if (KIND === 'last') writeFileSync(new URL('entered.txt', OUT), 'culture\tentry\trank\treaders peoples:kind\n' + r.entered.join('\n') + '\n');
const file = `m${PART}-names.txt`;
if (flag('write')) {
    const head = KIND === 'first' ? [
        'Milestone 10a: the 50 most common first names of each sex per culture that the database lacked,',
        'from name-dataset (rank lists by country), each read by three readers of different vendors; made by',
        'tools/m10ab-read.mjs first. Fields: first | culture | name | gender | source | ages | eras | roles |',
        'intelligence | allure | commonness | genres | themes'] : [
        'Milestone 10b: the 100 most common surnames per culture, after folding, that the database lacked,',
        'from name-dataset (rank lists by country), each read by three readers of different vendors; made by',
        'tools/m10ab-read.mjs last. Fields: last | culture | name | gender (- none) | source | eras | roles |',
        'allure | commonness | genres | themes'];
    writeFileSync(new URL(file, import.meta.url), keepEntered(namesFileText(head, r.lines, KIND), readLines(file)));
}
const spent = llm.spent();
console.log(`jobs ${jobs.length}, unread ${r.unread}, stopped by budget ${llm.stats.stopped}; answer lines missing ${r.missingLines}`);
console.log(`input tokens: stored ${spent} (this run ${spent - base}); calls ${llm.stats.calls}, cached ${llm.stats.cached}, failed tries ${llm.stats.fail}`);
console.log(KIND === 'first'
    ? `new names ${r.lines.length} (ambiguous ${r.lines.filter(m => m.gender === 'ambiguous').length}); entries rejected ${r.rejected.length}`
    : `new surname forms ${r.lines.length} (male ${r.lines.filter(m => m.gender === 'male').length}, female ${r.lines.filter(m => m.gender === 'female').length}); entries rejected ${r.rejected.length}`);
console.log(`tables: logs/work/m${PART}/summary.txt, rejected.txt${KIND === 'last' ? ', entered.txt' : ''}${flag('write') ? `; list tools/${file}` : ''}`);
