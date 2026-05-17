// Pure picker logic. No DOM, no ST imports. Tests import this directly.

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

const MULTI_VALUE_FIELDS = new Set(['age', 'era', 'role']);

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
    const relaxed = [];
    let current = { ...filters };
    let firstCandidates = filterFirstNames(firstNames, current);
    if (firstCandidates.length === 0) {
        for (const field of DROP_ORDER) {
            if (!(field in current) && !(field === 'themes' && current.themes)) continue;
            delete current[field];
            relaxed.push(field);
            firstCandidates = filterFirstNames(firstNames, current);
            if (firstCandidates.length > 0) break;
        }
    }
    if (firstCandidates.length === 0) {
        throw new Error('No first-name candidates after full degradation');
    }
    const firstPick = pickAndMarkUsed(firstCandidates, usedFirst, e => e.name, rng);

    const culture = firstPick.language_ethnicity;
    let lastCandidates = lastNames.filter(s => s.language_ethnicity === culture);
    if (lastCandidates.length === 0) lastCandidates = lastNames;
    const lastPick = pickAndMarkUsed(lastCandidates, usedLast, s => s.name, rng);

    return buildResponse(firstPick, lastPick, relaxed);
}

function buildResponse(first, last, relaxed) {
    const out = {
        first_name: first.name,
        last_name: last.name,
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
        last_name_role: last.role ?? [],
        last_name_allure: last.allure ?? 'pleasant',
        last_name_commonness: last.commonness,
        last_name_genre: last.genre,
        last_name_themes: last.themes,
    };
    if (first.mythology) out.mythology = first.mythology;
    if (relaxed.length > 0) out.relaxed_filters = relaxed;
    return out;
}

/// Scans the loaded dataset and returns a map of enum field name → sorted
/// array of unique values. Used to build the tool's JSON schema.
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
