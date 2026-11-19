// Milestone 10c's true tags: three readers read each human name already in the data, per culture, for the
// periods in which it was given there, where a name with no sign of real use there belongs, and how common it is
// today; a tag goes on where two of the three give it (no further judge). commonness follows real rank where
// name-dataset's list of the culture, in the name's script, holds the name; absent from its top 1500 a name is
// never common; a name in another script than its list, or of a culture with no list, takes the readers' answer.
// Shared by tools/m10c-read.mjs (the read), tools/m10c-apply-tags.mjs (the change) and test.js.
import { CULTURES, PERIODS } from './name-read.mjs';
import { countriesOf, norm } from './name-lists.mjs';

/** Where a name with no sign of real use among its people belongs, besides another people of CULTURES. */
export const PLACES = { fantasy: 'invented or of a fantasy world', future: 'of science fiction', ancient: 'borne only in antiquity' };
const NOUN = { first: 'given name', last: 'surname' };

/** The question for one culture's names of one kind, numbered 1.. */
export const tagPromptFor = (names, culture, kind = 'first') => {
    const people = CULTURES[culture];
    return `Below are ${kind === 'first' ? 'given names' : 'surnames'} filed as names of the ${people} people, numbered. Say for each, from what you know of real use among the ${people} people.

Answer one line per name, four fields separated by single spaces: number periods place common
periods: the letters of the periods in which ${kind === 'first' ? 'it was a commonly given name' : 'people bore this surname'} among them, ${Object.entries(PERIODS).map(([k, v]) => `${k} ${v}`).join(', ')}; - if it was never in real use among them
place: - if it is in real use among them; else where it belongs: the key of the people below among whom it is an ordinary ${NOUN[kind]}, ${Object.entries(PLACES).map(([k, v]) => `${k} if ${v}`).join(', ')}; ? if none of these
common: how common it is among them today: c common, u uncommon, r rare or not in use
The peoples:
${Object.entries(CULTURES).map(([k, v]) => `  ${k} = ${v}`).join('\n')}

Example answer lines:
1 CDE - c
2 - fantasy r
3 - german r

No other text. The names:
${names.map((n, i) => `${i + 1} ${n}`).join('\n')}`;
};

// A reader may echo the name after its number, in one word or several: the last three fields are read. A used
// name's line may leave out its place ('11 ABCDE c', MiniMax on 42 of 100).
const TAG_LINE = /^(\d+)[.:)]?\s+(?:.*?\s+)?([A-F]+|-)(?:\s+(\S+))?\s+([cur])\s*$/;

