// Milestone 10's reading of list entries: the readers' blind open question, their answers parsed,
// the rule that turns three readers' answers into names, the spellings a culture holds across both
// sexes' lists, and the merge of a name new in both sexes' lists into one ambiguous entry. A list entry is a string, not yet a
// name (Md, Mohd, Abdul and four spellings of Muhammad stand in Saudi Arabia's top 20): readers say
// which peoples give it, what kind of string it is, and which entry above it is the same name.
// The reader is never told the list's country, the culture asked for or what another reader said.
// Surnames (10b): any reader's x rejects one; gendered cultures split a surname by sex, patronymic ones take given names;
// a form its source counts borne by both sexes takes none where a reader says so (10b2: Бойко).
import { norm } from './name-lists.mjs';
import { pool } from './nanogpt.mjs';

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
    [kind, new RegExp(String.raw`^(\d+)[.:]?\s+(?:\S+\s+)?(\S+)\s+([gspax](?:,[gspax])*)\s+(\d+|-)\s+(.+?)\s+${sixth}\s+([pslhu])\s+(\S+)\s*$`, 'i')]));
// A line whose tag fields stray ('9 arabic g - zahra - - - -') still holds people, kind, same and latin;
// its periods, allure and theme are kept only where they have their form.
const LOOSE = /^(\d+)[.:]?\s+(?:\S+\s+)?(\S+)\s+([gspax](?:,[gspax])*)\s+(\d+|-)\s+(\S+)(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?/i;

// A reader that gives two kinds ('s,g') gives the one the question asks for where it is among them.
const kindOf = (k, kind) => k.split(',').find(x => x === (kind === 'last' ? 's' : 'g')) ?? k[0];

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
            peoples, kind: kindOf(m[3].toLowerCase(), kind), same: same && same < Number(m[1]) ? same : null,
            latin: m[5] === '-' ? null : m[5],
            periods: kind === 'first' && /^[A-F]+$/i.test(m[6] ?? '') ? m[6].toUpperCase() : '',
            sex: kind === 'last' && /^[mf]$/i.test(m[6] ?? '') ? m[6].toLowerCase() : null,
            allure: /^[pslhu]$/i.test(m[7] ?? '') ? m[7].toLowerCase() : null, theme: THEMES.includes(m[8]) ? m[8] : null,
        });
    }
    return out;
}

/**
 * Each job's entries ({tag, entries: [{name}]}) read by the three readers through `llm` (a tools/nanogpt.mjs
 * client), six requests at a time; no new request once this run's input passes `budget` over what `llm` had
 * stored. Sets job.answers, one parsed map per reader. `ask` and `parse` replace the question and its parser
 * (10c's tag question, tools/name-tags.mjs); `ask` takes the job.
 */
export async function readJobs(llm, jobs, kind, budget,
    { ask = j => promptFor(j.entries.map(e => e.name), kind), parse = text => parseAnswers(text, kind) } = {}) {
    const base = llm.spent();
    const calls = jobs.flatMap(j => READERS.map(model => ({ j, model })));
    const texts = await pool(calls, 6, ({ j, model }) => llm.ask(model, ask(j),
        { tag: j.tag, extra: EXTRA[model], allow: () => base + llm.stats.input < budget }));
    for (const [ji, j] of jobs.entries()) j.answers = READERS.map((_, r) => parse(texts[ji * READERS.length + r]));
}

/** What each reader said of entry i, "peoples:kind" or none, for the rejected-entry tables. */
export const readersSaid = (answers, i) => answers.map(a => {
    const x = a.get(i);
    return x ? `${[...x.peoples].join(',') || '?'}:${x.kind}` : 'none';
}).join(' ');

/** Union-find over 1..n: one reader's groups, closed over its own "same" answers. */
function groups(n) {
    const up = Array.from({ length: n + 1 }, (_, i) => i);
    const find = i => (up[i] === i ? i : (up[i] = find(up[i])));
    return { find, join: (a, b) => { const x = find(a), y = find(b); if (x !== y) up[Math.max(x, y)] = Math.min(x, y); } };
}

/** The value at least k of the values give (null ones never count), else null. */
export const agreed = (values, k = 2) => {
    const c = new Map();
    for (const v of values) if (v != null) c.set(v, (c.get(v) ?? 0) + 1);
    const best = [...c].filter(([, n]) => n >= k).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
};

