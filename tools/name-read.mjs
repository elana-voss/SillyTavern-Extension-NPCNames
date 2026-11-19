// Milestone 10's reading of list entries: the readers' blind open question, their answers parsed,
// the rule that turns three readers' answers into names, the spellings a culture holds across both
// sexes' lists, and the merge of a name new in both sexes' lists into one ambiguous entry. A list entry is a string, not yet a
// name (Md, Mohd, Abdul and four spellings of Muhammad stand in Saudi Arabia's top 20): readers say
// which peoples give it, what kind of string it is, and which entry above it is the same name.
// The reader is never told the list's country, the culture asked for or what another reader said.
import { norm } from './name-lists.mjs';

export const CULTURES = {
    albanian: 'Albanian', arabic: 'Arabic', azerbaijani: 'Azerbaijani', baltic: 'Baltic (Lithuanian, Latvian)', chinese: 'Chinese',
    dutch: 'Dutch, Flemish', english: 'English-speaking', estonian: 'Estonian', ethiopian: 'Ethiopian', fijian: 'Fijian', finnish: 'Finnish',
    french: 'French', german: 'German', ghanaian: 'Ghanaian (Akan and others)', greek: 'Greek', hawaiian: 'Hawaiian',
    hebrew: 'Hebrew, Israeli', hindi: 'Indian (Hindi and other Indian peoples)', hungarian: 'Hungarian', icelandic: 'Icelandic', indonesian: 'Indonesian',
    irishGaelic: 'Irish', italian: 'Italian', japanese: 'Japanese', korean: 'Korean', latin: 'Latin, ancient Roman', maori: 'Maori', mayan: 'Mayan',
    mongolian: 'Mongolian', nativeAmerican: 'Native American', nepalese: 'Nepalese', nigerian: 'Nigerian (Hausa, Igbo and others)',
    norwegian: 'Norwegian', persian: 'Persian, Iranian', portuguese: 'Portuguese, Brazilian', romanian: 'Romanian',
    scandinavian: 'Danish', serbian: 'Serbian', slavicOther: 'Slavic, other (Czech, Slovak, Bulgarian, Croatian, Slovene, Bosnian)',
    slavicPolish: 'Polish', slavicRussian: 'Russian', spanish: 'Spanish, Latin American', swahili: 'Swahili (Tanzania, Kenya)', swedish: 'Swedish', thai: 'Thai',
    turkish: 'Turkish', ukrainian: 'Ukrainian', vietnamese: 'Vietnamese', yoruba: 'Yoruba',
};

/** Periods a name was commonly given in; their letters are the readers' answer. */
export const PERIODS = { A: 'before 1900', B: '1900-1939', C: '1940-1964', D: '1965-1994', E: '1995-2009', F: '2010 on' };
export const ALLURE = { p: 'pretty', s: 'striking', l: 'pleasant', u: 'unremarkable', h: 'harsh' };
export const THEMES = ['floral', 'earthy', 'scholarly', 'religious', 'gemstone', 'mystical', 'airy', 'fiery', 'regal', 'watery',
    'celestial', 'literary', 'solar', 'lunar', 'rustic', 'icy', 'military'];

const FIELD = { first: 'first-name', last: 'surname' };
const KIND_WANTED = { first: 'g', last: 's' };

/** The readers of milestone 10, three vendors; a string is a name on two of three. */
export const READERS = ['meta/muse-spark-1.3-contributor', 'deepseek/deepseek-v4.1-flash', 'minimax/minimax-m3'];
// Muse Spark at its default effort reasons past any token limit on a list of 80 (7,091 reasoning tokens on 3 names).
export const EXTRA = { 'meta/muse-spark-1.3-contributor': { reasoning_effort: 'low', max_tokens: 16000 } };

// The question's parts that differ by kind; the first-name text is 10a's, word for word, so its stored answers hold.
// A surname's sixth field is the sex of the form (milestone 3's gendered surnames), as surnames have no periods.
const ASK = {
    first: {
        fields: 'number peoples kind same latin periods allure theme',
        same: 'same: the number of the first string above it that is the same name in another spelling or script (Muhammad, Mohammed, محمد are one name; a nickname or short form, Mike for Michael, is a name of its own); - if none',
        sixth: 'periods: the letters of the periods in which this was a commonly given name among those peoples, A before 1900, B 1900-1939, C 1940-1964, D 1965-1994, E 1995-2009, F 2010 on; - if none or not a given name',
        examples: `7 english,irishGaelic g - - CDE l -
8 ? a 3 - - u -
9 arabic g 2 Muhammad BCDEF l religious`,
    },
    last: {
        fields: 'number peoples kind same latin sex allure theme',
        same: 'same: the number of the first string above it that is the same surname in another spelling, script or gendered form (Ivanov, Ivanova, Иванова are one surname; Kowalski and Kowalska are one surname); - if none',
        sixth: 'sex: m if this form is borne by men only (Ivanov, Kowalski), f if by women only (Ivanova, Kowalska, Jónsdóttir), - if by both',
        examples: `7 english,irishGaelic s - - - l -
8 ? x - - - u -
9 slavicRussian s 3 - f l -`,
    },
};
const SIXTH = { first: '([A-F]+|-)', last: '([mf]|-)' };

