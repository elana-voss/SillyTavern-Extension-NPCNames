// Milestone 10b's window check: a list read at two windows (200 and 400 entries) from the stored answers only
// (no request is sent), and the surnames the narrow read holds that the wide read lacks, with each reader's answer
// in both reads. Written to logs/work/m10b/window.txt; prints the counts.
// For cultures whose surnames are neither gendered nor fathers' names (decide()'s options stay off).
//
// Run: node tools/m10b-window.mjs [--cultures korean] [--narrow 200] [--wide 400]
import { writeFileSync } from 'node:fs';
import { arg } from './cli.mjs';
import { client } from './nanogpt.mjs';
import { loadLists, rankedEntries } from './name-lists.mjs';
import { decide, readJobs, readersSaid } from './name-read.mjs';

const OUT = new URL('../logs/work/m10b/', import.meta.url);
const nd = loadLists();
const llm = client(new URL('answers/', OUT));
const windows = [Number(arg('narrow', 200)), Number(arg('wide', 400))];

const out = ['culture\twindow\tsurnames (rank <= narrow)\tlost: rank\tentry\tnarrow read\twide read'];
for (const culture of arg('cultures', 'korean').split(',')) {
    const jobs = windows.map(w => ({ culture, tag: culture, entries: rankedEntries(nd, culture, 'last').slice(0, w) }));
    await readJobs(llm, jobs, 'last', 0);
    if (!jobs.every(j => j.answers.every(a => a.size))) { console.log(`${culture}: not every read is stored`); continue; }
    const [narrow, wide] = jobs.map(j => decide(j.entries.map(e => e.name), j.answers, culture, () => false, 'last'));
    const wideKeys = new Set(wide.flatMap(f => f.keys));
    const lost = narrow.filter(f => !f.keys.some(k => wideKeys.has(k)));
    const within = wide.filter(f => f.rank <= windows[0]).length;
    console.log(`${culture}: ${narrow.length} surnames at ${windows[0]}, ${wide.length} at ${windows[1]} (${within} ranked within ${windows[0]}); lost ${lost.length}`);
    for (const f of lost) {
        const e = jobs[0].entries[f.form - 1];
        out.push([culture, windows.join('/'), `${narrow.length}/${within}`, e.rank, e.name,
            readersSaid(jobs[0].answers, f.form), readersSaid(jobs[1].answers, f.form)].join('\t'));
    }
    // Where the narrow read's surnames went in the wide read: joined into one group, or no longer a name.
    const name = i => jobs[0].entries[i - 1].name;
    const home = f => wide.find(w => w.members.includes(f.form));
    const joined = new Map();
    for (const f of narrow) {
        const w = home(f);
        if (!w) out.push(`${culture}\tdropped\t${name(f.form)}\tnarrow ${readersSaid(jobs[0].answers, f.form)}\twide ${readersSaid(jobs[1].answers, f.form)}`);
        else joined.set(w, [...(joined.get(w) ?? []), f]);
    }
    const merged = [...joined].filter(([, fs]) => fs.length > 1);
    const kept = [...joined.values()].reduce((n, fs) => n + fs.length, 0);
    console.log(`${culture}: ${narrow.length - kept} narrow surnames dropped, ${merged.length} wide groups join ${kept - joined.size + merged.length}`);
    for (const [w, fs] of merged) {
        out.push(`${culture}\tjoined\t${fs.map(f => name(f.form)).join(' ')}\twide group: ${w.members.map(i => jobs[1].entries[i - 1].name).join(' ')}`);
    }
}
writeFileSync(new URL('window.txt', OUT), out.join('\n') + '\n');
console.log('Table: logs/work/m10b/window.txt');
