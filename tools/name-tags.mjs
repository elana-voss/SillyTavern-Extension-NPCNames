// Milestone 10c's true tags: three readers read each human name already in the data, per culture, for the
// periods in which it was given there, where a name with no sign of real use there belongs, and how common it is
// today; a tag goes on where two of the three give it (no further judge). commonness follows real rank where
// name-dataset's list of the culture, in the name's script, holds the name; absent from its top 1500 a name is
// never common; a name in another script than its list, or of a culture with no list, takes the readers' answer.
// Shared by tools/m10c-read.mjs (the read), tools/m10c-apply-tags.mjs (the change) and test.js.
import { agreed, CULTURES, PERIODS, periodTags } from './name-read.mjs';
import { countriesOf, norm, SEXES } from './name-lists.mjs';

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

// A line is number, periods, one or two place fields, common. A used name's line may leave out its place
// ('11 ABCDE c', MiniMax on 42 of 100); a reader may write two place fields ('1 ABC - slavicOther u', '1 - ancient - r'),
// of which the first that is not '-' is read. A reader may echo the name after its number, in one word or several;
// the plain form is tried first, then the shortest echo, so '1 CDE - c' reads periods CDE, not an echoed 'CDE'.
const TAG_LINE = /^(\d+)[.:)]?\s+(.+?)\s+([cur])\s*$/;
const PERIOD_FIELD = /^([A-F]+|-)$/;
/** A people's name readers wrote in place of its key (10c's answers), to the key. */
const PLACE_ALIASES = { bulgarian: 'slavicOther', croatian: 'slavicOther', slovak: 'slavicOther', slovene: 'slavicOther',
    slovenian: 'slavicOther', czech: 'slavicOther', bosnian: 'slavicOther', russian: 'slavicRussian', polish: 'slavicPolish', danish: 'scandinavian' };
const placeOf = p => p === '?' || p in PLACES || p in CULTURES ? p : PLACE_ALIASES[p] ?? '?';

