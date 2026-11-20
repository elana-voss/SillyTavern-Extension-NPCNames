// Milestone 10b2's read: the cultures with no name-dataset list (13) and Irish Gaelic get their common
// first names and surnames from Wikidata, as milestone 5 did: a name's rank is how many people of the
// culture bear it there (tools/wikidata.mjs). The lists are read by 10a's three readers with 10a's and
// 10b's blind questions, folding and single read (tools/name-read.mjs); the names the database lacks
// are written to tools/m10b2-names.txt for tools/m10b2-apply-names.mjs. Where a surname's form has a sex, Wikidata's
// count of its bearers by sex says which forms both sexes bear (Бойко); on Nepal's given names hindi reads as nepalese.
// Irish Gaelic and Latin take a name only where its label or native label is in their language (Ó Murchú, not
// Murphy). A person two of a culture's sources find counts once (wikidata.mjs nameQueries).
//
// Run: node tools/m10b2-read.mjs [--cultures a,b] [--lists] [--budget 280000] [--write]
// --lists fetches and ranks the lists only (no reader is asked) and writes logs/work/m10b2/lists.txt.
// Key: env NANOGPT_API_KEY. Answers are stored under logs/work/m10b2/answers and Wikidata's under
// logs/work/m10b2/wd, so a rerun costs nothing; no new request once the input stored there passes the budget.
// Writes logs/work/m10b2/summary.txt, rejected.txt and entered.txt; prints a short summary.
import { writeFileSync } from 'node:fs';
import { arg, flag } from './cli.mjs';
import { keepEntered, loadDb, readLines } from './db.mjs';
import { client } from './nanogpt.mjs';
import { GENDERED, heldBy, namesFileText, newFirstNames, newSurnames, readJobs } from './name-read.mjs';
import { ancientTags } from './name-tags.mjs';
import { loadOverused } from './overused.mjs';
import { labelLines, nameQueries, rankRows, wikidata } from './wikidata.mjs';

const OUT = new URL('../logs/work/m10b2/', import.meta.url);

// Who a culture's names are taken from: people (a Wikidata pattern on ?p: citizenship P27 or ethnic group
// P172) and names whose language (P407) is the culture's; `lang` is the label language, the script the
// culture holds today (Thai in Thai, Ukrainian in Cyrillic, Mongolian and Nepalese in Latin letters).
// Native American and Mongolian take no surnames (PLAN.md, milestone 3 and 10b2). `strict`: a name enters only where
// its item's label or native label (P1705) in `lang` is that name; the "mul" or English one alone is Ireland's English
// form (Murphy, Jack; 10b2 is for the Gaelic ones, as Ireland's list holds John, Mary, Paul) or Latin's (Julian).
const SOURCES = {
    hawaiian: { people: ['wdt:P172 wd:Q1283606'], names: ['Q33569'], lang: 'haw' },
    latin: { people: ['wdt:P27 wd:Q1747689', 'wdt:P27 wd:Q17167', 'wdt:P27 wd:Q2277'], lang: 'la', strict: true },
    maori: { people: ['wdt:P172 wd:Q6122670'], names: ['Q36451'], lang: 'mi' },
    mayan: { people: ['wdt:P172 wd:Q45914', 'wdt:P172 wd:Q46998231'], names: ['Q13354'], lang: 'en' },
    mongolian: { people: ['wdt:P27 wd:Q711'], lang: 'en', surnames: false },
    nativeAmerican: { people: ['wdt:P172/wdt:P279* wd:Q49297'], lang: 'en', surnames: false },
    nepalese: { people: ['wdt:P27 wd:Q837'], lang: 'en' },
    romanian: { people: ['wdt:P27 wd:Q218'], names: ['Q7913'], lang: 'ro' },
    swahili: { people: ['wdt:P27 wd:Q924', 'wdt:P27 wd:Q114'], names: ['Q7838'], lang: 'sw' },
    thai: { people: ['wdt:P27 wd:Q869'], lang: 'th' },
    ukrainian: { people: ['wdt:P27 wd:Q212'], lang: 'uk' },
    vietnamese: { people: ['wdt:P27 wd:Q881'], lang: 'vi' },
    yoruba: { people: ['wdt:P172 wd:Q190168'], names: ['Q34311'], lang: 'yo' },
    irishGaelic: { names: ['Q9142'], lang: 'ga', strict: true },
};

