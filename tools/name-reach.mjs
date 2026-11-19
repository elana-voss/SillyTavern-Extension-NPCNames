// Milestone 10's yardstick: how many of each culture's common names the database holds, and how
// many names everyday requests reach. Each part of milestone 10 writes its figures from this.
//
// Run: node tools/name-reach.mjs
// Writes the per-culture table to logs/work/name-reach.txt; prints a summary of about ten lines.
// Matching is by spelling with accents removed (tools/name-lists.mjs `norm`), so a name held in
// another script than its list counts as missing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { filterFirstNames } from '../picker.js';
import { COUNTRIES, countriesOf, loadLists, norm, rankedEntries } from './name-lists.mjs';

const db = JSON.parse(readFileSync(new URL('../data/name_database.tagged.json', import.meta.url), 'utf8'));
const nd = loadLists();
const F = db.first_names, L = db.last_names;
const human = F.filter(e => e.race === 'human');

const REQUESTS = {
    'adult today': { age: 'adult', era: ['modern', 'contemporary'], genre: 'sliceOfLife' },
    'young today': { age: 'youngAdult', era: ['modern', 'contemporary'], genre: 'sliceOfLife' },
    'child today': { age: 'child', era: ['modern', 'contemporary'] },
    'elder today': { age: 'elder', era: ['modern', 'contemporary'] },
    'midcentury adult': { age: 'adult', era: 'midcentury' },
    'fantasy adult': { age: 'adult', genre: 'fantasy' },
    'noir adult': { age: 'adult', genre: 'noirDetective' },
    common: { commonness: 'common' },
};

const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const hits = (entries, have, n) => entries.slice(0, n).filter(x => have.has(x.key)).length;
const keys = list => new Set(list.map(e => norm(e.name)));

const rows = [];
for (const c of Object.keys(COUNTRIES)) {
    if (!countriesOf(nd, c).length) continue;
    const fh = human.filter(e => e.language_ethnicity === c), ls = L.filter(e => e.language_ethnicity === c);
    const row = { c, countries: countriesOf(nd, c).join('+'), first: fh.length, last: ls.length };
    row.f100 = hits(rankedEntries(nd, c, 'first'), keys(fh), 100);
    row.l100 = hits(rankedEntries(nd, c, 'last'), keys(ls), 100);
    row.m50 = hits(rankedEntries(nd, c, 'first', 'male'), keys(fh.filter(e => e.gender !== 'female')), 50);
    row.w50 = hits(rankedEntries(nd, c, 'first', 'female'), keys(fh.filter(e => e.gender !== 'male')), 50);
    for (const [t, f] of Object.entries(REQUESTS)) {
        const filters = { race: ['human'], language_ethnicity: [c] };
        for (const [k, v] of Object.entries(f)) filters[k] = [].concat(v);
        row[t] = filterFirstNames(F, filters).length;
    }
    rows.push(row);
}

const cols = ['c', 'countries', 'first', 'last', 'f100', 'l100', 'm50', 'w50', ...Object.keys(REQUESTS)];
const table = [cols.join('\t'), ...rows.map(r => cols.map(k => r[k]).join('\t'))].join('\n') + '\n';
const out = new URL('../logs/work/name-reach.txt', import.meta.url);
mkdirSync(new URL('.', out), { recursive: true });
writeFileSync(out, '# f100/l100: of the top 100 first names/surnames held; m50/w50: of the top 50 a sex held\n' + table);

const share = (k, v) => `${v} ${Math.round(100 * human.filter(e => [].concat(e[k]).includes(v)).length / human.length)}%`;
const pick = k => rows.map(r => r[k]);
console.log(`first names ${F.length} (human ${human.length}), surnames ${L.length}; cultures with a list ${rows.length}`);
console.log(`median of the top 100 held: first ${med(pick('f100'))}, surnames ${med(pick('l100'))}; of the top 50 a sex: men ${med(pick('m50'))}, women ${med(pick('w50'))}`);
console.log('reach per culture, median and cultures under 10: ' + Object.keys(REQUESTS)
    .map(t => `${t} ${med(pick(t))}, ${pick(t).filter(x => x < 10).length}`).join('; '));
console.log('human first names tagged: age ' + ['adult', 'youngAdult', 'child', 'elder'].map(v => share('age', v)).join(', ')
    + '; era ' + ['contemporary', 'midcentury'].map(v => share('era', v)).join(', ') + '; ' + share('commonness', 'common'));
console.log('table: logs/work/name-reach.txt');
