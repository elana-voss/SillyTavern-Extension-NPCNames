// The data tools: lists, readers' answers, Wikidata, the provider client, tags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadOverused } from '../tools/overused.mjs';
import { norm } from '../tools/name-lists.mjs';
import * as overusedModule from '../tools/overused.mjs';
import { addNames, keepEntered, parseLines } from '../tools/db.mjs';
import { labelLines, nameOfLabel, nameQueries, parseCsv, rankRows, wikidata } from '../tools/wikidata.mjs';
import { client } from '../tools/nanogpt.mjs';
import { ancientTags, applyTags, commonnessFor, decideNew, decideTags, isBlanket, listRanks, parseTagAnswers, tagsFor } from '../tools/name-tags.mjs';
import { bothSexes, decide, firstNameTags, heldBy, knownKeys, lastNameTags, mergeSexes, newFirstNames, newSurnames, parseAnswers, readJobs } from '../tools/name-read.mjs';
import { ROOT } from './helpers.js';

test('overused check folds case and accents, and no name of the new batch is on the list', () => {
    assert.equal(norm('Élára'), norm('elara'));
    const overused = loadOverused();
    const on = names => names.filter(n => overused.has(norm(n)));
    const slop = ['Elara', 'Kael', 'Lyra', 'Seraphina', 'Thorn'];
    assert.deepEqual(on(slop), slop, 'the list holds names models keep inventing that are rare among real people');
    assert.deepEqual(on(['Maria', 'Anna', 'Thomas', 'Smith', 'Murphy', 'Ivan', 'Elena', 'Mihai', 'Popescu', 'Chen', 'Kim', 'Nguyen', 'Tanaka', 'Kofi']), [],
        'a name common among real people is no AI slop, whatever the models do');
    const batch = readFileSync(new URL('./tools/m5-names.txt', ROOT), 'utf8').split(/\r?\n/)
        .filter(l => l.startsWith('first | ') || l.startsWith('last | '))
        .map(l => l.split(' | ')[2]);
    assert.ok(batch.length > 1000, 'the batch is read');
    assert.deepEqual(batch.filter(n => overused.has(norm(n))), []);
});

