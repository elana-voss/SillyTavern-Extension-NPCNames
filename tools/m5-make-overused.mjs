// Makes tools/overused-names.txt from stored model answers and real-world name frequencies.
// A name is AI slop when models of several vendors keep producing it under the generic fantasy
// and style prompts AND it is rare among real people. No model judges anything here.
//
// node tools/m5-make-overused.mjs <overused-raw.json> <nd.json> <sig.json> <ssa-pre2000.json> <out-table>
// raw: [{m, k, tag, first, last}], k starts with * for a style prompt, else it is a culture.
// nd: {first|last: {CC: [[rank, name, ...]]}}. sig: {forenames|surnames: {CC: [[y, g, localized, romanized]]}}.
import { readFileSync, writeFileSync } from 'node:fs';
import { foldName } from './overused.mjs';

const VENDORS = 3; // of five, under the generic prompts
const RANK = 1500; // on any country's list of first or last names (the data's top 1500): real people bear it
const PRE2000 = 500; // US births before 2000 at or above this: people bore it before these models

const [rawPath, ndPath, sigPath, ssaPath, tablePath] = process.argv.slice(2);
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const raw = json(rawPath), nd = json(ndPath), sig = json(sigPath), ssa = json(ssaPath);
const target = new URL('overused-names.txt', import.meta.url);

/** Plain variants of a spelling share a key: Lyra/Lira, Thorn/Thorne, Seraphina/Serafina, Elara/Ellara. */
const variantKey = name => foldName(name).replace(/[^\p{L}]/gu, '').replace(/ph/g, 'f').replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1').replace(/(.)e$/, '$1');

const stats = new Map(); // variant key -> {spellings, generic: vendors, own: vendors, cultures}
for (const r of raw) {
    for (const n of [...(r.first ?? []), ...(r.last ?? [])]) {
        if (typeof n !== 'string' || !n.trim() || /\s/.test(n.trim())) continue;
        const k = variantKey(n);
        if (k.length < 3) continue;
        const s = stats.get(k) ?? { spellings: new Set(), generic: new Set(), own: new Set(), cultures: new Set() };
        s.spellings.add(n.trim());
        if (r.k === '*ancient') continue; // repeats real Roman names (Gaius, Publius), shows no invention
        if (r.k.startsWith('*')) s.generic.add(r.m.split('/')[0]);
        else { s.own.add(r.m.split('/')[0]); s.cultures.add(r.k); }
        stats.set(k, s);
    }
}

const best = new Map(); // folded name -> best rank in any country, first or last
for (const kind of ['first', 'last']) {
    for (const rows of Object.values(nd[kind])) {
        for (const [rank, name] of rows) {
            const f = foldName(name);
            if (!(best.get(f) <= rank)) best.set(f, rank);
        }
    }
}
const popular = new Set();
for (const kind of ['forenames', 'surnames']) {
    for (const rows of Object.values(sig[kind])) {
        for (const row of rows) for (const n of row.slice(2)) if (n) popular.add(foldName(n.trim()));
    }
}
const whyCommon = f => {
    if (best.get(f) <= RANK) return `rank ${best.get(f)}`;
    if (popular.has(f)) return 'popular-names';
    if ((ssa[f] ?? 0) >= PRE2000) return `US ${ssa[f]}`;
    return '';
};

// A person looked and these are real names; the mark in the list keeps them off when it is remade.
const notSlop = readFileSync(target, 'utf8').split(/\r?\n/).filter(l => l.startsWith('#not-slop ')).map(l => l.split(' ')[1]);

const listed = new Set(), table = [];
for (const [k, s] of stats) {
    // A culture's own prompts show nothing: they repeat real names of cultures without a source (Iryna, Nataliia).
    if (s.generic.size < VENDORS) continue;
    const rows = [...new Set([...s.spellings].map(foldName))].map(f => ({ f, why: whyCommon(f) }));
    for (const { f, why } of rows) {
        table.push(`${f}\t${why || 'LISTED'}\tgeneric ${s.generic.size} own ${s.own.size} cultures ${s.cultures.size}`);
        if (!why && !notSlop.includes(f)) listed.add(f);
    }
}
writeFileSync(tablePath, table.sort().join('\n') + '\n');

const HAND = ['elara', 'kael', 'lyra', 'seraphina', 'thorn', 'thorne'].filter(f => !listed.has(f));
const text = [
    '# Names models of several vendors keep inventing and few real people bear. A new name on this list does not enter, in any culture.',
    `# Counted from stored answers of five vendors by tools/m5-make-overused.mjs: ${VENDORS} vendors under generic fantasy and style prompts;`,
    `# common in real life (rank ${RANK} in a country, popular-names, ${PRE2000} US births before 2000) stays off.`,
    ...[...listed].sort(),
    '# Listed by hand: named by the owner or of that kind, though the counts do not reach them.',
    ...HAND,
    '# Real names, not slop, though the counts reach them: never listed.',
    ...notSlop.map(f => `#not-slop ${f}`),
    '',
].join('\n');
writeFileSync(target, text);
console.log(`counted ${stats.size} variant groups, listed ${listed.size}, by hand ${HAND.length}: ${HAND.join(' ')}`);
for (const f of ['elara', 'kael', 'lyra', 'seraphina', 'thorn', 'maria', 'anna', 'thomas', 'smith', 'murphy', 'ivan', 'elena', 'mihai', 'popescu', 'chen', 'kim', 'nguyen', 'tanaka', 'kofi']) {
    console.log(`${f} rank ${best.get(f) ?? '-'} us ${ssa[f] ?? 0} pop ${popular.has(f)} ${listed.has(f) ? 'LISTED' : ''}`);
}