/** The question for one list of entries, numbered 1.. in rank order. */
export const promptFor = (names, kind = 'first') => `Below are strings from a public list of the ${FIELD[kind]} fields people filled in, numbered in the list's order. Say for each what it really is, from what you know of real use.

Answer one line per string, eight fields separated by single spaces: ${ASK[kind].fields}
peoples: the peoples among whom it is an ordinary given name or surname, as it is written here, comma-separated with no spaces, from this list; ? if none or you do not know:
${Object.entries(CULTURES).map(([k, v]) => `  ${k} = ${v}`).join('\n')}
kind: g given name; s surname (family name); p particle, title or part that does not stand alone as a name (Abdul, Abu, bin); a abbreviation or initials (Md, Mohd); x not a name (a word, a place, a phrase)
${ASK[kind].same}
latin: its usual spelling in Latin letters if it is written in another script; - if it is in Latin letters
${ASK[kind].sixth}
allure: how it sounds to those peoples: p pretty, s striking, l pleasant, u unremarkable, h harsh
theme: what its meaning evokes, one of ${THEMES.join(' ')}; - if none or not clear

Example answer lines:
${ASK[kind].examples}

No other text. The strings:
${names.map((n, i) => `${i + 1} ${n}`).join('\n')}`;

// A reader may echo the entry after its number (MiniMax on a list of 240): one token is skipped.
const LINE = Object.fromEntries(Object.entries(SIXTH).map(([kind, sixth]) =>
    [kind, new RegExp(String.raw`^(\d+)[.:]?\s+(?:\S+\s+)?(\S+)\s+([gspax])\s+(\d+|-)\s+(.+?)\s+${sixth}\s+([pslhu])\s+(\S+)\s*$`, 'i')]));
// A line whose tag fields stray ('9 arabic g - zahra - - - -') still holds people, kind, same and latin;
// its periods, allure and theme are kept only where they have their form.
const LOOSE = /^(\d+)[.:]?\s+(?:\S+\s+)?(\S+)\s+([gspax])\s+(\d+|-)\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?/i;

/**
 * Answer text to a map number -> {peoples, kind, same, latin, periods, sex, allure, theme}; a line that does
 * not fit is left out. A first name's sixth field is its periods, a surname's the sex of its form (m, f or null).
 */
