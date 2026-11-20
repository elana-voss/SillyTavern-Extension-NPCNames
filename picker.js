// The name pick: filters (dropped in DROP_ORDER when nothing matches), the used list per chat, a
// first name leaning to names of the story's genre (never a filter) and to common names (leanPick),
// and a surname of the first name's culture.
export const DROP_ORDER = [
    'themes',
    'allure',
    'intelligence',
    'commonness',
    'role',
    'age',
    'era',
    'mythology',
    'race',
    'language_ethnicity',
    'gender',
];

// The value is a list after normalizeFilters; an entry's field is one value or a list.
function matches(entryValue, wanted) {
    return Array.isArray(entryValue)
        ? wanted.some(v => entryValue.includes(v))
        : wanted.includes(entryValue);
}

// A genre is no filter: it is ignored here and only makes fitting names likelier (pickAndMarkUsed).
export function filterFirstNames(pool, f) {
    return pool.filter(e => DROP_ORDER.every(field => !f[field] || matches(e[field], f[field])));
}

// T unused names carrying the genre take a pick with chance min(1, T / GENRE_FULL).
const GENRE_FULL = 20;

// The same name in two cultures counts as two names.
const usedKey = e => `${e.language_ethnicity}/${e.name}`;

// A used list as a chat stored it. An earlier version stored bare names, which
// count as used in every culture holding them; a name gone from the data drops out.
export function readUsed(stored, pool) {
    if (!Array.isArray(stored)) return new Set();
    const used = new Set();
    const bare = new Set();
    for (const item of stored) {
        if (typeof item !== 'string') continue;
        if (item.includes('/')) used.add(item);
        else bare.add(item);
    }
    if (bare.size > 0) {
        for (const e of pool) if (bare.has(e.name)) used.add(usedKey(e));
    }
    return used;
}

// With `lean`, the pick leans to common names (leanPick); without, every unused match is as likely.
// With `genre` (a list), names carrying it are preferred first, as GENRE_FULL says.
export function pickAndMarkUsed(candidates, usedSet, rng = secureRandom, lean = false, genre = null) {
    // Empty used-set is the common first-pick case — skip the filter+copy.
    let unused = usedSet.size === 0
        ? candidates
        : candidates.filter(e => !usedSet.has(usedKey(e)));
    if (unused.length === 0) {
        for (const e of candidates) usedSet.delete(usedKey(e));
        unused = candidates;
    }
    if (genre) {
        const fitting = unused.filter(e => matches(e.genre, genre));
        if (fitting.length > 0 && rng(2 ** 32) / 2 ** 32 < fitting.length / GENRE_FULL) {
            unused = fitting;
        }
    }
    const pick = lean ? leanPick(unused, rng) : unused[rng(unused.length)];
    usedSet.add(usedKey(pick));
    return pick;
}

// Common names come COMMON_TARGET of the picks in every language, whatever its list's sizes:
// a common name weighs x*x, an uncommon one x, a rare one 1, with x set at each pick from the
// unused matches. x is never under 1 (a less usual name is never likelier; a list already
// mostly common stays an even pick) nor over MAX_LEAN. No name is left out, so this is no filter.
const COMMON_TARGET = 0.7;
const MAX_LEAN = 4;
const CLASSES = ['common', 'uncommon', 'rare'];
// A name with no class weighs as a rare one.
function classOf(e) {
    const i = CLASSES.indexOf(e.commonness);
    return i === -1 ? 2 : i;
}

// The x at which common names make COMMON_TARGET of the weight: c*x*x / (c*x*x + u*x + r) = T.
function leanFor([c, u, r]) {
    if (c === 0) return MAX_LEAN;
    if (u + r === 0) return 1;
    const a = (1 - COMMON_TARGET) * c;
    const x = (COMMON_TARGET * u + Math.sqrt((COMMON_TARGET * u) ** 2 + 4 * a * COMMON_TARGET * r)) / (2 * a);
    return Math.min(MAX_LEAN, Math.max(1, x));
}

function leanPick(unused, rng) {
    const sizes = [0, 0, 0];
    for (const e of unused) sizes[classOf(e)]++;
    const x = leanFor(sizes);
    if (x === 1) return unused[rng(unused.length)];
    const weight = [x * x, x, 1];
    let ticket = rng(2 ** 32) / 2 ** 32 * (sizes[0] * weight[0] + sizes[1] * weight[1] + sizes[2]);
    for (const e of unused) {
        ticket -= weight[classOf(e)];
        if (ticket < 0) return e;
    }
    return unused[unused.length - 1]; // rounding left the ticket at the very end
}

