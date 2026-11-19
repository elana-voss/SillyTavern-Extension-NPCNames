// Milestone 10a's read: each culture's real 50 most common first names of each sex, by the M and F
// columns of name-dataset's lists, read by three readers of different vendors (tools/name-read.mjs),
// and the names the database lacks written to tools/m10a-names.txt for tools/m10a-apply-first-names.mjs.
//
// Run: node tools/m10a-read.mjs [--cultures a,b] [--window 80] [--budget 450000] [--write]
// Key: env NANOGPT_API_KEY. Answers are stored under logs/work/m10a/answers, so a rerun costs nothing;
// no new request starts once the stored answers' input tokens pass the budget.
// Writes logs/work/m10a/summary.txt (per culture and sex) and rejected.txt; prints a short summary.
import { readFileSync, writeFileSync } from 'node:fs';
import { client, pool } from './nanogpt.mjs';
import { countriesOf, loadLists, norm, rankedEntries, COUNTRIES } from './name-lists.mjs';
import { decide, firstNameTags, parseAnswers, promptFor } from './name-read.mjs';
import { foldName, loadOverused } from './overused.mjs';

const READERS = ['meta/muse-spark-1.3-contributor', 'deepseek/deepseek-v4.1-flash', 'minimax/minimax-m3'];
const TOP = 50;
const OUT = new URL('../logs/work/m10a/', import.meta.url);

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const WINDOW = Number(arg('window', 80));
const BUDGET = Number(arg('budget', 450000));
const nd = loadLists();
const CULTURES = arg('cultures', '') ? arg('cultures').split(',') : Object.keys(COUNTRIES).filter(c => countriesOf(nd, c).length);

const db = JSON.parse(readFileSync(new URL('../data/name_database.tagged.json', import.meta.url), 'utf8'));
const overused = loadOverused();
const llm = client(new URL('answers/', OUT));
const base = llm.spent();

const jobs = CULTURES.flatMap(culture => ['male', 'female'].map(sex => ({ culture, sex })));
for (const j of jobs) j.entries = rankedEntries(nd, j.culture, 'first', j.sex).slice(0, WINDOW);

let stopped = 0;
const calls = jobs.flatMap(j => READERS.map(model => ({ j, model })));
const texts = await pool(calls, 6, async ({ j, model }) => {
    if (base + llm.stats.input > BUDGET) { stopped++; return null; }
    return llm.ask(model, promptFor(j.entries.map(e => e.name)), { tag: `${j.culture}-${j.sex}` });
});

const summary = ['culture\tsex\tread\tanswered(per reader)\tnames\ttop50 present\tnew\toverused'];
const rejected = [];
const lines = [];
let missingLines = 0, unread = 0;
for (const [ji, j] of jobs.entries()) {
    const answers = READERS.map((_, r) => parseAnswers(texts[ji * READERS.length + r]));
    if (answers.some(a => a.size === 0)) { unread++; continue; }
    missingLines += answers.reduce((n, a) => n + j.entries.length - a.size, 0);
    const held = new Set(db.first_names.filter(e => e.language_ethnicity === j.culture).map(e => norm(e.name)));
    const names = decide(j.entries.map(e => e.name), answers, j.culture, k => held.has(k));
    const top = names.slice(0, TOP);
    const named = new Set(names.flatMap(g => g.members));
    for (const [i, e] of j.entries.entries()) {
        if (!named.has(i + 1)) rejected.push(`${j.culture}\t${j.sex}\t${e.rank}\t${e.name}\t${answers.map(a => { const x = a.get(i + 1); return x ? `${[...x.peoples].join(',') || '?'}:${x.kind}` : 'none'; }).join(' ')}`);
    }
    let added = 0, slop = 0;
    for (const g of top) {
        if (g.present) continue;
        if (g.keys.some(k => overused.has(k)) || overused.has(foldName(j.entries[g.form - 1].name))) { slop++; continue; }
        const e = j.entries[g.form - 1];
        lines.push({ culture: j.culture, sex: j.sex, name: e.name, keys: new Set(g.keys), source: `name-dataset ${e.country}`, rank: e.rank, tags: firstNameTags(g) });
        added++;
    }
    summary.push([j.culture, j.sex, j.entries.length, answers.map(a => a.size).join('/'), names.length, top.filter(g => g.present).length, added, slop].join('\t'));
}

// One culture's name new in both sexes' lists enters once, as either sex.
const merged = [];
for (const l of lines) {
    const twin = merged.find(m => m.culture === l.culture && [...l.keys].some(k => m.keys.has(k)));
    if (twin) { twin.gender = 'ambiguous'; continue; }
    merged.push({ ...l, gender: l.sex });
}
writeFileSync(new URL('summary.txt', OUT), summary.join('\n') + '\n');
writeFileSync(new URL('rejected.txt', OUT), 'culture\tsex\trank\tentry\treaders peoples:kind\n' + rejected.join('\n') + '\n');
const list = s => (s.length ? s.join(',') : '-');
const text = merged.map(m => [
    'first', m.culture, m.name, m.gender, m.source, list(m.tags.age), list(m.tags.era), list(m.tags.role), m.tags.intelligence,
    m.tags.allure, m.tags.commonness, list(m.tags.genre), list(m.tags.themes)].join(' | '));
if (argv.includes('--write')) {
    writeFileSync(new URL('m10a-names.txt', import.meta.url), [
        '# Milestone 10a: the 50 most common first names of each sex per culture that the database lacked,',
        '# from name-dataset (rank lists by country), each read by three readers of different vendors; made by',
        '# tools/m10a-read.mjs. Fields: first | culture | name | gender | source | ages | eras | roles |',
        '# intelligence | allure | commonness | genres | themes', ...text].join('\n') + '\n');
}
const spent = llm.spent();
console.log(`jobs ${jobs.length}, unread ${unread}, stopped by budget ${stopped}; answer lines missing ${missingLines}`);
console.log(`input tokens: stored ${spent} (this run ${spent - base}); calls ${llm.stats.calls}, cached ${llm.stats.cached}, failed tries ${llm.stats.fail}`);
console.log(`new names ${merged.length} (ambiguous ${merged.filter(m => m.gender === 'ambiguous').length}); entries rejected ${rejected.length}`);
console.log(`tables: logs/work/m10a/summary.txt, rejected.txt${argv.includes('--write') ? '; list tools/m10a-names.txt' : ''}`);