export function parseAnswers(text, kind = 'first') {
    const out = new Map();
    if (!text) return out;
    for (const l of text.replace(/<think>[\s\S]*?<\/think>/g, '').split(/\r?\n/)) {
        const t = l.trim().replace(/[`*]/g, '');
        const m = t.match(LINE[kind]) ?? t.match(LOOSE);
        if (!m) continue;
        const peoples = new Set(m[2].split(',').filter(p => p in CULTURES));
        const same = m[4] === '-' ? null : Number(m[4]);
        out.set(Number(m[1]), {
            peoples, kind: m[3].toLowerCase(), same: same && same < Number(m[1]) ? same : null,
            latin: m[5] === '-' ? null : m[5],
            periods: kind === 'first' && /^[A-F]+$/i.test(m[6] ?? '') ? m[6].toUpperCase() : '',
            sex: kind === 'last' && /^[mf]$/i.test(m[6] ?? '') ? m[6].toLowerCase() : null,
            allure: /^[pslhu]$/i.test(m[7] ?? '') ? m[7].toLowerCase() : null, theme: THEMES.includes(m[8]) ? m[8] : null,
        });
    }
    return out;
}

/** Union-find over 1..n: one reader's groups, closed over its own "same" answers. */
function groups(n) {
    const up = Array.from({ length: n + 1 }, (_, i) => i);
    const find = i => (up[i] === i ? i : (up[i] = find(up[i])));
    return { find, join: (a, b) => { const x = find(a), y = find(b); if (x !== y) up[Math.max(x, y)] = Math.min(x, y); } };
}

const agreed = (values, k = 2) => {
    const c = new Map();
    for (const v of values) if (v != null) c.set(v, (c.get(v) ?? 0) + 1);
    const best = [...c].filter(([, n]) => n >= k).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
};

/**
 * Three readers' answers to names in rank order. An entry joins the first name above it whose first
 * entry two readers put in one group with it, never by way of a third entry (Саша is not Сергей because
 * one reader joins Sergey with Сергей and another Sergey with Саша); a string is a name of `culture`
 * where two readers call it that kind among that people. Returns the names in rank order:
 * {form (index), rank (the group's first entry), members, present, keys, sex, tags}, where `present(key)`
 * says whether the culture holds a spelling key already. A surname's group splits by the sex two readers
 * give each entry (Ivanov, Ivanova), and each form is a name of its own, so both enter; sex null is neither.
 */
export function decide(names, readers, culture, present, kind = 'first') {
    const n = names.length;
    const own = readers.map(a => {
        const g = groups(n);
        for (const [i, x] of a) if (x.same && i <= n) g.join(i, x.same);
        return g;
    });
    const together = (i, j) => own.filter(g => g.find(i) === g.find(j)).length >= 2;
    const isName = i => readers.filter(a => a.get(i)?.kind === KIND_WANTED[kind] && a.get(i).peoples.has(culture)).length >= 2;
    const byRoot = new Map();
    for (let i = 1; i <= n; i++) {
        const r = [...byRoot.keys()].find(r => together(i, r));
        if (r) byRoot.get(r).push(i); else byRoot.set(i, [i]);
    }
    const SEX = { m: 'male', f: 'female' };
    const sexOf = i => (kind === 'last' ? SEX[agreed(readers.map(a => a.get(i)?.sex))] ?? null : null);
    const out = [];
    for (const group of byRoot.values()) for (const sex of [...new Set(group.map(sexOf))]) {
        const members = group.filter(i => sexOf(i) === sex);
        const form = members.find(isName);
        if (!form) continue;
        // "latin" is asked only of other scripts; on a Latin-letter entry readers put a related name there (Andy: Andrew).
        // A spelling is a key where two readers give it, or one gives it and no reader another (מיכל: Michal,
        // two blanks); readers who differ give none (דוד: David, Moshe from a reader one line off).
        const latins = members.filter(i => !/\p{Script=Latin}/u.test(names[i - 1])).map(i => {
            const given = readers.map(a => a.get(i)?.latin).filter(Boolean).map(norm).filter(Boolean);
            return agreed(given) ?? (new Set(given).size === 1 ? given[0] : null);
        });
        const keys = [...new Set([...members.map(i => norm(names[i - 1])), ...latins])].filter(Boolean);
        const answers = readers.map(a => a.get(form)).filter(Boolean);
        const periods = Object.keys(PERIODS).filter(p => answers.filter(x => x.periods.includes(p)).length >= 2);
        out.push({
            form, rank: group[0], members, present: keys.some(present), keys, sex,
            periods, allure: ALLURE[agreed(answers.map(x => x.allure))] ?? 'pleasant',
            theme: agreed(answers.map(x => x.theme)),
        });
    }
    return out.sort((a, b) => a.rank - b.rank);
}

/** A surname's tags: a family name of living people; 10c reads its periods. */
export const lastNameTags = ({ allure, theme }) => ({ era: ['contemporary'], role: ['neutral'], allure, commonness: 'common',
    genre: ['sliceOfLife'], themes: theme ? [theme] : [] });

/** A first name's tags from its periods: it is a name of living people, so adult and contemporary always. */
export function firstNameTags({ periods, allure, theme }) {
    const has = p => periods.includes(p);
    const age = [has('F') && 'child', has('E') && 'youngAdult', 'adult', (has('B') || has('C')) && 'elder'].filter(Boolean);
    const era = [has('A') && 'victorian', has('B') && 'nineteenTwenties', has('C') && 'midcentury',
        (has('E') || has('F')) && 'modern', 'contemporary'].filter(Boolean);
    const genre = ['sliceOfLife', (has('B') || has('C')) && 'noirDetective'].filter(Boolean);
    return { age, era, role: ['neutral'], intelligence: 'average', allure, commonness: 'common', genre, themes: theme ? [theme] : [] };
}

/** Spelling keys a culture holds: the held ones and every key of a group in either sex's list that holds one. */
// R3: held מיכל, read as Michal in the women's list, makes the men's list's Michal held.
export function knownKeys(groupLists, held) {
    const known = new Set(held);
    for (const g of groupLists.flat()) if (g.keys.some(k => held.has(k))) for (const k of g.keys) known.add(k);
    return known;
}

/** Lines of new names {culture, sex, keys}: a culture's name new in both sexes' lists enters once, as ambiguous. */
export function mergeSexes(lines) {
    const merged = [];
    for (const l of lines) {
        const twin = merged.find(m => m.culture === l.culture && m.sex !== l.sex && [...l.keys].some(k => m.keys.has(k)));
        if (twin) { twin.gender = 'ambiguous'; continue; }
        merged.push({ ...l, gender: l.sex });
    }
    return merged;
}