function secureRandom(max) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
}

export function pickName(firstNames, lastNames, filters, usedFirst, usedLast, rng = secureRandom) {
    if (firstNames.length === 0 || lastNames.length === 0) {
        throw new Error('Name database is empty');
    }
    const { current, relaxed } = relaxFilters(firstNames, normalizeFilters(filters));
    const firstCandidates = filterFirstNames(firstNames, current);
    if (firstCandidates.length === 0) {
        throw new Error('No first-name candidates after full degradation');
    }
    // A commonness the AI asked for decides alone: among the names it allows the pick stays even.
    const firstPick = pickAndMarkUsed(firstCandidates, usedFirst, rng, !current.commonness, current.genre);

    // A god gets no surname. Nor does a culture without surnames (dragons, handles,
    // Native American figures, Mongolian) rather than one from an unrelated culture.
    // A surname with a gender goes to that gender and to an ambiguous character only.
    const lastCandidates = firstPick.race === 'mythical' ? [] : lastNames.filter(
        s => s.language_ethnicity === firstPick.language_ethnicity && s.name !== firstPick.name
            && (!s.gender || firstPick.gender === 'ambiguous' || s.gender === firstPick.gender),
    );
    const lastPick = lastCandidates.length > 0
        ? pickAndMarkUsed(lastCandidates, usedLast, rng)
        : null;

    return buildResponse(firstPick, lastPick, relaxed);
}

// Every filter becomes a list of its wanted values; an empty value or list is no filter.
function normalizeFilters(filters) {
    const isValue = v => v !== null && v !== undefined && v !== '';
    const out = {};
    for (const [field, value] of Object.entries(filters)) {
        const wanted = [].concat(value).filter(isValue);
        if (wanted.length > 0) out[field] = wanted;
    }
    return out;
}

// Drops filters in DROP_ORDER until a name matches, then puts back every
// dropped filter that was not part of the conflict, most important first.
function relaxFilters(firstNames, filters) {
    const current = { ...filters };
    const dropped = [];
    for (const field of DROP_ORDER) {
        if (filterFirstNames(firstNames, current).length > 0) break;
        if (!(field in current)) continue;
        delete current[field];
        dropped.push(field);
    }
    for (const field of [...dropped].reverse()) {
        const trial = { ...current, [field]: filters[field] };
        if (filterFirstNames(firstNames, trial).length === 0) continue;
        current[field] = filters[field];
        dropped.splice(dropped.indexOf(field), 1);
    }
    return { current, relaxed: dropped };
}

function buildResponse(first, last, relaxed) {
    const out = {
        first_name: first.name,
        gender: first.gender,
        language_ethnicity: first.language_ethnicity,
        race: first.race,
        age: first.age,
        era: first.era,
        role: first.role,
        intelligence: first.intelligence,
        allure: first.allure,
        commonness: first.commonness,
        genre: first.genre,
        themes: first.themes,
    };
    if (last) {
        out.last_name = last.name;
        out.last_name_role = last.role;
        out.last_name_allure = last.allure;
        out.last_name_commonness = last.commonness;
        out.last_name_genre = last.genre;
        out.last_name_themes = last.themes;
    }
    if (first.mythology) out.mythology = first.mythology;
    if (relaxed.length > 0) out.relaxed_filters = relaxed;
    return out;
}

export function deriveEnumValues(firstNames) {
    const collect = (field) => {
        const s = new Set();
        for (const e of firstNames) {
            const v = e[field];
            if (Array.isArray(v)) v.forEach(x => s.add(x));
            else if (v != null) s.add(v);
        }
        return [...s].sort();
    };
    return {
        gender: collect('gender'),
        language_ethnicity: collect('language_ethnicity'),
        mythology: collect('mythology'),
        race: collect('race'),
        age: collect('age'),
        era: collect('era'),
        role: collect('role'),
        intelligence: collect('intelligence'),
        allure: collect('allure'),
        commonness: collect('commonness'),
        genre: collect('genre'),
        themes: collect('themes'),
    };
}
