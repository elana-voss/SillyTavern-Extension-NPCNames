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

export function filterFirstNames(pool, f) {
    return pool.filter(e => {
        if (f.gender && e.gender !== f.gender) return false;
        if (f.language_ethnicity && e.language_ethnicity !== f.language_ethnicity) return false;
        if (f.mythology && e.mythology !== f.mythology) return false;
        if (f.race && e.race !== f.race) return false;
        if (f.age && !e.age.includes(f.age)) return false;
        if (f.era && !e.era.includes(f.era)) return false;
        if (f.role && !e.role.includes(f.role)) return false;
        if (f.intelligence && e.intelligence !== f.intelligence) return false;
        if (f.allure && e.allure !== f.allure) return false;
        if (f.commonness && e.commonness !== f.commonness) return false;
        // Empty entry-genre = compatible with any genre filter (escape hatch).
        if (f.genre && e.genre.length > 0 && !e.genre.includes(f.genre)) return false;
        if (f.themes && f.themes.length > 0 &&
            !f.themes.some(t => e.themes.includes(t))) return false;
        return true;
    });
}

export function pickAndMarkUsed(candidates, usedSet, nameOf, rng = secureRandom) {
    // Empty used-set is the common first-pick case — skip the filter+copy.
    let unused = usedSet.size === 0
        ? candidates
        : candidates.filter(e => !usedSet.has(nameOf(e)));
    if (unused.length === 0) {
        for (const e of candidates) usedSet.delete(nameOf(e));
        unused = candidates;
    }
    const pick = unused[rng(unused.length)];
    usedSet.add(nameOf(pick));
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
    // Untagged names only stand in once no unused name carries the genre.
    if (current.genre) {
        const tagged = firstCandidates.filter(
            e => e.genre.includes(current.genre) && !usedFirst.has(e.name),
        );
        if (tagged.length > 0) firstCandidates = tagged;
    }
    const firstPick = pickAndMarkUsed(firstCandidates, usedFirst, e => e.name, rng);
    if (current.genre && !firstPick.genre.includes(current.genre)) relaxed.push('genre');

    // A god gets no surname. Nor does a culture without surnames (dragons, handles,
    // Native American figures) rather than one from an unrelated culture.
    const lastCandidates = firstPick.race === 'mythical' ? [] : lastNames.filter(
        s => s.language_ethnicity === firstPick.language_ethnicity && s.name !== firstPick.name,
    );
    const lastPick = lastCandidates.length > 0
        ? pickAndMarkUsed(lastCandidates, usedLast, s => s.name, rng)
        : null;

    return buildResponse(firstPick, lastPick, relaxed);
}

function normalizeFilters(filters) {
    const out = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    );
    if ('themes' in out) out.themes = [].concat(out.themes);
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