/** Answer text to a map number -> {periods ('' for none), place (null for '-'), common}; other lines are left out. */
export function parseTagAnswers(text) {
    const out = new Map();
    if (!text) return out;
    for (const l of text.replace(/<think>[\s\S]*?<\/think>/g, '').split(/\r?\n/)) {
        const m = l.trim().replace(/[`*]/g, '').match(TAG_LINE);
        if (!m) continue;
        const place = !m[3] || m[3] === '-' ? null : m[3];
        out.set(Number(m[1]), { periods: m[2] === '-' ? '' : m[2], place: place === null || place === '?' || place in PLACES || place in CULTURES ? place : '?', common: m[4] });
    }
    return out;
}

const agreed = (values, k = 2) => {
    const n = new Map();
    for (const v of values) n.set(v, (n.get(v) ?? 0) + 1);
    return [...n].find(([, c]) => c >= k)?.[0] ?? null;
};

/**
 * Three readers' answers on one name to {used, periods, place, common}. used: true or false where two say so, null
 * where no two do (nothing changes); periods: the letters two give; place: of an unused name, where two put it, else
 * null; common: what two say, else null (the entry keeps its own).
 */
export function decideTags(answers) {
    const got = answers.filter(Boolean);
    const yes = got.filter(a => a.periods).length, no = got.length - yes;
    const used = yes >= 2 ? true : no >= 2 ? false : null;
    const periods = Object.keys(PERIODS).filter(p => got.filter(a => a.periods.includes(p)).length >= 2).join('');
    const place = used === false ? agreed(got.filter(a => !a.periods).map(a => a.place).filter(p => p && p !== '?')) : null;
    const common = agreed(got.map(a => a.common));
    return { used, periods: used ? periods : '', place, common };
}

// The tags periods set, which 10c replaces; other eras (ancient, timeless, nearFuture) and genres stay.
const PERIOD_ERAS = ['victorian', 'nineteenTwenties', 'midcentury', 'modern', 'contemporary'];
const PERIOD_GENRES = ['sliceOfLife', 'noirDetective'];
const AGES = ['child', 'youngAdult', 'adult', 'elder'];
const PLACE_TAGS = { fantasy: { era: 'timeless', genre: 'fantasy' }, future: { era: 'nearFuture', genre: 'cyberpunk' }, ancient: { era: 'ancient' } };
const ordered = (all, set) => all.filter(x => set.has(x));

/**
 * An entry's age, era and genre from a decision (decideTags; place a PLACES key or null). A used name takes the
 * periods' tags in place of its old period tags: adult always, child F, youngAdult E, elder B or C (people alive
 * today), victorian A, nineteenTwenties B, midcentury C, modern E or F, contemporary B to F, sliceOfLife with
 * contemporary, noirDetective B or C. An unused one loses its period tags, keeps its age and takes its place's tags.
 * A surname has no age. Returns the changed fields only.
 */
export function tagsFor(entry, { used, periods, place }) {
    if (used === null) return {};
    const has = p => periods.includes(p);
    const era = new Set((entry.era ?? []).filter(x => !PERIOD_ERAS.includes(x)));
    const genre = new Set((entry.genre ?? []).filter(x => !PERIOD_GENRES.includes(x)));
    const out = {};
    if (used) {
        const living = /[B-F]/.test(periods);
        [has('A') && 'victorian', has('B') && 'nineteenTwenties', has('C') && 'midcentury', (has('E') || has('F')) && 'modern',
            living && 'contemporary'].filter(Boolean).forEach(x => era.add(x));
        if (living) genre.add('sliceOfLife');
        if (has('B') || has('C')) genre.add('noirDetective');
        if ('age' in entry) out.age = ordered(AGES, new Set([has('F') && 'child', has('E') && 'youngAdult', 'adult', (has('B') || has('C')) && 'elder'].filter(Boolean)));
    } else if (PLACE_TAGS[place]) {
        const t = PLACE_TAGS[place];
        if (t.era && (t.era !== 'timeless' || era.size === 0)) era.add(t.era);
        if (t.genre) genre.add(t.genre);
    }
    out.era = [...(entry.era ?? []).filter(x => era.has(x)), ...[...era].filter(x => !(entry.era ?? []).includes(x))];
    out.genre = [...(entry.genre ?? []).filter(x => genre.has(x)), ...[...genre].filter(x => !(entry.genre ?? []).includes(x))];
    return out;
}

/** Rank at or under which a list's name is common; the lists hold 1,500 names a country. */
export const COMMON_RANK = 300;
const SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Arabic', 'Hebrew', 'Han', 'Hangul', 'Hiragana', 'Katakana', 'Thai', 'Devanagari', 'Ethiopic',
    'Georgian', 'Armenian', 'Bengali', 'Tamil'];
/** The script of a name's first letter that SCRIPTS names (Japanese kana count as Han, as a list mixes them), else 'other'. */
export const scriptOf = s => {
    const ch = s.match(/\p{L}/u)?.[0] ?? '';
    const sc = SCRIPTS.find(x => new RegExp(`\\p{Script=${x}}`, 'u').test(ch)) ?? 'other';
    return sc === 'Hiragana' || sc === 'Katakana' ? 'Han' : sc;
};

/**
 * Per culture with a name-dataset list of this kind: {rank: key -> best rank over its countries, scripts: the scripts
 * a tenth or more of its entries are written in}. A culture with no list is absent.
 */
export function listRanks(nd, kind, cultures) {
    const out = new Map();
    for (const c of cultures) {
        const ccs = countriesOf(nd, c, kind);
        if (!ccs.length) continue;
        const rank = new Map(), n = new Map();
        for (const cc of ccs) for (const [r, name] of nd[kind][cc]) {
            const k = norm(name);
            if (!rank.has(k) || rank.get(k) > r) rank.set(k, r);
            n.set(scriptOf(name), (n.get(scriptOf(name)) ?? 0) + 1);
        }
        const total = [...n.values()].reduce((a, b) => a + b, 0);
        out.set(c, { rank, scripts: new Set([...n].filter(([, x]) => x >= total / 10).map(([s]) => s)) });
    }
    return out;
}

const COMMON = { c: 'common', u: 'uncommon', r: 'rare' };

/**
 * An entry's commonness: by its rank where its culture's list is in its script (common at COMMON_RANK or under, else
 * uncommon; absent, never common: the readers' u or r, else uncommon); otherwise the readers' (common: c, u, r or
 * null, which keeps it). `ranks` is listRanks' map.
 */
export function commonnessFor(entry, ranks, common) {
    const list = ranks.get(entry.language_ethnicity);
    if (list && list.scripts.has(scriptOf(entry.name))) {
        const r = list.rank.get(norm(entry.name));
        if (r !== undefined) return r <= COMMON_RANK ? 'common' : 'uncommon';
        return common === 'r' ? 'rare' : common === 'u' ? 'uncommon' : entry.commonness === 'rare' ? 'rare' : 'uncommon';
    }
    return COMMON[common] ?? entry.commonness;
}
