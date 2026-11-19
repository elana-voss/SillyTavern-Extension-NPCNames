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
import { namesFileText, newSurnames, readJobs } from './name-read.mjs';
import { loadOverused } from './overused.mjs';

const TOP = 100;
const OUT = new URL('../logs/work/m10b/', import.meta.url);
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

const heldOf = c => new Set(db.last_names.filter(e => e.language_ethnicity === c).map(e => norm(e.name)));
const { lines, summary, rejected, entered, missingLines, unread } = newSurnames(jobs, heldOf, overused, TOP);
writeFileSync(new URL('summary.txt', OUT), summary.join('\n') + '\n');
writeFileSync(new URL('rejected.txt', OUT), 'culture\trank\tentry\treaders peoples:kind\n' + rejected.join('\n') + '\n');
writeFileSync(new URL('entered.txt', OUT), 'culture\tentry\trank\treaders peoples:kind\n' + entered.join('\n') + '\n');
if (argv.includes('--write')) {
    writeFileSync(new URL('m10b-names.txt', import.meta.url), namesFileText([
        'Milestone 10b: the 100 most common surnames per culture, after folding, that the database lacked,',
        'from name-dataset (rank lists by country), each read by three readers of different vendors; made by',
        'tools/m10b-read.mjs. Fields: last | culture | name | gender (- none) | source | eras | roles |',
        'allure | commonness | genres | themes'], lines, 'last'));
}
const spent = llm.spent();
console.log(`jobs ${jobs.length}, unread ${unread}, stopped by budget ${llm.stats.stopped}; answer lines missing ${missingLines}`);
console.log(`input tokens: stored ${spent} (this run ${spent - base}); calls ${llm.stats.calls}, cached ${llm.stats.cached}, failed tries ${llm.stats.fail}`);
console.log(`new surname forms ${lines.length} (male ${lines.filter(m => m.gender === 'male').length}, female ${lines.filter(m => m.gender === 'female').length}); entries rejected ${rejected.length}`);
console.log(`tables: logs/work/m10b/summary.txt, rejected.txt, entered.txt${argv.includes('--write') ? '; list tools/m10b-names.txt' : ''}`);
