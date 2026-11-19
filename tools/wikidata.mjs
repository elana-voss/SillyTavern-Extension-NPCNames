// The Wikidata (CC0) query service client of the data tools, and the rank lists made from it: how
// many people on Wikidata bear a given name or family name, per culture's people. Each query's CSV is
// stored under the caller's folder, keyed by the query, so a rerun asks nothing.
// The service's limits (its user manual, read 2026-11-19): 60 s a query; one client (user agent and IP)
// 60 s of processing each 60 s and 30 error queries a minute; 5 parallel queries per IP; over a limit,
// 429 with Retry-After, and a client that ignores it may be banned; a User-Agent naming the client.
// So queries run one at a time, 2 s apart; a 429 waits its Retry-After; three failures give up the query.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { norm } from './name-lists.mjs';
import { foldName } from './overused.mjs';

const ENDPOINT = 'https://query.wikidata.org/sparql';
// A generic client name, no personal details.
const USER_AGENT = 'NPCNameSuggester-data-tool/1.0 (name lists for a role-play extension)';
const GAP_MS = 2000;

/** CSV text (the service's, with a header line) to rows of objects; quoted fields may hold commas and "". */
export function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const [head, ...body] = rows;
    return body.filter(r => r.some(Boolean)).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** A client storing each query's CSV in `dir` (a URL ending in /) and logging to `dir`/../wikidata.log. */
