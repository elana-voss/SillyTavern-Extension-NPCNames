// Milestone 10c's read: every human first name and surname the data held before milestone 10 (those not in
// tools/m10a-names.txt, m10b-names.txt or m10b2-names.txt; 6,198 and 2,521; the 8,819 of the plan counted 100 non-human surnames) is read per culture by 10a's three
// readers with 10c's question (tools/name-tags.mjs): the periods it was given in there, where a name with no sign
// of real use there belongs, and how common it is today. A reader's one line for a whole list is set aside
// (isBlanket). Two of three decide (decideTags); the decisions are
// written to tools/m10c-tags.txt for tools/m10c-apply-tags.mjs.
//
// Run: node tools/m10c-read.mjs [--kinds first,last] [--cultures a,b] [--jobs N] [--budget 1500000] [--write]
// --jobs N reads only the first N lists (the small batch). Key: env NANOGPT_API_KEY. Answers are stored under
// logs/work/m10c/answers, so a rerun costs nothing; no new request once the input stored there passes the budget.
// Writes logs/work/m10c/summary.txt; prints a short summary.
import { readFileSync, writeFileSync } from 'node:fs';
import { client, weeklyUsed } from './nanogpt.mjs';
import { readJobs } from './name-read.mjs';
import { decideTags, isBlanket, parseTagAnswers, tagPromptFor } from './name-tags.mjs';
import { readLines } from './db.mjs';

const OUT = new URL('../logs/work/m10c/', import.meta.url);
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const KINDS = arg('kinds', 'first,last').split(',');
const ONLY = arg('cultures', '') ? new Set(arg('cultures').split(',')) : null;
const BUDGET = Number(arg('budget', 1500000));
const SIZE = 100;

/** The names to read: a culture's human names of a kind, once each, but milestone 10's. */
function namesToRead(db) {
    const added = new Set(['m10a-names.txt', 'm10b-names.txt', 'm10b2-names.txt']
        .flatMap(f => readLines(f).map(l => `${l[0]}|${l[1]}|${l[2]}`)));
    const out = [];
    for (const kind of ['first', 'last']) {
        const seen = new Set();
        for (const e of db[`${kind}_names`]) {
            const key = `${kind}|${e.language_ethnicity}|${e.name}`;
            if (e.race !== 'human' || added.has(key) || seen.has(key)) continue;
            seen.add(key);
            out.push({ kind, culture: e.language_ethnicity, name: e.name });
        }
    }
    return out;
}

{
    const db = JSON.parse(readFileSync(new URL('../data/name_database.tagged.json', import.meta.url), 'utf8'));
    const all = namesToRead(db);
    const jobs = [];
    for (const kind of KINDS) {
        const byCulture = Map.groupBy(all.filter(n => n.kind === kind && (!ONLY || ONLY.has(n.culture))), n => n.culture);
        for (const [culture, names] of byCulture) for (let i = 0; i < names.length; i += SIZE)
            jobs.push({ kind, culture, tag: `m10c-${kind}-${culture}-${i / SIZE}`, entries: names.slice(i, i + SIZE) });
    }
    const run = jobs.slice(0, Number(arg('jobs', jobs.length)));
    const before = await weeklyUsed();
    const llm = client(new URL('answers/', OUT));
    for (const kind of KINDS) {
        const mine = run.filter(j => j.kind === kind);
        await readJobs(llm, mine, kind, BUDGET + llm.stats.input,
            { ask: j => tagPromptFor(j.entries.map(e => e.name), j.culture, kind), parse: parseTagAnswers });
    }
    const after = await weeklyUsed();
    const lines = [], counts = { used: 0, unused: 0, undecided: 0, missing: 0, blanket: [], placed: {} };
    for (const j of run) j.reads = j.answers.map((a, r) => isBlanket(a, j.entries.length) ? (counts.blanket.push(`${j.tag}:${r}`), new Map()) : a);
    for (const j of run) for (const [i, e] of j.entries.entries()) {
        const answers = j.reads.map(a => a.get(i + 1));
        counts.missing += answers.filter(a => !a).length;
        const d = decideTags(answers);
        counts[d.used === true ? 'used' : d.used === false ? 'unused' : 'undecided']++;
        if (d.place) counts.placed[d.place] = (counts.placed[d.place] ?? 0) + 1;
        lines.push([e.kind, e.culture, e.name, d.used === null ? '-' : d.used ? 'y' : 'n', d.periods || '-', d.place ?? '-', d.common ?? '-'].join(' | '));
    }
    const summary = [`lists ${run.length} of ${jobs.length}, names ${lines.length} of ${all.length}`,
        `used ${counts.used}, unused ${counts.unused}, undecided ${counts.undecided}; answer lines missing ${counts.missing}`,
        `answers set aside as one line for all (list:reader) ${counts.blanket.length}: ${counts.blanket.join(' ')}`,
        `placed ${JSON.stringify(counts.placed)}`,
        `calls ${llm.stats.calls}, stored ${llm.stats.cached}, failed ${llm.stats.fail}, stopped by budget ${llm.stats.stopped}; input this run ${llm.stats.input}, output ${llm.stats.output}`,
        `nano-gpt weekly input ${before} to ${after}`];
    writeFileSync(new URL('summary.txt', OUT), summary.join('\n') + '\n');
    console.log(summary.join('\n'));
    if (argv.includes('--write')) {
        writeFileSync(new URL('m10c-tags.txt', import.meta.url), ['# Milestone 10c: three readers\' decision on each human name the data held before milestone 10,',
            '# per culture, made by tools/m10c-read.mjs (two of three decide; tools/name-tags.mjs decideTags).',
            '# Fields: kind | culture | name | used (y, n, - undecided) | periods (A-F, - none) | place (of an unused name) | common (c, u, r, -)',
            ...lines].join('\n') + '\n');
        console.log('wrote tools/m10c-tags.txt');
    }
}
