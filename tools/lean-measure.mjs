// Milestone 10d's yardstick: the share of common first names the picker gives, per culture and sex,
// for an everyday "adult today" request, and over a chat's first 10, 30 and 100 picks of a few lists.
//
// Run: node tools/lean-measure.mjs
// Writes the per-list table to logs/work/lean-measure.txt; prints a summary of about ten lines.
// Picks go through picker.js `pickName` itself. The first-pick share is an even sweep of the random
// draw (exact up to rounding); the chat shares are the mean of CHATS random chats, each keeping its used list.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pickName } from '../picker.js';
import { loadDb } from './db.mjs';

const ADULT_TODAY = { race: 'human', age: 'adult', era: ['modern', 'contemporary'], genre: 'sliceOfLife' };
const CHAT_LISTS = [['hawaiian', 'female'], ['thai', 'male'], ['english', 'female']];
const WINDOWS = [10, 30, 100];
const SWEEP = 2000;
const CHATS = 300;

const db = loadDb();
const filtersOf = (culture, gender) => ({ ...ADULT_TODAY, language_ethnicity: culture, gender });
// The culture's names alone give the same pick as the whole list, faster.
const namesOf = culture => db.first_names.filter(e => e.language_ethnicity === culture);
const surname = [{ name: '-', language_ethnicity: '-', commonness: 'common' }];

function firstPickShare(culture, gender) {
    const names = namesOf(culture);
    let common = 0;
    for (let k = 0; k < SWEEP; k++) {
        const pick = pickName(names, surname, filtersOf(culture, gender), new Set(), new Set(), max => Math.floor(k / SWEEP * max));
        if (pick.relaxed_filters?.some(f => f !== 'genre')) return null; // no name matches every filter
        if (pick.commonness === 'common') common++;
    }
    return common / SWEEP;
}

function chatShares(culture, gender) {
    const names = namesOf(culture);
    const common = WINDOWS.map(() => 0);
    const rng = max => Math.floor(Math.random() * max);
    for (let chat = 0; chat < CHATS; chat++) {
        const used = new Set();
        for (let p = 1; p <= WINDOWS.at(-1); p++) {
            const pick = pickName(names, surname, filtersOf(culture, gender), used, new Set(), rng);
            if (pick.commonness !== 'common') continue;
            WINDOWS.forEach((w, i) => { if (p <= w) common[i]++; });
        }
    }
    return WINDOWS.map((w, i) => common[i] / CHATS / w);
}

const pct = v => `${Math.round(100 * v)}%`;
const cultures = [...new Set(db.first_names.filter(e => e.race === 'human').map(e => e.language_ethnicity))].sort();
const rows = [];
for (const culture of cultures) for (const gender of ['male', 'female']) rows.push({ culture, gender, share: firstPickShare(culture, gender) });
const held = rows.filter(r => r.share !== null);
const lines = held.map(r => `${r.culture.padEnd(16)} ${r.gender.padEnd(6)} ${pct(r.share).padStart(4)}`);
const chats = CHAT_LISTS.map(([c, g]) => `${c} ${g}: common names over picks 1-${WINDOWS.join(', 1-')}: ${chatShares(c, g).map(pct).join(', ')}`);
mkdirSync('logs/work', { recursive: true });
writeFileSync('logs/work/lean-measure.txt', ['culture sex share of common names at the first pick ("adult today")', ...lines, '', ...chats, ''].join('\n'));

const sorted = held.map(r => r.share).sort((a, b) => a - b);
const near = held.filter(r => Math.abs(r.share - 0.7) <= 0.015);
console.log(`lists ${held.length} (no "adult today" names: ${rows.length - held.length}); median share ${pct(sorted[Math.floor(sorted.length / 2)])}`);
console.log(`at 70%: ${near.length}; above: ${held.filter(r => r.share > 0.715).length}; below: ${held.filter(r => r.share < 0.685).map(r => `${r.culture} ${r.gender} ${pct(r.share)}`).join(', ')}`);
for (const line of chats) console.log(line);
console.log('table: logs/work/lean-measure.txt');
