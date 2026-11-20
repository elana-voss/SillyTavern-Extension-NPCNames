// Milestone 10c's read: every human first name and surname the data held before milestone 10 (those not in
// milestone 10's names files; those held at 007a5b5, the data before milestone 10; 6,198 and 2,521; the 8,819 of the plan counted 100 non-human surnames) is read per culture by 10a's three
// readers with 10c's question (tools/name-tags.mjs): the periods it was given in there, where a name with no sign
// of real use there belongs, and how common it is today. A reader's one line for a whole list is set aside
// (isBlanket) and asked again in lists of 25 (--retry N: only the first N such answers); a part answered with one
// line again stays set aside. Two of three decide (decideTags); the decisions are
// written to tools/m10c-tags.txt for tools/m10c-apply-tags.mjs. Kind `new` (10-fix): the surname forms milestone 10
// added (m10b-names.txt, m10b2-names.txt) are read with the same question for their periods alone (decideNew).
//
// Run: node tools/m10c-read.mjs [--kinds first,last,new] [--cultures a,b] [--jobs N] [--retry N] [--budget 1700000] [--write]
// --jobs N reads only the first N lists (the small batch). Key: env NANOGPT_API_KEY. Answers are stored under
// logs/work/m10c/answers, so a rerun costs nothing; no new request once the input stored there passes the budget.
// Writes logs/work/m10c/summary.txt; prints a short summary.
import { writeFileSync } from 'node:fs';
import { client, pool, weeklyUsed } from './nanogpt.mjs';
import { EXTRA, READERS, readJobs } from './name-read.mjs';
import { decideNew, decideTags, isBlanket, parseTagAnswers, tagPromptFor } from './name-tags.mjs';
import { arg, flag } from './cli.mjs';
import { loadDb, readLines } from './db.mjs';

const OUT = new URL('../logs/work/m10c/', import.meta.url);
const KINDS = arg('kinds', 'first,last,new').split(',');
const ONLY = arg('cultures', '') ? new Set(arg('cultures').split(',')) : null;
const BUDGET = Number(arg('budget', 1700000));
const SIZE = 100, PART = 25;

/** The names to read: a culture's human names of a kind, once each, but milestone 10's. */
function namesToRead(db) {
    const before = loadDb('007a5b5');
    const held = new Set(['first', 'last'].flatMap(k => before[`${k}_names`].map(e => `${k}|${e.language_ethnicity}|${e.name}`)));
    const out = [];
    for (const kind of ['first', 'last']) {
        const seen = new Set();
        for (const e of db[`${kind}_names`]) {
            const key = `${kind}|${e.language_ethnicity}|${e.name}`;
            if (e.race !== 'human' || !held.has(key) || seen.has(key)) continue;
            seen.add(key);
            out.push({ kind, group: kind, culture: e.language_ethnicity, name: e.name });
        }
    }
    for (const f of ['m10b-names.txt', 'm10b2-names.txt']) for (const [kind, culture, name] of readLines(f))
        if (kind === 'last') out.push({ kind, group: 'new', culture, name });
    return out;
}