test('C3: one spelling key; each overused line is its own key, and a hyphen, a space or đ hides no name from the list', () => {
    const lines = readFileSync(new URL('./tools/overused-names.txt', ROOT), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'));
    assert.deepEqual(lines.filter(l => norm(l) !== l), [], 'the list reads the same under the one key');
    const overused = loadOverused();
    assert.deepEqual(['E-lara', 'Ela ra'].filter(n => !overused.has(norm(n))), []);
    assert.equal(norm('Đỗ'), norm('Do'));
    assert.deepEqual(Object.keys(overusedModule), ['loadOverused'], 'no second spelling key');
});

test('a real name marked not slop stays off the overused list, and the making tool keeps the mark', () => {
    const overused = loadOverused();
    assert.deepEqual(['jese', 'xaviere'].filter(n => overused.has(n)), []);
    const marked = readFileSync(new URL('./tools/overused-names.txt', ROOT), 'utf8').split(/\r?\n/).filter(l => l.startsWith('#not-slop '));
    assert.deepEqual(marked.map(l => l.split(' ')[1]), ['jese', 'xaviere']);
    assert.match(readFileSync(new URL('./tools/m5-make-overused.mjs', ROOT), 'utf8'), /#not-slop /);
});

test('a data tool\'s list reads the same with either line end', () => {
    assert.deepEqual(parseLines('# note\r\na | b\r\n\r\nc | d\n'), [['a', 'b'], ['c', 'd']]);
});

test('10-fix: a names file written again keeps every name it held, as the read gave it before, beside the names the read now gives', () => {
    const text = keepEntered('# head\nlast | hebrew | Amir | - | x\nlast | turkish | Ay | - | celestial\n',
        [['last', 'hebrew', 'Erez', '-', 'x'], ['last', 'turkish', 'Ay', '-', '-']]);
    assert.equal(text, '# head\nlast | hebrew | Amir | - | x\nlast | turkish | Ay | - | celestial\nlast | hebrew | Erez | - | x\n');
});

test('list entries become names on two of three readers: spellings fold, abbreviations and other peoples\' names do not enter', () => {
    const list = ['محمد', 'Md', 'Muhammad', 'Abdul', 'Ahmed', 'Jose', 'Khalid'];
    const reader = rows => parseAnswers(rows.join('\n'));
    const answers = [
        reader(['1 arabic g - Muhammad BCDEF l religious', '2 ? a 1 - - u -', '3 arabic g 1 - CDEF l religious', '4 arabic p - - - u -',
            '5 arabic g - - CDE l -', '6 spanish g - - CDE l -', '7 arabic g - - CD s -']),
        reader(['1 arabic g - Muhammad CDEF l -', '2 ? a 1 - - u -', '3 arabic g 1 - CDE l religious', '4 ? p - - - u -',
            '5 arabic,persian g - - DE l -', '6 spanish,portuguese g - - DE l -', 'Khalid: a name']),
        reader(['1 arabic g - Mohammed DEF l religious', '2 arabic a - - - u -', '3 arabic g - - DE l religious', '4 arabic g - - - u -',
            '5 ? g - - DE l -', '6 arabic g - - DE l -', '7 arabic g - - CD s -']),
    ];
    // Two readers give محمد as Muhammad; the third's Mohammed is no key.
    const names = decide(list, answers, 'arabic', k => k === 'muhammad');
    assert.deepEqual(names.map(g => [list[g.form - 1], g.members.map(i => list[i - 1]), g.present]),
        [['محمد', ['محمد', 'Md', 'Muhammad'], true], ['Ahmed', ['Ahmed'], false], ['Khalid', ['Khalid'], false]]);
    const tags = firstNameTags(names[0]);
    assert.deepEqual([tags.age, tags.era, tags.genre, tags.themes],
        [['child', 'youngAdult', 'adult', 'elder'], ['midcentury', 'modern', 'contemporary'], ['sliceOfLife', 'noirDetective'], ['religious']]);
});

test('a Latin-letter entry\'s "latin" answer is no key, and only a name new in both sexes becomes ambiguous', () => {
    const list = ['Andrew', 'Andy', 'Ivan', 'Иван'];
    const row = (i, latin) => `${i} english g - ${latin} DE l -`;
    const answers = [0, 1, 2].map(() => parseAnswers([row(1, '-'), row(2, 'Andrew'), row(3, '-'), row(4, '?')].join('\n')));
    const names = decide(list, answers, 'english', () => false);
    assert.deepEqual(names.map(g => g.keys), [['andrew'], ['andy'], ['ivan'], ['иван']]);
    const echoed = parseAnswers('1 Nathalie french g - - ABCDEF l -\n2 french g 1 - CD l -');
    assert.deepEqual([...echoed].map(([i, x]) => [i, [...x.peoples], x.kind, x.same]), [[1, ['french'], 'g', null], [2, ['french'], 'g', 1]]);
    const line = (sex, name, keys) => ({ culture: 'english', sex, name, keys: new Set(keys) });
    assert.deepEqual(mergeSexes([line('male', 'Andrew', ['andrew']), line('male', 'Andy', ['andy', 'andrew']),
        line('female', 'Andrea', ['andrea']), line('female', 'Andrew', ['andrew'])]).map(m => `${m.name} ${m.gender}`),
    ['Andrew ambiguous', 'Andy male', 'Andrea female']);
});

test('a reader\'s line whose tag fields stray keeps its people, kind, same and latin', () => {
    const a = parseAnswers('9 arabic g - zahra - - - -\n13 hindi g 2 - DEF u l -');
    assert.deepEqual([...a].map(([i, x]) => [i, [...x.peoples], x.kind, x.same, x.latin, x.periods, x.allure]),
        [[9, ['arabic'], 'g', null, 'zahra', '', null], [13, ['hindi'], 'g', 2, null, 'DEF', 'u']]);
});

test('a reader\'s line that gives a name two kinds (s,g) reads as the kind the question asks for', () => {
    const line = '19 vietnamese,vietnamese s,g - - - u regal\n121 irishGaelic g,s - - m l celestial';
    assert.deepEqual([...parseAnswers(line, 'last')].map(([i, x]) => [i, x.kind, x.sex]), [[19, 's', null], [121, 's', 'm']]);
    assert.equal(parseAnswers('7 vietnamese s,g - - DE l -').get(7).kind, 'g');
});

const russian = (() => {
    const list = ['Александр', 'Сергей', 'Саша', 'Sergey', 'Саня'];
    const reader = rows => parseAnswers(rows.map((r, i) => `${i + 1} slavicRussian g ${r} DE l -`).join('\n'));
    return decide(list, [
        reader(['- -', '- Sergey', '2 Sasha', '2 -', '3 Sanya']),
        reader(['- -', '- -', '1 Alexander', '1 -', '1 Alexander']),
        reader(['- Aleksandr', '- Sergey', '- Sasha', '2 -', '- Sanya']),
    ], 'slavicRussian', () => false);
})();

test('an entry joins a name only where two readers put it with that name\'s first entry', () => {
    assert.deepEqual(russian.map(g => g.members), [[1], [2, 4], [3, 5]]);
});

test('a latin spelling is a key where two readers give it or no reader gives another', () => {
    const list = ['דוד', 'אורי', 'מיכל'];
    const reader = latins => parseAnswers(latins.map((l, i) => `${i + 1} hebrew g - ${l} DE l -`).join('\n'));
    const names = decide(list, [reader(['David', 'Uri', 'Michal']), reader(['-', 'Ori', '-']), reader(['Moshe', 'Eli', '-'])], 'hebrew', () => false);
    assert.deepEqual(names.map(g => g.keys), [['דוד'], ['אורי'], ['מיכל', 'michal']]);
});

test('a romanised entry is held when the other sex\'s list reads a held native entry as it (R3)', () => {
    const readers = rows => [0, 1, 2].map(() => parseAnswers(rows.join('\n')));
    const female = decide(['מיכל'], readers(['1 hebrew g - Michal DE l -']), 'hebrew', k => k === 'מיכל');
    const male = decide(['Michal', 'Eitan'], readers(['1 hebrew g - - DE l -', '2 hebrew g - - DE l -']), 'hebrew', () => false);
    const known = knownKeys([female, male], new Set(['מיכל']));
    assert.deepEqual(male.map(g => g.keys.some(k => known.has(k))), [true, false]);
});

test('a surname\'s gendered forms fold into one surname, and each form enters with the sex two readers give it', () => {
    const list = ['Иванова', 'Иванов', 'Ivanov', 'Petrov', 'Smith', 'Sokolova'];
    const rows = last => ['1 slavicRussian s - Ivanova f l -', '2 slavicRussian s 1 Ivanov m l -', '3 slavicRussian s 1 - m l -',
        '4 slavicRussian s - - m l -', '5 english s - - - u -', `6 slavicRussian s - - ${last} l -`].join('\n');
    const answers = ['f', 'f', '-'].map(last => parseAnswers(rows(last), 'last'));
    const names = decide(list, answers, 'slavicRussian', k => k === 'ivanov', 'last', { gendered: true });
    assert.deepEqual(names.map(g => [list[g.form - 1], list[g.rank - 1], g.sex, g.present, g.keys]), [
        ['Иванова', 'Иванова', 'female', false, ['иванова', 'ivanova']],
        ['Иванов', 'Иванова', 'male', true, ['иванов', 'ivanov']],
        ['Petrov', 'Petrov', 'male', false, ['petrov']],
        ['Sokolova', 'Sokolova', 'female', false, ['sokolova']]]);
    assert.deepEqual(lastNameTags(names[0]), { era: ['contemporary'], role: ['neutral'], allure: 'pleasant', commonness: 'common', genre: ['sliceOfLife'], themes: [] });
    assert.equal(parseAnswers('4 slavicRussian s - - F l -').get(4).periods, 'F', 'a first name\'s line still reads periods');
});

test('a surname splits by sex only in a culture whose surnames are gendered', () => {
    const list = ['الزعبي', 'Alzoubi'];
    const answers = [0, 1, 2].map(() => parseAnswers(['1 arabic s - Alzoubi - l -', '2 arabic s 1 - m l -'].join('\n'), 'last'));
    const names = decide(list, answers, 'arabic', () => false, 'last');
    assert.deepEqual(names.map(g => [list[g.form - 1], g.members, g.sex]), [['الزعبي', [1, 2], null]]);
});

test('a string any reader calls not a name is no surname, though two call it one (الحياه, life)', () => {
    const list = ['الحياه', 'الخطيب'];
    const answers = ['x', 's', 's'].map(k => parseAnswers(`1 arabic ${k} - - - l -\n2 arabic s - Alkhatib - l -`, 'last'));
    assert.deepEqual(decide(list, answers, 'arabic', () => false, 'last').map(g => list[g.form - 1]), ['الخطيب']);
});

test('where surnames are fathers\' names, a given name of that people in the surname list is a surname', () => {
    const list = ['Musa', 'John'];
    const answers = [0, 1, 2].map(r => parseAnswers(`1 nigerian,arabic g - - - l -\n2 ${r ? 'english' : 'nigerian'} g - - - l -`, 'last'));
    assert.deepEqual(decide(list, answers, 'nigerian', () => false, 'last', { patronymic: true }).map(g => list[g.form - 1]), ['Musa']);
    assert.deepEqual(decide(list, answers, 'arabic', () => false, 'last'), []);
});

test('two new names that share a spelling are one, in the form ranked higher (R3: الحربي read as Alharbi, and Alharbi)', () => {
    const list = ['الحربي', 'Alharbi'];
    const answers = [0, 1, 2].map(() => parseAnswers('1 arabic s - Alharbi - l -\n2 arabic s - - - l -', 'last'));
    assert.deepEqual(decide(list, answers, 'arabic', () => false, 'last').map(g => [list[g.form - 1], g.members]), [['الحربي', [1, 2]]]);
});

test('in a gendered culture a form no two readers give a sex takes the sex its group lacks (Juška beside Juškienė)', () => {
    const list = ['Juška', 'Juškienė', 'Kazlauskas'];
    const answers = [0, 1, 2].map(() => parseAnswers('1 baltic s - - - l -\n2 baltic s 1 - f l -\n3 baltic s - - - l -', 'last'));
    assert.deepEqual(decide(list, answers, 'baltic', () => false, 'last', { gendered: true }).map(g => [list[g.form - 1], g.sex]),
        [['Juška', 'male'], ['Juškienė', 'female'], ['Kazlauskas', null]]);
});

test('a form its source finds borne by both sexes takes no sex where a reader says so, though two give one (Бойко, Попов)', () => {
    const list = ['Бойко', 'Попов'];
    const answers = ['m', '-', 'm'].map(s => parseAnswers(`1 ukrainian s - Boiko ${s} u -\n2 ukrainian s - Popov m u -`, 'last'));
    assert.deepEqual(decide(list, answers, 'ukrainian', () => false, 'last', { gendered: true, sexless: () => true })
        .map(g => [list[g.form - 1], g.sex]), [['Бойко', null], ['Попов', 'male']]);
    assert.deepEqual([{ male: 40, female: 12 }, { male: 40, female: 1 }, { male: 2, female: 1 }, {}].map(bothSexes),
        [true, false, false, false]);
});

test('a Ukrainian surname that does not decline (-енко, -ко, -ук, -ич, -ак, Чайка) takes no sex, though every reader gives one', () => {
    const entries = ['Головко', 'Попович', 'Чайка', 'Попов', 'Соколовська'].map((name, i) => ({ name, rank: i + 1, source: 'Wikidata' }));
    const text = entries.map((e, i) => `${i + 1} ukrainian s - - ${i === 4 ? 'f' : 'm'} u -`).join('\n');
    const job = { culture: 'ukrainian', entries, answers: [0, 1, 2].map(() => parseAnswers(text, 'last')) };
    assert.deepEqual(newSurnames([job], () => new Set(), new Set()).lines.map(l => [l.name, l.gender]),
        [['Головко', null], ['Попович', null], ['Чайка', null], ['Попов', 'male'], ['Соколовська', 'female']]);
});

test('a people named as counting for a culture makes a name of it, and the rejected table keeps what readers said (Ram: hindi for nepalese)', () => {
    const job = () => ({ culture: 'nepalese', sex: 'male', entries: [{ name: 'Ram', rank: 1 }, { name: 'John', rank: 2 }],
        answers: [0, 1, 2].map(() => parseAnswers('1 hindi g - - D l -\n2 english g - - D l -', 'first')) });
    const read = newFirstNames([job()], () => new Set(), new Set(), 50, { also: { nepalese: 'hindi' } });
    assert.deepEqual([read.lines.map(l => l.name), read.rejected], [['Ram'], ['nepalese\tmale\t2\tJohn\tenglish:g english:g english:g']]);
    assert.deepEqual(newFirstNames([job()], () => new Set(), new Set()).lines, []);
});

test('a budget of 0 sends no request, though nothing is stored', async () => {
    const dir = pathToFileURL(mkdtempSync(join(tmpdir(), 'npcnames-llm-')) + '/');
    try {
        let fetched = 0;
        const fetchFn = async () => { fetched++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }], usage: { prompt_tokens: 10, completion_tokens: 1 } }) }; };
        await readJobs(client(dir, { fetchFn, wait: async () => {} }), [{ tag: 't', entries: [{ name: 'Smith' }] }], 'last', 0);
        assert.equal(fetched, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a stored answer is read past the budget, a new call is not, and an empty answer\'s input counts as spent', async () => {
    const dir = pathToFileURL(mkdtempSync(join(tmpdir(), 'npcnames-llm-')) + '/');
    try {
        const replies = [{ content: '' }, { content: '1 x' }];
        let fetched = 0;
        const fetchFn = async () => {
            const r = replies[fetched++];
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: r.content } }], usage: { prompt_tokens: 10, completion_tokens: 1 } }) };
        };
        const llm = client(dir, { fetchFn, wait: async () => {} });
        assert.equal(await llm.ask('m', 'a'), '1 x');
        assert.equal(llm.spent(), 20);
        assert.equal(await llm.ask('m', 'a', { allow: () => false }), '1 x');
        assert.equal(await llm.ask('m', 'b', { allow: () => false }), null);
        assert.deepEqual([fetched, llm.stats.stopped], [2, 1]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('C4: a whole request (a chat with tools) is sent by the same client: a tool call with no text is an answer, stored whole under its key and its name', async () => {
    const dir = pathToFileURL(mkdtempSync(join(tmpdir(), 'npcnames-llm-')) + '/');
    try {
        let fetched = 0;
        const reply = { choices: [{ message: { content: null, tool_calls: [{ id: 'c1' }] } }], usage: { prompt_tokens: 7, completion_tokens: 2 } };
        const fetchFn = async () => { fetched++; return { ok: true, status: 200, json: async () => reply }; };
        const llm = client(dir, { fetchFn, wait: async () => {}, name: hash => hash.slice(0, 24) });
        const body = { model: 'm', messages: [], tools: [] };
        assert.deepEqual(await llm.send(body, { key: { body, run: 1 } }), reply);
        assert.deepEqual(await llm.send(body, { key: { body, run: 1 }, allow: () => false }), reply);
        assert.equal(await llm.send(body, { key: { body, run: 2 }, allow: () => false }), null);
        assert.deepEqual([fetched, llm.stats.input, llm.spent()], [1, 7, 7]);
        assert.deepEqual(readdirSync(dir).map(f => f.length), [29]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Wikidata\'s CSV: a quoted field keeps its comma and doubled quote', () => {
    assert.deepEqual(parseCsv('f,c,ln\r\nhttp://x/Q1,3,"Ion, ""Ionel"""\r\n'), [{ f: 'http://x/Q1', c: '3', ln: 'Ion, "Ionel"' }]);
});

test('a Wikidata label is a name without its bracketed note, and none where it holds two or a malformed one', () => {
    assert.deepEqual(['Thích (họ người)', 'Ganbold (Ганболд)', 'ปกรณ์/ภากร', "ffrench-O'Carroll", 'Богданa', 'Ó Néill']
        .map(nameOfLabel), ['Thích', 'Ganbold', null, null, null, 'Ó Néill']);
});

test('C3: a Wikidata label is no name by the one malformed-name rule of the database, initials too (J. R.)', () => {
    assert.deepEqual(['J. R.', 'Ana Maria'].map(nameOfLabel), [null, 'Ana Maria']);
});

test('a Wikidata rank list adds an item\'s counts over rows, keeps in a sex\'s list the items that sex bears a quarter of, and a spelling once', () => {
    const sex = q => `http://www.wikidata.org/entity/${q}`;
    const rows = [
        { f: 'A', g: sex('Q6581097'), c: '5', ln: 'Ion', lm: '', le: 'Ion' }, { f: 'A', g: sex('Q6581072'), c: '1', ln: 'Ion' },
        { f: 'B', g: sex('Q6581072'), c: '4', ln: '', lm: '', le: 'Maria' }, { f: 'B', g: sex('Q6581072'), c: '4', le: 'Maria' },
        { f: 'C', g: sex('Q6581097'), c: '2', ln: 'Alex' }, { f: 'C', g: sex('Q6581072'), c: '2', ln: 'Alex' },
        { f: 'D', g: sex('Q6581097'), c: '3', ln: 'Íon' }, { f: 'E', c: '9', ln: '' }, { f: 'F', g: sex('Q6581097'), c: '7', ln: 'J' },
        { f: 'G', g: sex('Q6581097'), c: '1', ln: '', le: 'Alex' },
    ];
    assert.deepEqual(rankRows(rows, 'male').map(e => [e.name, e.rank, e.country]), [['Ion', 1, 'Wikidata'], ['Alex', 2, 'Wikidata']]);
    // Alex, borne by two men and two women, is in both lists; Ion, one woman in six, only in the men's.
    assert.deepEqual(rankRows(rows, 'female').map(e => e.name), ['Maria', 'Alex']);
    // A spelling's bearers by sex add up over its items (Ion: A and D; Alex: C and G); `native` says the name is the culture's own label.
    assert.deepEqual(rankRows(rows).map(e => [e.name, e.male, e.female, e.native]), [['Maria', 0, 8, false], ['Ion', 8, 1, true], ['Alex', 3, 2, true]]);
});

test('a Wikidata label is the culture\'s own where it is the item\'s label or native label in its language (Oisín), not an English one alone (Primus)', () => {
    const rows = [{ f: 'A', c: '3', ln: 'Ó Murchú' }, { f: 'B', c: '2', lm: 'Oisín', nl: 'Oisín' }, { f: 'C', c: '1', le: 'Primus' },
        { f: 'D', c: '1', lm: 'Daire', nl: 'Dáire' }];
    assert.deepEqual(rankRows(rows).map(e => [e.name, e.native]), [['Ó Murchú', true], ['Oisín', true], ['Primus', false], ['Daire', false]]);
});

test('a culture\'s Wikidata queries leave out the bearers an earlier source counts, so a person two sources find counts once', () => {
    const [a, b] = nameQueries({ people: ['wdt:P27 wd:Q218'], names: ['Q7913'], lang: 'ro' }, 'P735', true);
    assert.doesNotMatch(a, /NOT EXISTS|P1705/u);
    assert.match(b, /\?f wdt:P407 wd:Q7913\. \?p wdt:P31 wd:Q5; wdt:P735 \?f; wdt:P21 \?g\. FILTER NOT EXISTS \{ \?p wdt:P27 wd:Q218 \} \}/u);
    assert.match(nameQueries({ names: ['Q9142'], lang: 'ga', strict: true }, 'P734', false)[0], /P1705 \?nx FILTER\(LANG\(\?nx\)="ga"\)/u);
});

test('Wikidata labels become names once: none where no name (a later word uncapitalised), refused, held after cleaning, overused or given before; both sexes make it ambiguous', () => {
    const lines = [['Thích (họ người)', 'male'], ['Kim (họ)', 'male'], ['Ana/Ani', 'female'], ['Ó Ceallaig h', 'male'], ['Elara', 'female'], ['Murphy', 'male'],
        ['Kim', 'female'], ['Ana (tên)', 'female']].map(([name, gender]) => ({ culture: 'vietnamese', name, gender }));
    const read = labelLines(lines, 'first', () => new Set(['thich']), new Set(['elara']), x => x.name !== 'Murphy');
    assert.deepEqual(read.lines.map(l => [l.name, l.gender]), [['Kim', 'ambiguous'], ['Ana', 'female']]);
    assert.deepEqual(read.dropped.map(d => d.split('\t').slice(2).join(' ')), ['Thích (họ người) Thích held', 'Kim (họ) Kim cleaned',
        'Ana/Ani - no name', 'Ó Ceallaig h - no name', 'Elara Elara overused', 'Murphy Murphy refused', 'Kim Kim twice', 'Ana (tên) Ana cleaned']);
});

test('a Wikidata query given up stops the run, naming it, before a list is read thinner than its source', async () => {
    const dir = pathToFileURL(mkdtempSync(join(tmpdir(), 'npcnames-wd-')) + '/wd/');
    try {
        const fetchFn = async () => ({ status: 500, text: async () => 'down', headers: { get: () => null } });
        const wd = wikidata(dir, { fetchFn, wait: async () => {} });
        await assert.rejects(wd.queryAll(['SELECT 2'], 'thai-first'), /gave up thai-first-0/);
    } finally { rmSync(new URL('..', dir), { recursive: true, force: true }); }
});

test('Wikidata\'s 429 waits its Retry-After, and a stored answer asks nothing', async () => {
    const dir = pathToFileURL(mkdtempSync(join(tmpdir(), 'npcnames-wd-')) + '/wd/');
    try {
        const waits = [];
        const replies = [[429, '', '7'], [200, 'f,c\nQ1,2\n']];
        const fetchFn = async () => { const [status, body, after] = replies.shift(); return { status, text: async () => body, headers: { get: () => after } }; };
        const wd = wikidata(dir, { fetchFn, wait: async ms => { waits.push(ms); } });
        assert.deepEqual(await wd.query('SELECT 1'), [{ f: 'Q1', c: '2' }]);
        assert.deepEqual(await wd.query('SELECT 1'), [{ f: 'Q1', c: '2' }]);
        assert.deepEqual([waits.includes(7000), wd.stats], [true, { asked: 1, cached: 1, fail: 0, limited: 1 }]);
    } finally { rmSync(new URL('..', dir), { recursive: true, force: true }); }
});

test('new names enter by kind with their fields, and a name held in its culture or overused is refused', () => {
    const db = { first_names: [{ name: 'Ion', language_ethnicity: 'romanian' }], last_names: [] };
    const first = ['first', 'romanian', 'Mihai', 'male', 'Wikidata', 'adult', 'contemporary', 'neutral', 'average', 'pleasant', 'common', 'sliceOfLife', '-'];
    const last = ['last', 'romanian', 'Popescu', '-', 'Wikidata', 'contemporary', 'neutral', 'pleasant', 'common', 'sliceOfLife', '-'];
    assert.deepEqual(addNames(db, [first, last], new Set()), ['add first romanian Mihai male (Wikidata)', 'add last romanian Popescu no gender (Wikidata)']);
    assert.deepEqual([db.first_names[1].age, db.first_names[1].themes, 'gender' in db.last_names[0]], [['adult'], [], false]);
    assert.throws(() => addNames(db, [['first', 'romanian', 'Íon', ...first.slice(3)]], new Set()), /already held/);
    assert.throws(() => addNames(db, [['last', 'romanian', 'Elara', ...last.slice(3)]], new Set(['elara'])), /overused/);
    assert.throws(() => addNames(db, [['last', 'romanian', 'Ionescu', ...last.slice(3)]], new Set(), ['first']), /kind/);
    // Đ is a letter of its own, but Do beside Đỗ is one name twice.
    assert.throws(() => addNames({ first_names: [{ name: 'An', language_ethnicity: 'vietnamese' }], last_names: [{ name: 'Đỗ', language_ethnicity: 'vietnamese' }] },
        [['last', 'vietnamese', 'Do', ...last.slice(3)]], new Set()), /already held/);
});

test('10c: a reader\'s tag line is read past an echoed name, and two of three readers decide each tag', () => {
    const a = parseTagAnswers('1 CDE - c\n2 Mary Anne BCD - u\n3 - fantasy r\n4 - Yilvoxe - nowhere r\n5 ABCDE c\nnoise');
    assert.deepEqual([...a.keys()], [1, 2, 3, 4, 5]);
    assert.deepEqual(a.get(1), { periods: 'CDE', place: null, common: 'c' }, 'the plain form before an echo');
    assert.deepEqual(a.get(2), { periods: 'BCD', place: null, common: 'u' });
    assert.deepEqual(a.get(4).place, '?');
    assert.deepEqual(a.get(5), { periods: 'ABCDE', place: null, common: 'c' }, 'a used name\'s place left out');
    const r = (periods, place, common) => ({ periods, place, common });
    assert.deepEqual(decideTags([r('CDE', null, 'c'), r('DE', null, 'u'), r('', 'fantasy', 'r')]), { used: true, periods: 'DE', place: null, common: null });
    assert.deepEqual(decideTags([r('', 'fantasy', 'r'), r('', 'fantasy', 'r'), r('D', null, 'u')]), { used: false, periods: '', place: 'fantasy', common: 'r' });
    assert.deepEqual(decideTags([r('', 'german', 'c'), r('', 'fantasy', 'u'), undefined]), { used: false, periods: '', place: null, common: null });
    assert.deepEqual(decideTags([r('D', null, 'c'), undefined, r('', '?', 'r')]).used, null, 'one each: no change');
});

test('10c: a used name takes its periods\' tags in place of the old ones; an unused one loses them and takes its place\'s', () => {
    const e = { name: 'X', age: ['adult', 'elder'], era: ['contemporary', 'ancient'], genre: ['sliceOfLife', 'horror'] };
    assert.deepEqual(tagsFor(e, { used: true, periods: 'BC', place: null }),
        { age: ['adult', 'elder'], era: ['contemporary', 'ancient', 'nineteenTwenties', 'midcentury'], genre: ['sliceOfLife', 'horror', 'noirDetective'] });
    assert.deepEqual(tagsFor(e, { used: true, periods: 'A', place: null }), { age: ['adult'], era: ['ancient', 'victorian'], genre: ['horror'] });
    assert.deepEqual(tagsFor({ ...e, era: ['contemporary'] }, { used: false, periods: '', place: 'fantasy' }), { era: ['timeless'], genre: ['horror', 'fantasy'] });
    assert.deepEqual(tagsFor({ name: 'S', era: ['contemporary'], genre: ['sliceOfLife'] }, { used: true, periods: 'EF', place: null }),
        { era: ['contemporary', 'modern'], genre: ['sliceOfLife'] }, 'a surname has no age');
    assert.deepEqual(tagsFor(e, { used: null, periods: '', place: null }), {});
});

test('10c: commonness follows rank in a list of the name\'s script; absent from it, never common; else the readers\'', () => {
    const nd = { first: { IT: [[1, 'Giuseppe', 1, 0], [400, 'Gualtiero', 1, 0]], RU: [[1, 'Сергей', 1, 0], [2, 'Иван', 1, 0], [3, 'Ivan', 1, 0]] } };
    const ranks = listRanks(nd, 'first', ['italian', 'slavicRussian', 'latin']);
    const c = (culture, name, commonness, read) => commonnessFor({ name, language_ethnicity: culture, commonness }, ranks, read);
    assert.deepEqual([c('italian', 'Giuseppe', 'rare', 'r'), c('italian', 'Gualtiero', 'common', 'c'), c('italian', 'Ugolino', 'common', 'c'),
        c('italian', 'Ugolino', 'common', 'r'), c('slavicRussian', 'Иван', 'rare', null), c('latin', 'Gaius', 'rare', 'c'), c('latin', 'Gaius', 'rare', null)],
        ['common', 'uncommon', 'uncommon', 'rare', 'common', 'common', 'rare']);
    const thai = listRanks({ first: { TH: [[1, 'Somchai', 1, 0]] } }, 'first', ['thai']);
    assert.equal(commonnessFor({ name: 'สมชาย', language_ethnicity: 'thai', commonness: 'uncommon' }, thai, 'c'), 'common', 'another script: the readers');
});

test('10-fix: a first name\'s rank is its place among its sex\'s names, so a woman\'s top name is common though her list\'s overall rank is past 300', () => {
    const rows = Array.from({ length: 400 }, (_, i) => [i + 1, `M${String.fromCharCode(97 + i % 26)}${String.fromCharCode(97 + Math.floor(i / 26))}`, 1, 0]);
    const ranks = listRanks({ first: { SA: [...rows, [416, 'Nura', 0, 1], [417, 'Maab', 1, 0]] }, last: { SA: [[416, 'Nura', 0, 1]] } }, 'first', ['arabic']);
    const c = name => commonnessFor({ name, language_ethnicity: 'arabic', commonness: 'rare' }, ranks, null);
    assert.deepEqual([c('Nura'), c('Maab'), c('Maa')], ['common', 'uncommon', 'common']);
    const last = listRanks({ last: { SA: [...rows, [416, 'Nura', 0, 1]] } }, 'last', ['arabic']);
    assert.equal(commonnessFor({ name: 'Nura', language_ethnicity: 'arabic', commonness: 'rare' }, last, null), 'uncommon', 'a surname keeps its list rank');
});

test('10-fix: Irish Gaelic is not ranked by Ireland\'s list (English-speaking), so a Gaelic form it lacks keeps the readers\' commonness', () => {
    const ie = listRanks({ first: { IE: [[1, 'John', 1, 0]] } }, 'first', ['irishGaelic', 'english']);
    assert.deepEqual([ie.has('irishGaelic'), ie.has('english')], [false, true]);
    assert.equal(commonnessFor({ name: 'Seán', language_ethnicity: 'irishGaelic', commonness: 'uncommon' }, ie, 'c'), 'common');
});

test('10c: a five-field tag line reads its periods and the first place it names; a people\'s other name reads as its key', () => {
    const a = parseTagAnswers('1 ABC - slavicOther u\n2 - ancient - r\n3 Mary Anne ABC - swedish u\n4 A - - r\n5 - bulgarian r\n6 - russian r');
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(i => a.get(i)), [{ periods: 'ABC', place: 'slavicOther', common: 'u' }, { periods: '', place: 'ancient', common: 'r' },
        { periods: 'ABC', place: 'swedish', common: 'u' }, { periods: 'A', place: null, common: 'r' }, { periods: '', place: 'slavicOther', common: 'r' },
        { periods: '', place: 'slavicRussian', common: 'r' }]);
});

test('10c: a decision with no agreed period and no place changes no tag', () => {
    const e = { name: 'X', age: ['adult', 'elder'], era: ['contemporary'], genre: ['sliceOfLife'] };
    assert.deepEqual([tagsFor(e, { used: false, periods: '', place: null }), tagsFor(e, { used: false, periods: '', place: 'thai' }),
        tagsFor(e, { used: true, periods: '', place: null })], [{}, {}, {}]);
});

test('10-fix: a new name of today\'s list takes the eras of its periods by 10c\'s rule, contemporary always', () => {
    const blank = { age: [], era: [], genre: [] };
    const first = firstNameTags({ periods: 'BC', allure: 'pleasant', theme: null });
    const rule = tagsFor(blank, { used: true, periods: 'BCD', place: null });
    assert.deepEqual([first.age, first.era, first.genre], [rule.age, rule.era, rule.genre]);
    const last = lastNameTags({ periods: 'AC', allure: 'pleasant', theme: null });
    assert.deepEqual([last.era, last.genre], [['victorian', 'midcentury', 'contemporary'], ['sliceOfLife', 'noirDetective']]);
});

test('10-fix: a surname milestone 10 added takes the periods 10c\'s readers agree on, by the same rule, used always and D always', () => {
    const a = p => ({ periods: p, place: null, common: 'r' });
    const read = decideNew([a('AC'), a('A'), a('C')]), none = decideNew([a(''), a(''), a('C')]);
    assert.deepEqual([read, none], [{ used: true, periods: 'ACD', place: null, common: null }, { used: true, periods: 'D', place: null, common: null }]);
    const held = lastNameTags({ allure: 'pleasant', theme: null });
    const t = tagsFor(held, read);
    assert.deepEqual([[...t.era].sort(), t.genre], [lastNameTags({ periods: 'AC', allure: 'pleasant', theme: null }).era.sort(), ['sliceOfLife', 'noirDetective']]);
});

test('10-fix: a Latin name from today\'s lists is tagged as 10c tags Latin names, borne only in antiquity: adult, ancient, rare', () => {
    const t = ancientTags(firstNameTags({ periods: 'BC', allure: 'pleasant', theme: 'regal' }));
    assert.deepEqual([t.age, t.era, t.genre, t.commonness, t.themes], [['adult'], ['ancient'], [], 'rare', ['regal']]);
});

test('10c: one line given for every name of a list is no reading', () => {
    const same = parseTagAnswers(Array.from({ length: 20 }, (_, i) => `${i + 1} - ancient - r`).join('\n'));
    const read = parseTagAnswers(Array.from({ length: 20 }, (_, i) => `${i + 1} ${i ? 'CDE - c' : '- ancient r'}`).join('\n'));
    assert.deepEqual([isBlanket(same, 20), isBlanket(read, 20), isBlanket(parseTagAnswers('1 CDE - c\n2 CDE - c'), 2)], [true, false, false]);
});

test('10c: a moved name takes its new people\'s commonness and surname gender; a swap loses no name', () => {
    const ranks = listRanks({ last: { CN: [[120, 'Chia', 1, 0]] } }, 'last', ['chinese']);
    const h = (name, culture, more = {}) => ({ name, language_ethnicity: culture, race: 'human', commonness: 'uncommon', ...more });
    const list = [h('Chia', 'korean'), h('Barlas', 'greek', { gender: 'male' }), h('Kaya', 'turkish'), h('Lee', 'english'), h('Lee', 'korean')];
    const n = { used: false, periods: '', common: null };
    const decisions = new Map([['last|korean|Chia', { ...n, place: 'chinese' }], ['last|greek|Barlas', { ...n, place: 'turkish' }],
        ['last|english|Lee', { ...n, place: 'korean' }], ['last|korean|Lee', { ...n, place: 'english' }]]);
    const { list: kept } = applyTags(list, 'last', decisions, ranks);
    assert.deepEqual(kept.map(e => [e.name, e.language_ethnicity, e.commonness, e.gender ?? '-']),
        [['Chia', 'chinese', 'common', '-'], ['Barlas', 'turkish', 'uncommon', '-'], ['Kaya', 'turkish', 'uncommon', '-'], ['Lee', 'english', 'uncommon', '-']]);
});

test('audit fix C4: the nano-gpt address is named only in the client, tools/nanogpt.mjs', () => {
    const code = dir => readdirSync(new URL(dir, ROOT)).filter(f => /\.m?js$/.test(f)).map(f => dir + f);
    const naming = [...code('./'), ...code('./tools/'), ...code('./test/')]
        .filter(f => f !== './test/tools.test.js' && readFileSync(new URL(f, ROOT), 'utf8').includes('nano-gpt.com'));
    assert.deepEqual(naming, ['./tools/nanogpt.mjs']);
});

test('audit fix C7: heldBy gives the spelling keys of a culture, built once per culture', () => {
    const entries = [{ name: 'Élise', language_ethnicity: 'french' }, { name: 'Anna', language_ethnicity: 'german' }];
    const heldOf = heldBy(entries);
    assert.deepEqual([...heldOf('french')], [norm('Elise')]);
    assert.equal(heldOf('french'), heldOf('french'));
    assert.equal(heldOf('welsh').size, 0);
});
