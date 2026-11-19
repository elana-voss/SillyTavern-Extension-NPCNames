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
    return { query, stats };
}

const SEX = { Q6581097: 'male', Q6581072: 'female' };
const id = uri => uri.split('/').pop();

/**
 * A label as a name: a bracketed note left off (Thích (họ người), Ganbold (Ганболд)); null for two names in one
 * (ปกรณ์/ภากร), a lowercase start (ffrench-O'Carroll) or Latin letters among Cyrillic ones (Богданa).
 */
export function nameOfLabel(label) {
    const name = label.replace(/\s*\([^)]*\)$/u, '').trim();
    return /[/()]/.test(name) || /^\p{Ll}/u.test(name) || (/[A-Za-z]/.test(name) && /\p{Script=Cyrillic}/u.test(name))
        ? null : name;
}

/**
 * Rows {f, g?, c, ln, lm, le} (a name item, its bearers' sex, how many bear it, its labels in the culture's
 * language, in "mul" and in English) to entries in rank order, as name-lists.mjs rankedEntries gives them:
 * [{name, rank, country: 'Wikidata', source: 'Wikidata', key, male, female}] (source: the names file's source field;
 * male, female: the item's bearers of each sex). Counts of one item add up over rows (several sources of one
 * culture); `sex` keeps the items borne more by that sex (men where equal); the rank is the count of the
 * kept sex, else the whole. A spelling key keeps its best rank; an item with no label or a key under two
 * letters is left out.
 */
export function rankRows(rows, sex = null) {
    const items = new Map();
    for (const r of rows) {
        const name = r.ln || r.lm || r.le;
        if (!name) continue;
        const it = items.get(r.f) ?? { name, male: 0, female: 0, all: 0 };
        const c = Number(r.c) || 0;
        it.all += c;
        const s = SEX[id(r.g ?? '')];
        if (s) it[s] += c;
        items.set(r.f, it);
    }
    const kept = [...items.values()].filter(it => !sex || (sex === 'male' ? it.male >= it.female && it.male > 0
        : it.female > it.male));
    const count = it => (sex ? it[sex] : it.all);
    const best = new Map();
    for (const it of kept.sort((a, b) => count(b) - count(a))) {
        const key = norm(it.name);
        if (key.length < 2 || best.has(key)) continue;
        best.set(key, { name: it.name, rank: best.size + 1, country: 'Wikidata', source: 'Wikidata', key, male: it.male, female: it.female });
    }
    return [...best.values()];
}