/**
 * Three readers' answers to names in rank order. An entry joins the first name above it whose first
 * entry two readers put in one group with it, never by way of a third entry (Саша is not Сергей because
 * one reader joins Sergey with Сергей and another Sergey with Саша); a string is a name of `culture`
 * where two readers call it that kind among that people (a surname: and no reader calls it x). Returns the names in rank order:
 * {form (index), rank (the group's first entry), members, present, keys, sex, tags}, where `present(key)`
 * says whether the culture holds a spelling key already. A surname's group splits by the sex two readers
 * give each entry (Ivanov, Ivanova) where `gendered` says the culture's surnames have a man's and a woman's form,
 * and each form is a name of its own, so both enter; sex null is neither. Elsewhere sex is never read.
 * Where `patronymic` says a culture's surnames are fathers' given names, a given name counts as a surname.
 * Where `sexless(i)` says the source finds entry i borne by both sexes and a reader says so, its form takes no sex (Бойко);
 * where every reader gives it a sex, the women the source counts bear it as a man's form (Попов, Ó Comáin).
 * Where `oneForm(i)` says entry i's form is the same for both sexes (DECLINING), it takes no sex whatever readers say.
 * `also` names a people whose names count as the culture's (hindi for Nepal's given names).
 */
export function decide(names, readers, culture, present, kind = 'first',
    { gendered = false, patronymic = false, sexless = () => false, oneForm = () => false, also = null } = {}) {
    const n = names.length;
    const own = readers.map(a => {
        const g = groups(n);
        for (const [i, x] of a) if (x.same && i <= n) g.join(i, x.same);
        return g;
    });
    const together = (i, j) => own.filter(g => g.find(i) === g.find(j)).length >= 2;
    // A surname list holds what people typed as a family name (الحياه, life; النرجس, narcissus): one reader's x
    // rejects it. Real surnames that are words (الخطيب, Haddad) were read s by all three.
    // Where `patronymic` says surnames are fathers' given names (Ethiopian, Hausa: Musa), a given name is one too.
    const wanted = k => k === KIND_WANTED[kind] || (kind === 'last' && patronymic && k === 'g');
    const ofCulture = x => x.peoples.has(culture) || (also !== null && x.peoples.has(also));
    const isName = i => readers.filter(a => wanted(a.get(i)?.kind) && ofCulture(a.get(i))).length >= 2
        && (kind === 'first' || !readers.some(a => a.get(i)?.kind === 'x'));
    const byRoot = new Map();
    for (let i = 1; i <= n; i++) {
        const r = [...byRoot.keys()].find(r => together(i, r));
        if (r) byRoot.get(r).push(i); else byRoot.set(i, [i]);
    }
    const SEX = { m: 'male', f: 'female' };
    const both = i => oneForm(i) || (sexless(i) && readers.some(a => a.get(i) && !a.get(i).sex));
    const readSex = i => (kind === 'last' && gendered && !both(i) ? SEX[agreed(readers.map(a => a.get(i)?.sex))] ?? null : null);
    // A member no two readers give a sex takes the sex its group lacks where the others hold one only (Juška beside Juškienė).
    const OTHER = { male: 'female', female: 'male' };
    const groupOf = new Map([...byRoot.values()].flatMap(g => g.map(i => [i, g])));
    const sexOf = i => {
        const own = readSex(i);
        if (own || !gendered || kind !== 'last' || both(i)) return own;
        const others = new Set(groupOf.get(i).filter(j => j !== i).map(readSex));
        return others.size === 1 ? OTHER[[...others][0]] ?? null : null;
    };
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
    // Two names of one sex that share a spelling are one (R3: الحربي read as Alharbi, and the entry Alharbi):
    // the later joins the earlier, which keeps its form.
    const merged = [];
    for (const f of out.sort((a, b) => a.rank - b.rank)) {
        const g = merged.find(g => g.sex === f.sex && f.keys.some(k => g.keys.includes(k)));
        if (!g) { merged.push(f); continue; }
        g.members.push(...f.members);
        g.keys = [...new Set([...g.keys, ...f.keys])];
        g.present ||= f.present;
    }
    return merged;
}

/**
 * The one rule from periods (letters of PERIODS) to tags, for names read in milestone 10: adult always, child F,
 * youngAdult E, elder B or C (people alive today); victorian A, nineteenTwenties B, midcentury C, modern E or F,
 * contemporary B to F; sliceOfLife with contemporary, noirDetective B or C. Returns {age, era, genre} in this order.
 */
export function periodTags(periods) {
    const has = p => periods.includes(p);
    const living = /[B-F]/.test(periods);
    return {
        age: [has('F') && 'child', has('E') && 'youngAdult', 'adult', (has('B') || has('C')) && 'elder'].filter(Boolean),
        era: [has('A') && 'victorian', has('B') && 'nineteenTwenties', has('C') && 'midcentury', (has('E') || has('F')) && 'modern',
            living && 'contemporary'].filter(Boolean),
        genre: [living && 'sliceOfLife', (has('B') || has('C')) && 'noirDetective'].filter(Boolean),
    };
}