export function wikidata(dir, { fetchFn = fetch, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    mkdirSync(dir, { recursive: true });
    const log = new URL('../wikidata.log', dir);
    const note = line => appendFileSync(log, `${new Date().toISOString()} ${line}\n`);
    const stats = { asked: 0, cached: 0, fail: 0, limited: 0 };

    /** The query's rows, or null after three failed tries (each logged with its status and text). */
    async function query(sparql, tag = '') {
        const file = new URL(createHash('sha256').update(sparql).digest('hex') + '.csv', dir);
        if (existsSync(file)) { stats.cached++; return parseCsv(readFileSync(file, 'utf8')); }
        for (let i = 0; i < 3; i++) {
            await wait(GAP_MS);
            try {
                const r = await fetchFn(ENDPOINT, {
                    method: 'POST', signal: AbortSignal.timeout(90000),
                    headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv', 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'query=' + encodeURIComponent(sparql),
                });
                const text = await r.text();
                if (r.status === 429) {
                    stats.limited++;
                    const s = Number(r.headers.get('retry-after')) || 60;
                    note(`LIMIT 429 ${tag} retry-after ${s}`);
                    await wait(s * 1000); continue;
                }
                // A timeout inside the service comes back as 500 with a Java stack, or as a 200 cut short.
                if (r.status !== 200 || /java\.util\.concurrent|TimeoutException/.test(text)) {
                    stats.fail++; note(`FAIL ${r.status} ${tag} ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
                    await wait(10000); continue;
                }
                writeFileSync(file, text);
                stats.asked++; note(`OK ${tag} rows=${text.split('\n').length - 2}`);
                return parseCsv(text);
            } catch (e) { stats.fail++; note(`FAIL ${e.name} ${tag} ${e.message}`); await wait(10000); }
        }
        note(`GAVEUP ${tag}`);
        return null;
    }

    /** The rows of all queries (tags `tag`-0, -1, ...); one given up throws, so no list is read thinner than its source. */
    async function queryAll(queries, tag) {
        const rows = [];
        for (const [i, q] of queries.entries()) {
            const got = await query(q, `${tag}-${i}`);
            if (!got) throw new Error(`Wikidata gave up ${tag}-${i}; see wikidata.log`);
            rows.push(...got);
        }
        return rows;
    }
    return { query, queryAll, stats };
}

const SEX = { Q6581097: 'male', Q6581072: 'female' };
const id = uri => uri.split('/').pop();

/**
 * A label as a name: a bracketed note left off (Thích (họ người), Ganbold (Ганболд)); null for two names in one
 * (ปกรณ์/ภากร), a lowercase start (ffrench-O'Carroll) or Latin letters among Cyrillic ones (Богданa).
 */
export function nameOfLabel(label) {
    const name = label.replace(/\s*\([^)]*\)$/u, '').trim();
    return /[/()]/.test(name) || /^\p{Ll}/u.test(name) || /\s(?!(?:de|del|la|no|in|an)\s|h\p{Lu})\p{Ll}/u.test(name) // as the database's invariant
        || (/[A-Za-z]/.test(name) && /\p{Script=Cyrillic}/u.test(name))
        ? null : name;
}

/**
 * The queries for a culture's names of one kind (prop: P735 given name, P734 family name), one per source: people
 * patterns (`?p wdt:P27 wd:Q218`), then name languages (items with P407). Each leaves out the bearers of a name an
 * earlier one counts, so a person two sources find counts once when rankRows adds the rows up (one UNION timed out on
 * Romania). `sexed` counts the bearers by sex; `strict` adds the item's native label (P1705) in `lang`, as `nl`.
 */
export function nameQueries({ people = [], names = [], lang, strict = false }, prop, sexed) {
    const sex = sexed ? ' ?g' : '';
    const bearer = `wdt:${prop} ?f${sexed ? '; wdt:P21 ?g' : ''}`;
    const sources = [...people.map(p => ({ where: `?p ${p}; wdt:P31 wd:Q5; ${bearer}.`, counted: `?p ${p}` })),
        ...names.map(q => ({ where: `?f wdt:P407 wd:${q}. ?p wdt:P31 wd:Q5; ${bearer}.`, counted: `?f wdt:P407 wd:${q}` }))];
    return sources.map((src, i) => query(src.where + sources.slice(0, i).map(e => ` FILTER NOT EXISTS { ${e.counted} }`).join('')));
    function query(where) {
        const labels = `OPTIONAL { ?f rdfs:label ?ln FILTER(LANG(?ln)="${lang}") }
  OPTIONAL { ?f rdfs:label ?lm FILTER(LANG(?lm)="mul") }
  OPTIONAL { ?f rdfs:label ?le FILTER(LANG(?le)="en") }`;
        const inner = `{ SELECT ?f${sex} (COUNT(DISTINCT ?p) AS ?c) WHERE { ${where} } GROUP BY ?f${sex} ORDER BY DESC(?c) LIMIT 3000 }`;
        return strict
            ? `SELECT ?f${sex} ?c ?ln ?lm ?le (SAMPLE(?nx) AS ?nl) WHERE {
  ${inner}
  ${labels}
  OPTIONAL { ?f wdt:P1705 ?nx FILTER(LANG(?nx)="${lang}") }
} GROUP BY ?f${sex} ?c ?ln ?lm ?le`
            : `SELECT ?f${sex} ?c ?ln ?lm ?le WHERE {
  ${inner}
  ${labels}
}`;
    }
}

/**
 * Rows {f, g?, c, ln, lm, le, nl?} (a name item, its bearers' sex, how many bear it, its labels in the culture's
 * language, in "mul" and in English, its native label in that language) to entries in rank order, as name-lists.mjs rankedEntries gives them:
 * [{name, rank, country: 'Wikidata', source: 'Wikidata', key, native, male, female}] (source: the names file's source
 * field; native: the name is the label or native label in the culture's language, not "mul" or English alone; male,
 * female: the bearers of each sex). Counts of one item add up over rows; `sex` keeps the items that sex bears at
 * least a quarter of (both lists hold Alex; newFirstNames makes it ambiguous); the rank is the count of the kept sex,
 * else the whole. A spelling key keeps its
 * best rank and adds up its items' bearers by sex; an item with no label or a key under two letters is left out.
 */
export function rankRows(rows, sex = null) {
    const items = new Map();
    for (const r of rows) {
        const name = r.ln || r.lm || r.le;
        if (!name) continue;
        const it = items.get(r.f) ?? { name, native: Boolean(r.ln) || r.nl === name, male: 0, female: 0, all: 0 };
        const c = Number(r.c) || 0;
        it.all += c;
        const s = SEX[id(r.g ?? '')];
        if (s) it[s] += c;
        items.set(r.f, it);
    }
    const kept = [...items.values()].filter(it => !sex || (it[sex] > 0 && it[sex] * 4 >= it.male + it.female));
    const count = it => (sex ? it[sex] : it.all);
    const best = new Map();
    for (const it of kept.sort((a, b) => count(b) - count(a))) {
        const key = norm(it.name);
        if (key.length < 2) continue;
        const had = best.get(key);
        if (had) { had.male += it.male; had.female += it.female; continue; }
        best.set(key, { name: it.name, rank: best.size + 1, country: 'Wikidata', source: 'Wikidata', key, native: it.native,
            male: it.male, female: it.female });
    }
    return [...best.values()];
}

/**
 * Lines read from Wikidata labels ({culture, name, gender}) as names (nameOfLabel). A line is left out where its label
 * is no name, `keep(line)` refuses it, the culture holds its cleaned name (`held(culture)`: spelling keys), it is
 * overused, or a line before gives the culture that name; a first name given for both sexes stays once, as ambiguous.
 * Returns {lines, dropped}; dropped: tab-separated kind, culture, label, name (- none) and why (cleaned where it entered).
 */
export function labelLines(lines, kind, held, overused, keep = () => true) {
    const kept = new Map(), dropped = [];
    for (const x of lines) {
        const name = nameOfLabel(x.name), key = `${x.culture}/${norm(name ?? '')}`;
        const why = !name ? 'no name' : !keep(x) ? 'refused' : name !== x.name && held(x.culture).has(norm(name)) ? 'held'
            : overused.has(foldName(name)) ? 'overused' : kept.has(key) ? 'twice' : '';
        if (why || name !== x.name) dropped.push([kind, x.culture, x.name, name ?? '-', why || 'cleaned'].join('\t'));
        if (why === 'twice' && kind === 'first' && kept.get(key).gender !== x.gender) kept.get(key).gender = 'ambiguous';
        if (!why) kept.set(key, { ...x, name });
    }
    return { lines: [...kept.values()], dropped };
}