{
    // The names as 10c found them (6b606ef), so the lists, and the stored answers, stay the same once the data changes.
    const all = namesToRead(loadDb('6b606ef'));
    const jobs = [];
    for (const group of KINDS) {
        const byCulture = Map.groupBy(all.filter(n => n.group === group && (!ONLY || ONLY.has(n.culture))), n => n.culture);
        const kind = group === 'new' ? 'last' : group, prefix = group === 'new' ? 'm10c-new-last' : `m10c-${kind}`;
        for (const [culture, names] of byCulture) for (let i = 0; i < names.length; i += SIZE)
            jobs.push({ group, kind, culture, tag: `${prefix}-${culture}-${i / SIZE}`, entries: names.slice(i, i + SIZE) });
    }
    const run = jobs.slice(0, Number(arg('jobs', jobs.length)));
    const before = await weeklyUsed();
    const llm = client(new URL('answers/', OUT));
    for (const group of KINDS) {
        const mine = run.filter(j => j.group === group), kind = group === 'new' ? 'last' : group;
        await readJobs(llm, mine, kind, BUDGET + llm.stats.input,
            { ask: j => tagPromptFor(j.entries.map(e => e.name), j.culture, kind), parse: parseTagAnswers });
    }
    const lines = [], counts = { used: 0, unused: 0, undecided: 0, missing: 0, blanket: [], again: [], placed: {}, fresh: 0, dated: 0 };
    const blank = run.flatMap(j => j.answers.map((a, r) => [j, r]).filter(([j, r]) => isBlanket(j.answers[r], j.entries.length)));
    const parts = blank.slice(0, Number(arg('retry', blank.length)))
        .flatMap(([j, r]) => Array.from({ length: Math.ceil(j.entries.length / PART) }, (_, k) => ({ j, r, k })));
    const texts = await pool(parts, 6, ({ j, r, k }) => llm.ask(READERS[r], tagPromptFor(j.entries.slice(k * PART, (k + 1) * PART).map(e => e.name), j.culture, j.kind),
        { tag: `${j.tag}-r${r}-${k}`, extra: EXTRA[READERS[r]], allow: () => llm.stats.input < BUDGET }));
    for (const [p, { j, r, k }] of parts.entries()) {
        const a = parseTagAnswers(texts[p]), n = Math.min(PART, j.entries.length - k * PART);
        const m = (j.redo ??= new Map()).get(r) ?? j.redo.set(r, new Map()).get(r);
        if (isBlanket(a, n)) counts.again.push(`${j.tag}:${r}:${k}`);
        else for (const [i, x] of a) if (i <= n) m.set(k * PART + i, x);
    }
    const after = await weeklyUsed();
    for (const j of run) j.reads = j.answers.map((a, r) => !isBlanket(a, j.entries.length) ? a : j.redo?.get(r) ?? (counts.blanket.push(`${j.tag}:${r}`), new Map()));
    for (const j of run) for (const [i, e] of j.entries.entries()) {
        const answers = j.reads.map(a => a.get(i + 1));
        counts.missing += answers.filter(a => !a).length;
        if (j.group === 'new') {
            const d = decideNew(answers);
            counts.fresh++;
            if (d.periods !== 'D') counts.dated++;
            lines.push([e.kind, e.culture, e.name, 'y', d.periods, '-', '-'].join(' | '));
            continue;
        }
        const d = decideTags(answers);
        counts[d.used === true ? 'used' : d.used === false ? 'unused' : 'undecided']++;
        if (d.place) counts.placed[d.place] = (counts.placed[d.place] ?? 0) + 1;
        lines.push([e.kind, e.culture, e.name, d.used === null ? '-' : d.used ? 'y' : 'n', d.periods || '-', d.place ?? '-', d.common ?? '-'].join(' | '));
    }
    const summary = [`lists ${run.length} of ${jobs.length}, names ${lines.length} of ${all.length}`,
        `used ${counts.used}, unused ${counts.unused}, undecided ${counts.undecided}; answer lines missing ${counts.missing}`,
        `milestone 10's surname forms ${counts.fresh}, of them with periods beyond D ${counts.dated}`,
        `answers set aside as one line for all (list:reader) ${counts.blanket.length}: ${counts.blanket.join(' ')}`,
        `asked again in parts of ${PART}: ${parts.length} parts; one line again (list:reader:part) ${counts.again.length}: ${counts.again.join(' ')}`,
        `placed ${JSON.stringify(counts.placed)}`,
        `calls ${llm.stats.calls}, stored ${llm.stats.cached}, failed ${llm.stats.fail}, stopped by budget ${llm.stats.stopped}; input this run ${llm.stats.input}, output ${llm.stats.output}`,
        `nano-gpt weekly input ${before} to ${after}`];
    writeFileSync(new URL('summary.txt', OUT), summary.join('\n') + '\n');
    console.log(summary.join('\n'));
    if (flag('write')) {
        writeFileSync(new URL('m10c-tags.txt', import.meta.url), ['# Milestone 10c: three readers\' decision on each human name the data held before milestone 10,',
            '# per culture, made by tools/m10c-read.mjs (two of three decide; tools/name-tags.mjs decideTags).',
            '# Fields: kind | culture | name | used (y, n, - undecided) | periods (A-F, - none) | place (of an unused name) | common (c, u, r, -)',
            '# The surname forms milestone 10 added follow, read for their periods alone (name-tags.mjs decideNew): used y, D always.',
            ...lines].join('\n') + '\n');
        console.log('wrote tools/m10c-tags.txt');
    }
}