/**
 * A surname's tags: a family name of living people (from today's lists), so periodTags with D always; `periods` is
 * what 10-fix's read with 10c's question gave (none before it: contemporary only).
 */
export function lastNameTags({ allure, theme, periods = '' }) {
    const { era, genre } = periodTags(periods + 'D');
    return { era, role: ['neutral'], allure, commonness: 'common', genre, themes: theme ? [theme] : [] };
}

/** A first name's tags from its periods: from today's lists, a name of living people, so periodTags with D always. */
export function firstNameTags({ periods, allure, theme }) {
    const { age, era, genre } = periodTags(periods + 'D');
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

/** Whether a source's counts of a surname's bearers (Wikidata's) hold each sex twice and at a twentieth or more: a form
 * of both. On Ukraine's top 200 surnames (10b2) a twentieth put, judged by their endings, 25 forms of both sexes
 * as one sex's and 7 of one sex's as both; a tenth, 30 and 4. Two readers had put all 85 entered as men's.
 * One woman is not enough: Ó Comáin has 2 men and 1 woman on Wikidata. */
export const bothSexes = ({ male = 0, female = 0 }) => Math.min(male, female) >= Math.max(2, 0.05 * (male + female));

/** Cultures whose surnames have a man's and a woman's form (PLAN.md Decisions, milestones 3 and 5). */
export const GENDERED = new Set(['slavicPolish', 'slavicRussian', 'slavicOther', 'icelandic', 'ukrainian', 'turkish', 'swedish',
    'greek', 'nepalese', 'irishGaelic', 'baltic', 'azerbaijani', 'latin']);
/**
 * Where a gendered culture's surname has a woman's form only if it declines: Ukrainian -ов/-ова, -ін/-іна, -ський/-ська,
 * -ий; -енко, -ко, -ук, -ич, -ак and Чайка are one form for both sexes (10b2 review: readers put 10 such as men's).
 */
export const DECLINING = { ukrainian: /(ов|ев|єв|ін|їн|ин|ий|ова|ева|єва|іна|їна|ина|ська|цька|зька|ня)$|(ov|ev|yev|in|yn|yi|ova|eva|yeva|ina|yna|ska|cka)$/u };

/** Cultures whose surnames are mostly fathers' given names (Ethiopian; Hausa in Nigeria's list: Musa, Ibrahim). */
export const PATRONYMIC = new Set(['ethiopian', 'nigerian']);

const sourceOf = e => e.source ?? `name-dataset ${e.country}`;
const isOverused = (keys, name, overused) => keys.some(k => overused.has(k)) || overused.has(norm(name));

/** The `heldOf` of newFirstNames and newSurnames over `entries` (one sex's database list): a culture's spelling keys, built once per culture. */
export function heldBy(entries) {
    const sets = new Map();
    return c => sets.get(c) ?? sets.set(c, new Set(entries.filter(e => e.language_ethnicity === c).map(e => norm(e.name)))).get(c);
}

/**
 * Read first-name lists ({culture, sex, entries, answers}, entries in rank order) to the new names among each
 * list's `top` names, `heldOf(culture)` giving the spelling keys held. A name new in both sexes' lists enters
 * once, as ambiguous; `also[culture]` names a people whose names count as the culture's (decide). Returns {lines,
 * summary, rejected, missingLines, unread}; summary and rejected are rows of tab-separated text, lines
 * {culture, name, gender, source, tags}.
 */
export function newFirstNames(jobs, heldOf, overused, top = 50, { also = {} } = {}) {
    const summary = ['culture\tsex\tread\tanswered(per reader)\tnames\ttop present\tnew\toverused'];
    const rejected = [], lines = [];
    let missingLines = 0, unread = 0;
    for (const j of jobs) {
        if (j.answers.every(a => a.size)) {
            j.names = decide(j.entries.map(e => e.name), j.answers, j.culture, k => heldOf(j.culture).has(k), 'first', { also: also[j.culture] ?? null });
        }
    }
    // R3 across both sexes' lists: a held native entry's reading in one list holds its romanisation in the other.
    const cultures = [...new Set(jobs.map(j => j.culture))];
    const known = new Map(cultures.map(c => [c, knownKeys(jobs.filter(j => j.culture === c && j.names).map(j => j.names), heldOf(c))]));
    for (const j of jobs) {
        if (!j.names) { unread++; continue; }
        missingLines += j.answers.reduce((n, a) => n + j.entries.length - a.size, 0);
        for (const g of j.names) g.present = g.keys.some(k => known.get(j.culture).has(k));
        const named = new Set(j.names.flatMap(g => g.members));
        for (const [i, e] of j.entries.entries()) {
            if (!named.has(i + 1)) rejected.push(`${j.culture}\t${j.sex}\t${e.rank}\t${e.name}\t${readersSaid(j.answers, i + 1)}`);
        }
        let added = 0, slop = 0;
        for (const g of j.names.slice(0, top)) {
            if (g.present) continue;
            const e = j.entries[g.form - 1];
            if (isOverused(g.keys, e.name, overused)) { slop++; continue; }
            lines.push({ culture: j.culture, sex: j.sex, name: e.name, keys: new Set(g.keys), source: sourceOf(e), rank: e.rank, tags: firstNameTags(g) });
            added++;
        }
        summary.push([j.culture, j.sex, j.entries.length, j.answers.map(a => a.size).join('/'), j.names.length,
            j.names.slice(0, top).filter(g => g.present).length, added, slop].join('\t'));
    }
    return { lines: mergeSexes(lines), summary, rejected, missingLines, unread };
}

/**
 * Read surname lists ({culture, entries, answers}) to the new surname forms among each list's `top` surnames
 * after folding, `heldOf(culture)` giving the spelling keys held; a gendered culture's forms carry the sex two
 * readers give them (GENDERED), a patronymic one takes given names (PATRONYMIC). Returns {lines, summary,
 * rejected, entered, missingLines, unread}; lines {culture, name, gender, source, tags}.
 */
export function newSurnames(jobs, heldOf, overused, top = 100) {
    const summary = ['culture\tread\tanswered(per reader)\tsurnames\ttop held\tnew forms\tmale/female/none\toverused'];
    const rejected = [], lines = [], entered = [];
    let missingLines = 0, unread = 0;
    for (const { answers, culture, entries } of jobs) {
        if (!answers.every(a => a.size)) { unread++; continue; }
        missingLines += answers.reduce((n, a) => n + entries.length - a.size, 0);
        const held = heldOf(culture);
        const forms = decide(entries.map(e => e.name), answers, culture, k => held.has(k), 'last', { gendered: GENDERED.has(culture),
            sexless: i => bothSexes(entries[i - 1]), oneForm: i => culture in DECLINING && !DECLINING[culture].test(entries[i - 1].name),
            patronymic: PATRONYMIC.has(culture) });
        // R3: a held native form read as a Latin spelling holds that spelling.
        const known = knownKeys([forms], held);
        const ranks = new Set([...new Set(forms.map(f => f.rank))].slice(0, top));
        const named = new Set(forms.flatMap(f => f.members));
        for (const [i, e] of entries.entries()) {
            if (!named.has(i + 1)) rejected.push(`${culture}\t${e.rank}\t${e.name}\t${readersSaid(answers, i + 1)}`);
        }
        const counts = { male: 0, female: 0, none: 0 };
        let slop = 0;
        for (const f of forms.filter(f => ranks.has(f.rank))) {
            if (f.keys.some(k => known.has(k))) continue;
            const e = entries[f.form - 1];
            if (isOverused(f.keys, e.name, overused)) { slop++; continue; }
            counts[f.sex ?? 'none']++;
            lines.push({ culture, name: e.name, gender: f.sex, source: sourceOf(e), tags: lastNameTags(f) });
            entered.push(`${culture}\t${e.name}\t${e.rank}\t${readersSaid(answers, f.form)}`);
        }
        const groupsHeld = [...ranks].filter(r => forms.filter(f => f.rank === r).every(f => f.keys.some(k => known.has(k)))).length;
        summary.push([culture, entries.length, answers.map(a => a.size).join('/'), ranks.size, groupsHeld,
            Object.values(counts).reduce((a, b) => a + b, 0), Object.values(counts).join('/'), slop].join('\t'));
    }
    return { lines, summary, rejected, entered, missingLines, unread };
}

/** New names as lines of a names file (tools/db.mjs readLines), after `header` comment lines. */
export function namesFileText(header, lines, kind) {
    const list = s => (s.length ? s.join(',') : '-');
    const text = lines.map(m => (kind === 'first'
        ? ['first', m.culture, m.name, m.gender, m.source, list(m.tags.age), list(m.tags.era), list(m.tags.role), m.tags.intelligence,
            m.tags.allure, m.tags.commonness, list(m.tags.genre), list(m.tags.themes)]
        : ['last', m.culture, m.name, m.gender ?? '-', m.source, list(m.tags.era), list(m.tags.role),
            m.tags.allure, m.tags.commonness, list(m.tags.genre), list(m.tags.themes)]).join(' | '));
    return [...header.map(h => '# ' + h), ...text].join('\n') + '\n';
}
