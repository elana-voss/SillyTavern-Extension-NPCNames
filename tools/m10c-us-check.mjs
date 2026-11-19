// Milestone 10c's check of the readers on the one culture with yearly births: for each English first name of
// tools/m10c-tags.txt, the US births (SSA, as hackerb9/ssa-baby-names' alldata.txt: name,sex,count,year) say in
// which of the readers' periods it was commonly given: at least RATE births per million in the period, either sex.
// Compares the readers' periods and their "used" with it, per period letter.
// Writes logs/work/m10c/us-check.txt (the counts, then each name where the two differ); prints the counts.
//
// Run: node tools/m10c-us-check.mjs <alldata.txt>
import { readFileSync, writeFileSync } from 'node:fs';
import { readLines } from './db.mjs';
import { PERIODS } from './name-read.mjs';

const RATE = 50;
const SPANS = { A: [1880, 1899], B: [1900, 1939], C: [1940, 1964], D: [1965, 1994], E: [1995, 2009], F: [2010, 9999] };
const letterOf = y => Object.keys(SPANS).find(k => y >= SPANS[k][0] && y <= SPANS[k][1]);

const births = new Map(), total = {};
for (const line of readFileSync(process.argv[2], 'utf8').split(/\r?\n/)) {
    const [name, , c, y] = line.split(',');
    if (!y) continue;
    const p = letterOf(Number(y));
    const m = births.get(name) ?? births.set(name, {}).get(name);
    m[p] = (m[p] ?? 0) + Number(c);
    total[p] = (total[p] ?? 0) + Number(c);
}
const ssaPeriods = name => Object.keys(PERIODS).filter(p => 1e6 * ((births.get(name) ?? {})[p] ?? 0) / total[p] >= RATE).join('');

const rows = readLines('m10c-tags.txt').filter(l => l[0] === 'first' && l[1] === 'english' && l[3] !== '-');
const cell = Object.fromEntries(Object.keys(PERIODS).map(p => [p, { both: 0, readers: 0, us: 0, neither: 0 }]));
const used = { both: 0, readers: 0, us: 0, neither: 0 }, differ = [];
const key = (r, u) => (r && u ? 'both' : r ? 'readers' : u ? 'us' : 'neither');
for (const [, , name, u, periods] of rows) {
    const us = ssaPeriods(name), read = periods === '-' ? '' : periods;
    for (const p of Object.keys(PERIODS)) cell[p][key(read.includes(p), us.includes(p))]++;
    used[key(u === 'y', us !== '')]++;
    if (read !== us) differ.push(`${name}\treaders ${read || '-'}\tUS ${us || '-'}`);
}
const lines = [`English first names decided: ${rows.length}; US: ${RATE} births a million or more in the period`,
    `used: both ${used.both}, readers only ${used.readers}, US only ${used.us}, neither ${used.neither}`,
    ...Object.entries(cell).map(([p, c]) => `${p} ${PERIODS[p]}: both ${c.both}, readers only ${c.readers}, US only ${c.us}, neither ${c.neither}, agree ${Math.round(100 * (c.both + c.neither) / rows.length)}%`)];
writeFileSync(new URL('../logs/work/m10c/us-check.txt', import.meta.url), [...lines, '', ...differ].join('\n') + '\n');
console.log(lines.join('\n'));
