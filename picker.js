export const DROP_ORDER = [
    'themes',
    'allure',
    'intelligence',
    'commonness',
    'role',
    'age',
    'genre',
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

export function filterFirstNames(pool, f) {
    return pool.filter(e => DROP_ORDER.every(field => {
        if (!f[field] || matches(e[field], f[field])) return true;
        // Empty entry-genre = compatible with any genre filter (escape hatch).
        return field === 'genre' && e.genre.length === 0;
    }));
}

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

export function pickAndMarkUsed(candidates, usedSet, rng = secureRandom) {
    // Empty used-set is the common first-pick case — skip the filter+copy.
    let unused = usedSet.size === 0
        ? candidates
        : candidates.filter(e => !usedSet.has(usedKey(e)));
    if (unused.length === 0) {
        for (const e of candidates) usedSet.delete(usedKey(e));
        unused = candidates;
    }
    const pick = unused[rng(unused.length)];
    usedSet.add(usedKey(pick));
    return pick;
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
    let firstCandidates = filterFirstNames(firstNames, current);
    if (firstCandidates.length === 0) {
        throw new Error('No first-name candidates after full degradation');
    }
    if (current.genre) firstCandidates = preferTagged(firstCandidates, current.genre, usedFirst);
    const firstPick = pickAndMarkUsed(firstCandidates, usedFirst, rng);
    if (current.genre && !matches(firstPick.genre, current.genre)) relaxed.push('genre');

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

// Untagged names only stand in once no unused name carries the genre. When every
// candidate is used, the reset falls on them all and the tagged ones go first.
function preferTagged(candidates, genre, usedSet) {
    const tagged = candidates.filter(e => matches(e.genre, genre));
    if (tagged.length === 0) return candidates;
    if (tagged.some(e => !usedSet.has(usedKey(e)))) return tagged;
    if (candidates.some(e => !usedSet.has(usedKey(e)))) return candidates;
    for (const e of candidates) usedSet.delete(usedKey(e));
    return tagged;
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
