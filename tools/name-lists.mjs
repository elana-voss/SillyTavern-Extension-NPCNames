// name-dataset's lists of common names per country, read per culture of the database: which
// countries stand for a culture, and a culture's entries per sex in rank order. Shared by
// tools/name-reach.mjs and milestone 10's tools. The list file is milestone 5's download,
// git-ignored at logs/work/m5/nd.json: `first`/`last` per country code, rows [rank, name, M, F].
import { readFileSync } from 'node:fs';

/** Countries whose lists stand for a culture; an empty list, or countries with no list, gives none. */
export const COUNTRIES = {
    albanian: ['AL'], arabic: ['SA', 'EG', 'MA', 'IQ', 'JO'], azerbaijani: ['AZ'], chinese: ['CN', 'TW', 'HK'],
    dutch: ['NL', 'BE'], english: ['US', 'GB', 'AU', 'CA', 'IE'], estonian: ['EE'], ethiopian: ['ET'], fijian: ['FJ'],
    finnish: ['FI'], french: ['FR'], german: ['DE', 'AT'], ghanaian: ['GH'], greek: ['GR'], hebrew: ['IL'], hindi: ['IN'],
    hungarian: ['HU'], icelandic: ['IS'], indonesian: ['ID'], irishGaelic: ['IE'], italian: ['IT'], japanese: ['JP'],
    korean: ['KR'], baltic: ['LT', 'LV'], nepalese: ['NP'], nigerian: ['NG'], norwegian: ['NO'], persian: ['IR'],
    portuguese: ['PT', 'BR'], romanian: ['RO'], scandinavian: ['DK'], serbian: ['RS'], slavicPolish: ['PL'],
    slavicRussian: ['RU'], slavicOther: ['BG', 'CZ', 'SK', 'HR', 'SI', 'BA'], spanish: ['ES', 'MX', 'AR', 'CO'],
    swedish: ['SE'], thai: ['TH'], turkish: ['TR'], ukrainian: ['UA'], vietnamese: ['VN'], swahili: ['TZ', 'KE'],
    yoruba: [], maori: [], hawaiian: [], mayan: [], mongolian: ['MN'], nativeAmerican: [], latin: [],
};

/** Comparison key of a spelling: lower case, accents and non-letters removed; scripts stay apart. */
export const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}]/gu, '');

export const SEXES = { male: r => r[2] >= r[3], female: r => r[3] > r[2] };

export function loadLists(url = new URL('../logs/work/m5/nd.json', import.meta.url)) {
    return JSON.parse(readFileSync(url, 'utf8'));
}

/** Countries of a culture that have a list of this kind. */
export const countriesOf = (nd, culture, kind = 'first') => (COUNTRIES[culture] ?? []).filter(cc => nd[kind][cc]);

/**
 * A culture's entries in rank order, one per spelling key, at its best rank over the culture's
 * countries: [{name, rank, country, key}]. `sex` keeps the rows whose M or F share is larger.
 */
export function rankedEntries(nd, culture, kind = 'first', sex = null) {
    const best = new Map();
    for (const cc of countriesOf(nd, culture, kind)) {
        for (const r of nd[kind][cc]) {
            if (sex && !SEXES[sex](r)) continue;
            const key = norm(r[1]);
            if (key.length < 2) continue;
            const old = best.get(key);
            if (!old || old.rank > r[0]) best.set(key, { name: r[1], rank: r[0], country: cc, key });
        }
    }
    return [...best.values()].sort((a, b) => a.rank - b.rank);
}