/** Answer text to a map number -> {periods ('' for none), place (null for '-'), common}; other lines are left out. */
export function parseTagAnswers(text) {
    const out = new Map();
    if (!text) return out;
    for (const l of text.replace(/<think>[\s\S]*?<\/think>/g, '').split(/\r?\n/)) {
        const m = l.trim().replace(/[`*]/g, '').match(TAG_LINE);
        if (!m) continue;
        const f = m[2].split(/\s+/);
        const skip = f.findIndex((x, i) => f.length - i <= 3 && PERIOD_FIELD.test(x));
        if (skip < 0) continue;
        const place = f.slice(skip + 1).find(x => x !== '-') ?? null;
        out.set(Number(m[1]), { periods: f[skip] === '-' ? '' : f[skip], place: place && placeOf(place), common: m[3] });
    }
    return out;
}

/** Whether one reader gave the same line for each of a list's n names (10 or more): no reading, set aside. */
export const isBlanket = (answer, n) => n >= 10 && answer.size === n && new Set([...answer.values()].map(a => JSON.stringify(a))).size === 1;

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

/**
 * The decision on a name milestone 10 added from today's lists (10-fix): used, as the list shows; the periods two
 * readers agree on (decideTags) with D always, as firstNameTags and lastNameTags give a name of living people; its
 * place and commonness stay as its list set them.
 */
export function decideNew(answers) {
    const { periods } = decideTags(answers);
    return { used: true, periods: Object.keys(PERIODS).filter(p => periods.includes(p) || p === 'D').join(''), place: null, common: null };
}

// The tags periods set, which 10c replaces; other eras (ancient, timeless, nearFuture) and genres stay.
const PERIOD_ERAS = ['victorian', 'nineteenTwenties', 'midcentury', 'modern', 'contemporary'];
const PERIOD_GENRES = ['sliceOfLife', 'noirDetective'];
const PLACE_TAGS = { fantasy: { era: 'timeless', genre: 'fantasy' }, future: { era: 'nearFuture', genre: 'cyberpunk' }, ancient: { era: 'ancient' } };

/**
 * An entry's age, era and genre from a decision (decideTags; place a PLACES key or null). A used name takes the
 * periods' tags (name-read.mjs periodTags) in place of its old period tags. An unused one loses its period tags, keeps its age and takes its place's tags
 * (fantasy, future, ancient). With no agreed period, or no such place, nothing changes: the name keeps its tags rather
 * than match no era. A surname has no age. Returns the changed fields only.
 */
export function tagsFor(entry, { used, periods, place }) {
    if (used === null || (used ? !periods : !PLACE_TAGS[place])) return {};
    const era = new Set((entry.era ?? []).filter(x => !PERIOD_ERAS.includes(x)));
    const genre = new Set((entry.genre ?? []).filter(x => !PERIOD_GENRES.includes(x)));
    const out = {};
    if (used) {
        const t = periodTags(periods);
        t.era.forEach(x => era.add(x));
        t.genre.forEach(x => genre.add(x));
        if ('age' in entry) out.age = t.age;
    } else if (PLACE_TAGS[place]) {
        const t = PLACE_TAGS[place];
        if (t.era && (t.era !== 'timeless' || era.size === 0)) era.add(t.era);
        if (t.genre) genre.add(t.genre);
    }
    out.era = [...(entry.era ?? []).filter(x => era.has(x)), ...[...era].filter(x => !(entry.era ?? []).includes(x))];
    out.genre = [...(entry.genre ?? []).filter(x => genre.has(x)), ...[...genre].filter(x => !(entry.genre ?? []).includes(x))];
    return out;
}

/**
 * A new name's tags (firstNameTags) where its people is one of antiquity alone (Latin): as 10c tags a name borne only
 * in antiquity (tagsFor, place ancient), adult and rare, as 10c's readers left the older Latin names.
 */
export const ancientTags = tags => ({ ...tags, ...tagsFor(tags, { used: false, periods: '', place: 'ancient' }), age: ['adult'], commonness: 'rare' });

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
 * Per culture with a name-dataset list of this kind: {rank: key -> best rank over its countries (a first name's: its rank less the other sex's names ranked
 * above it, its place among its sex's names as
 * 10a's per-sex top 50 counts; a plain rank is mostly men's), scripts: the scripts
 * a tenth or more of its entries are written in}. A culture with no list is absent.
 */
export function listRanks(nd, kind, cultures) {
    const out = new Map();
    for (const c of cultures) {
        const ccs = countriesOf(nd, c, kind);
        if (!ccs.length) continue;
        const rank = new Map(), n = new Map();
        for (const cc of ccs) {
            const before = new Map(Object.keys(SEXES).map(s => [s, 0]));
            for (const row of [...nd[kind][cc]].sort((a, b) => a[0] - b[0])) {
                const [r0, name] = row, k = norm(name);
                const sex = Object.keys(SEXES).find(s => SEXES[s](row));
                const r = kind === 'first' ? r0 - Object.keys(SEXES).filter(s => s !== sex).reduce((x, s) => x + before.get(s), 0) : r0;
                before.set(sex, before.get(sex) + 1);
                if (!rank.has(k) || rank.get(k) > r) rank.set(k, r);
                n.set(scriptOf(name), (n.get(scriptOf(name)) ?? 0) + 1);
            }
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

/**
 * Applies the decisions (kind|culture|name -> decideTags' result) to one kind's entries, changing them in place. An
 * unused human name two readers put with another people moves there, takes commonness from that people's list (not
 * the readers', who read it for the old one) and, a surname, loses its gender where that people's surnames carry
 * none; or, the same name held there already, joins it and leaves. Any other decided name takes tagsFor's tags. Every
 * human name's commonness follows commonnessFor. Returns the entries kept and the changes, {culture, what: tags,
 * common, out or in, line}.
 */
export function applyTags(list, kind, decisions, ranks) {
    const key = (culture, name) => `${culture}|${norm(name)}`;
    const held = new Map();
    for (const e of list) held.set(key(e.language_ethnicity, e.name), (held.get(key(e.language_ethnicity, e.name)) ?? 0) + 1);
    const gendered = new Set(list.filter(e => e.gender).map(e => e.language_ethnicity));
    const gone = new Set(), events = [];
    const note = (culture, what, name, text) => events.push({ culture, what, line: `${kind} | ${culture} | ${name} | ${text}` });
    for (const e of list) {
        if (e.race !== 'human') continue;
        const was = e.language_ethnicity;
        const d = decisions.get(`${kind}|${was}|${e.name}`);
        let common = d?.common ?? null;
        if (d && d.used === false && d.place in CULTURES && d.place !== was) {
            held.set(key(was, e.name), held.get(key(was, e.name)) - 1);
            if (held.get(key(d.place, e.name))) {
                gone.add(e);
                note(was, 'out', e.name, `joins ${d.place}`);
                continue;
            }
            held.set(key(d.place, e.name), 1);
            e.language_ethnicity = d.place;
            note(was, 'out', e.name, `moves to ${d.place}`);
            note(d.place, 'in', e.name, `came from ${was}`);
            if (kind === 'last' && e.gender && !gendered.has(d.place)) {
                note(d.place, 'tags', e.name, `gender ${e.gender} -> -`);
                delete e.gender;
            }
            common = null;
        } else if (d) {
            const t = tagsFor(e, d);
            const diff = Object.entries(t).filter(([k, v]) => JSON.stringify(e[k] ?? []) !== JSON.stringify(v));
            for (const [k, v] of diff) {
                note(was, 'tags', e.name, `${k} ${(e[k] ?? []).join(',') || '-'} -> ${v.join(',') || '-'}`);
                e[k] = v;
            }
        }
        const c = commonnessFor(e, ranks, common);
        if (c !== e.commonness) {
            note(e.language_ethnicity, 'common', e.name, `commonness ${e.commonness} -> ${c}`);
            e.commonness = c;
        }
    }
    return { list: list.filter(e => !gone.has(e)), events };
}