const PROP = { first: 'P735', last: 'P734' };
const query = (src, kind, sexed) => nameQueries(src, PROP[kind], sexed);
// Labels the readers passed that are no name of the culture: Thị is the middle name of Vietnamese women; คิม เบอรี่ is
// a stage name in two words; Van Nghi and Le Viêt are a middle and a given name in Latin letters (10b2 review).
const NOT_NAMES = new Set(['vietnamese/Thị', 'thai/คิม เบอรี่', 'vietnamese/Van Nghi', 'vietnamese/Le Viêt']);

const CULTURES = arg('cultures', '') ? arg('cultures').split(',') : Object.keys(SOURCES);
// How far down each list is read, and how many of the names read may enter (10a's and 10b's).
const WINDOW = { first: 100, last: 200 };
const TOP = { first: 50, last: 100 };
// Kenya's and Tanzania's first 100 given names are English and Arabic; Swahili ones (Baraka, Zawadi) lie further down.
const WIDE = { 'swahili-male': 300, 'swahili-female': 300 };
// No new request once the input stored under logs/work/m10b2/answers passes this (the milestone's cap).
const BUDGET = Number(arg('budget', 280000));

{
    const wd = wikidata(new URL('wd/', OUT));
    const lists = [];
    for (const culture of CULTURES) {
        const src = SOURCES[culture];
        for (const kind of src.surnames === false ? ['first'] : ['first', 'last']) {
            const rows = await wd.queryAll(query(src, kind, kind === 'first'), `${culture}-${kind}`);
            // A surname whose form's sex is read takes its bearers by sex from a second count; its rank stays the first's,
            // as persons with no sex on Wikidata drop out of the second.
            const bySex = new Map();
            if (kind === 'last' && GENDERED.has(culture)) {
                for (const e of rankRows(await wd.queryAll(query(src, kind, true), `${culture}-sexes`))) bySex.set(e.key, e);
            }
            for (const sex of kind === 'first' ? ['male', 'female'] : [null]) {
                lists.push({ culture, kind, sex, entries: rankRows(rows, sex)
                    .map(e => (bySex.has(e.key) ? { ...e, male: bySex.get(e.key).male, female: bySex.get(e.key).female } : e)) });
            }
        }
    }
    if (flag('lists')) {
        writeFileSync(new URL('lists.txt', OUT), lists.map(l => `${l.culture}\t${l.kind}\t${l.sex ?? '-'}\t${l.entries.length}\t`
            + l.entries.slice(0, 120).map(e => e.name).join(', ')).join('\n') + '\n');
        console.log(lists.map(l => `${l.culture}/${l.kind}${l.sex ? '/' + l.sex[0] : ''} ${l.entries.length}`).join('; '));
        console.log(`wikidata: asked ${wd.stats.asked}, cached ${wd.stats.cached}, failed tries ${wd.stats.fail}, 429 ${wd.stats.limited}; table logs/work/m10b2/lists.txt`);
        process.exit(0);
    }
    // The data 10b2's read found (10a and 10b applied), so a rerun gives the same lists.
    const db = loadDb('7c3cb98');
    const heldOf = field => heldBy(db[field]);
    const overused = loadOverused();
    const llm = client(new URL('answers/', OUT));
    const jobs = kind => lists.filter(l => l.kind === kind && l.entries.length)
        .map(l => ({ ...l, tag: `${l.culture}-${l.sex ?? 'last'}` }))
        .map(l => ({ ...l, entries: l.entries.slice(0, WIDE[l.tag] ?? WINDOW[kind]) }));
    const first = jobs('first'), last = jobs('last');
    // readJobs asks while the input stored at its start plus its run's input stays under its budget, so the second
    // call's budget adds the first call's input once: the stored total stays under BUDGET.
    await readJobs(llm, first, 'first', BUDGET);
    await readJobs(llm, last, 'last', BUDGET + llm.stats.input);
    // Nepal's given names are the Hindu names India shares, so readers call Ram and Krishna Indian (hindi): on Nepal's
    // first-name lists a reading of hindi counts as nepalese, as 10a takes hindi for Indian peoples as a whole.
    const f = newFirstNames(first, heldOf('first_names'), overused, TOP.first, { also: { nepalese: 'hindi' } });
    const l = newSurnames(last, heldOf('last_names'), overused, TOP.last);
    // Labels are made names after the read, so the stored answers still match the lists asked (logs/work/m10b2/labels.txt).
    const native = new Map(lists.flatMap(l => l.entries.map(e => [`${l.culture}/${e.name}`, e.native])));
    const own = x => !SOURCES[x.culture].strict || native.get(`${x.culture}/${x.name}`);
    const keep = x => own(x) && !NOT_NAMES.has(`${x.culture}/${x.name}`);
    const fl = labelLines(f.lines, 'first', heldOf('first_names'), overused, keep);
    const ll = labelLines(l.lines, 'last', heldOf('last_names'), overused, keep);
    // Latin is a people of antiquity alone: its names take 10c's tags for a name borne only then (ancientTags), not today's.
    f.lines = fl.lines.map(m => (m.culture === 'latin' ? { ...m, tags: ancientTags(m.tags) } : m));
    l.lines = ll.lines;
    writeFileSync(new URL('labels.txt', OUT), 'kind\tculture\tlabel\tname\twhy\n' + [...fl.dropped, ...ll.dropped].join('\n') + '\n');
    writeFileSync(new URL('summary.txt', OUT), [...f.summary, '', ...l.summary].join('\n') + '\n');
    writeFileSync(new URL('rejected.txt', OUT), 'culture\tsex\trank\tentry\treaders peoples:kind\n'
        + [...f.rejected, ...l.rejected.map(r => r.replace('\t', '\t-\t'))].join('\n') + '\n');
    writeFileSync(new URL('entered.txt', OUT), 'culture\tentry\trank\treaders peoples:kind\n' + l.entered.join('\n') + '\n');
    if (flag('write')) {
        const head = [
            'Milestone 10b2: the 50 most common first names of each sex and 100 most common surnames per culture',
            'that the database lacked, for the cultures name-dataset has no list for and Irish Gaelic, ranked by how',
            'many people of the culture bear them on Wikidata, each read by three readers of different vendors; made',
            'by tools/m10b2-read.mjs. Fields: first | culture | name | gender | source | ages | eras | roles |',
            'intelligence | allure | commonness | genres | themes; last | culture | name | gender (- none) | source |',
            'eras | roles | allure | commonness | genres | themes'];
        writeFileSync(new URL('m10b2-names.txt', import.meta.url),
            keepEntered(namesFileText(head, f.lines, 'first') + namesFileText([], l.lines, 'last'), readLines('m10b2-names.txt')));
    }
    const spent = llm.spent();
    console.log(`jobs ${first.length + last.length}, unread ${f.unread + l.unread}, stopped by budget ${llm.stats.stopped}; answer lines missing ${f.missingLines + l.missingLines}`);
    console.log(`input tokens: stored ${spent}; calls ${llm.stats.calls}, cached ${llm.stats.cached}, failed tries ${llm.stats.fail}`);
    console.log(`new first names ${f.lines.length} (ambiguous ${f.lines.filter(m => m.gender === 'ambiguous').length}), surname forms ${l.lines.length}; entries rejected ${f.rejected.length + l.rejected.length}`);
    console.log(`tables: logs/work/m10b2/summary.txt, rejected.txt, entered.txt${flag('write') ? '; list tools/m10b2-names.txt' : ''}`);
}
