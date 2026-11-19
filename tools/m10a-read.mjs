// Milestone 10a's read: each culture's real 50 most common first names of each sex, by the M and F
// columns of name-dataset's lists, read by three readers of different vendors (tools/name-read.mjs),
// and the names the database lacks written to tools/m10a-names.txt for tools/m10a-apply-first-names.mjs.
//
// Run: node tools/m10a-read.mjs [--cultures a,b] [--window 80] [--budget 450000] [--write]
// The window is 80 entries, 240 on the lists in WIDE; Irish Gaelic waits for 10b2.
// Key: env NANOGPT_API_KEY. Answers are stored under logs/work/m10a/answers, so a rerun costs nothing;
// no new request starts once the stored answers' input tokens pass the budget (stored ones are still read).
// A romanised entry is held when either sex's list reads a held native entry as it (name-read.mjs knownKeys).
// Writes logs/work/m10a/summary.txt (per culture and sex) and rejected.txt; prints a short summary.
import { readFileSync, writeFileSync } from 'node:fs';
import { client } from './nanogpt.mjs';
import { countriesOf, loadLists, norm, rankedEntries, COUNTRIES } from './name-lists.mjs';
import { namesFileText, newFirstNames, readJobs } from './name-read.mjs';
import { loadOverused } from './overused.mjs';

const TOP = 50;
const OUT = new URL('../logs/work/m10a/', import.meta.url);

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const WINDOW = Number(arg('window', 80));
const BUDGET = Number(arg('budget', 450000));
const nd = loadLists();
// Ireland's list is English-speaking Ireland's (John, Mary, Paul): Irish Gaelic is filled in 10b2 (PLAN.md).
const LATER = ['irishGaelic'];
const CULTURES = arg('cultures', '') ? arg('cultures').split(',')
    : Object.keys(COUNTRIES).filter(c => countriesOf(nd, c).length && !LATER.includes(c));

const db = JSON.parse(readFileSync(new URL('../data/name_database.tagged.json', import.meta.url), 'utf8'));
const overused = loadOverused();
const llm = client(new URL('answers/', OUT));

const jobs = CULTURES.flatMap(culture => ['male', 'female'].map(sex => ({ culture, sex, tag: `${culture}-${sex}` })));
// Lists whose first 80 entries gave fewer than 50 names (mostly other peoples' names) are read to 240.
const WIDE = new Set(['chinese-male', 'chinese-female', 'dutch-female', 'ghanaian-male', 'ghanaian-female', 'nigerian-male',
    'nigerian-female', 'persian-male', 'persian-female', 'slavicRussian-male', 'slavicRussian-female']);
for (const j of jobs) j.entries = rankedEntries(nd, j.culture, 'first', j.sex).slice(0, WIDE.has(`${j.culture}-${j.sex}`) ? 240 : WINDOW);

const base = llm.spent();
await readJobs(llm, jobs, 'first', BUDGET);

const held = new Map(CULTURES.map(c => [c, new Set(db.first_names.filter(e => e.language_ethnicity === c).map(e => norm(e.name)))]));
const { lines: merged, summary, rejected, missingLines, unread } = newFirstNames(jobs, c => held.get(c), overused, TOP);
writeFileSync(new URL('summary.txt', OUT), summary.join('\n') + '\n');
writeFileSync(new URL('rejected.txt', OUT), 'culture\tsex\trank\tentry\treaders peoples:kind\n' + rejected.join('\n') + '\n');
if (argv.includes('--write')) {
    writeFileSync(new URL('m10a-names.txt', import.meta.url), namesFileText([
        'Milestone 10a: the 50 most common first names of each sex per culture that the database lacked,',
        'from name-dataset (rank lists by country), each read by three readers of different vendors; made by',
        'tools/m10a-read.mjs. Fields: first | culture | name | gender | source | ages | eras | roles |',
        'intelligence | allure | commonness | genres | themes'], merged, 'first'));
}
const spent = llm.spent();
console.log(`jobs ${jobs.length}, unread ${unread}, stopped by budget ${llm.stats.stopped}; answer lines missing ${missingLines}`);
console.log(`input tokens: stored ${spent} (this run ${spent - base}); calls ${llm.stats.calls}, cached ${llm.stats.cached}, failed tries ${llm.stats.fail}`);
console.log(`new names ${merged.length} (ambiguous ${merged.filter(m => m.gender === 'ambiguous').length}); entries rejected ${rejected.length}`);
console.log(`tables: logs/work/m10a/summary.txt, rejected.txt${argv.includes('--write') ? '; list tools/m10a-names.txt' : ''}`);
