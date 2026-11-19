// Run via: node test.js

import { deriveEnumValues, pickName, readUsed } from './picker.js';
import { injectBeforeLatest, isInstalledIn } from './advertisement.js';
import { HIDDEN_TOOL_CALL_CLASS, markToolCallLines } from './tool-calls.js';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { foldName, loadOverused } from './tools/overused.mjs';
import { addNames, parseLines } from './tools/db.mjs';
import { labelLines, nameOfLabel, nameQueries, parseCsv, rankRows, wikidata } from './tools/wikidata.mjs';
import { client } from './tools/nanogpt.mjs';
import { bothSexes, decide, firstNameTags, knownKeys, lastNameTags, mergeSexes, newFirstNames, newSurnames, parseAnswers, readJobs } from './tools/name-read.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.error(`  ✗ ${name}`);
        console.error(`    ${e.message}`);
    }
}

function makeEntry(overrides = {}) {
    return {
        name: 'Test', gender: 'female', language_ethnicity: 'english', mythology: null, race: 'human', age: ['adult'],
        era: ['contemporary'], role: ['neutral'], intelligence: 'average', allure: 'pleasant', commonness: 'uncommon',
        genre: ['sliceOfLife'], themes: [], ...overrides,
    };
}

function makeSurname(overrides = {}) {
    return {
        name: 'Generic', language_ethnicity: 'english', mythology: null, race: 'human', era: ['contemporary'],
        role: ['neutral'], allure: 'pleasant', commonness: 'uncommon', genre: ['sliceOfLife'], themes: [], ...overrides,
    };
}

// Deterministic RNG for predictable test outcomes.
const fixedRng = (max) => 0;
const pickFresh = (firsts, lasts, filters = {}) => pickName(firsts, lasts, filters, new Set(), new Set(), fixedRng);

console.log('NPCNames picker tests:');

test('matches gender + culture filter exactly', () => {
    const firsts = [makeEntry({ name: 'Bo', gender: 'male', language_ethnicity: 'japanese' }), makeEntry({ name: 'Alice' }),
        makeEntry({ name: 'Hana', language_ethnicity: 'japanese' })];
    const pick = pickFresh(firsts, [makeSurname({ name: 'Tanaka', language_ethnicity: 'japanese' }), makeSurname({ name: 'Smith' })],
        { gender: 'female', language_ethnicity: 'japanese' });
    assert.equal(pick.first_name, 'Hana');
    assert.equal(pick.relaxed_filters, undefined);
});

test('drops filters in priority order when intersection is empty', () => {
    const firsts = [makeEntry({
        name: 'Mira', gender: 'female', language_ethnicity: 'slavicRussian', role: ['villain'], intelligence: 'bookish',
        allure: 'pretty', genre: ['horror', 'sliceOfLife'], themes: ['regal'],
    })];
    const lasts = [makeSurname({ name: 'Volkov', language_ethnicity: 'slavicRussian' })];
    const pick = pickFresh(firsts, lasts, { gender: 'female', language_ethnicity: 'slavicRussian', age: 'child',
        era: 'nineteenTwenties', role: 'villain', intelligence: 'bookish', themes: ['celestial'] });
    assert.equal(pick.first_name, 'Mira');
    assert.ok(pick.relaxed_filters.includes('themes'));
    assert.ok(pick.relaxed_filters.includes('age'));
    assert.ok(pick.relaxed_filters.includes('era'));
    // themes drops before age per DROP_ORDER.
    assert.ok(pick.relaxed_filters.indexOf('themes') < pick.relaxed_filters.indexOf('age'));
});

test('resets the used set within the active slice when exhausted', () => {
    const firsts = [
        makeEntry({ name: 'Hana', gender: 'female', language_ethnicity: 'japanese' }),
        makeEntry({ name: 'Yuki', gender: 'female', language_ethnicity: 'japanese' }),
    ];
    const lasts = [makeSurname({ name: 'Tanaka', language_ethnicity: 'japanese' })];
    const usedFirst = new Set();
    const usedLast = new Set();
    pickName(firsts, lasts, { language_ethnicity: 'japanese' }, usedFirst, usedLast, fixedRng);
    pickName(firsts, lasts, { language_ethnicity: 'japanese' }, usedFirst, usedLast, fixedRng);
    assert.equal(usedFirst.size, 2);
    const third = pickName(firsts, lasts, { language_ethnicity: 'japanese' }, usedFirst, usedLast, fixedRng);
    assert.ok(['Hana', 'Yuki'].includes(third.first_name));
    assert.equal(usedFirst.size, 1);
    assert.ok(usedFirst.has(`japanese/${third.first_name}`));
});

test('surname culture always matches the first name even without a culture filter', () => {
    const lasts = [makeSurname({ name: 'Tanaka', language_ethnicity: 'japanese' }), makeSurname({ name: 'Smith' })];
    const pick = pickFresh([makeEntry({ name: 'Hana', language_ethnicity: 'japanese' })], lasts);
    assert.equal(pick.last_name, 'Tanaka');
});

test('multi-era entry matches each of its eras', () => {
    const firsts = [makeEntry({ name: 'Eleanor', era: ['victorian', 'midcentury'] }), makeEntry({ name: 'Beatrice', era: ['ancient'] })];
    for (const [era, name] of [['victorian', 'Eleanor'], ['midcentury', 'Eleanor'], ['ancient', 'Beatrice']]) {
        assert.equal(pickFresh(firsts, [makeSurname()], { era }).first_name, name);
    }
});

test('culture without surnames returns the first name alone', () => {
    const firsts = [makeEntry({ name: 'Paarthurnax', language_ethnicity: 'fantasyDragon', race: 'dragon' })];
    const lasts = [makeSurname({ name: 'Smith', language_ethnicity: 'english' })];
    const pick = pickFresh(firsts, lasts);
    assert.equal(pick.first_name, 'Paarthurnax');
    assert.equal('last_name' in pick, false);
    assert.equal('last_name_role' in pick, false);
});

test('a god gets no surname even when its culture has surnames', () => {
    const firsts = [makeEntry({ name: 'Shiva', language_ethnicity: 'hindi', race: 'mythical' })];
    const lasts = [makeSurname({ name: 'Sharma', language_ethnicity: 'hindi' })];
    const pick = pickFresh(firsts, lasts);
    assert.equal(pick.first_name, 'Shiva');
    assert.equal('last_name' in pick, false);
});

test('surname never repeats the first name', () => {
    const firsts = [makeEntry({ name: 'Agus' })];
    const lasts = [makeSurname({ name: 'Agus' }), makeSurname({ name: 'Wijaya' })];
    const pick = pickFresh(firsts, lasts);
    assert.equal(pick.last_name, 'Wijaya');
});

test('genre filter prefers tagged names, then reports an untagged one as relaxed', () => {
    const firsts = [makeEntry({ name: 'Plain', genre: [] }), makeEntry({ name: 'Watt', genre: ['steampunk'] })];
    const lasts = [makeSurname()];
    const usedFirst = new Set();
    const one = pickName(firsts, lasts, { genre: 'steampunk' }, usedFirst, new Set(), fixedRng);
    assert.equal(one.first_name, 'Watt');
    assert.equal(one.relaxed_filters, undefined);
    const two = pickName(firsts, lasts, { genre: 'steampunk' }, usedFirst, new Set(), fixedRng);
    assert.equal(two.first_name, 'Plain');
    assert.deepEqual(two.relaxed_filters, ['genre']);
});

test('relaxing keeps every filter that was not part of the conflict', () => {
    const firsts = [
        makeEntry({ name: 'Hana', gender: 'female', language_ethnicity: 'japanese', commonness: 'rare' }),
        makeEntry({ name: 'Alice', gender: 'female', language_ethnicity: 'english', commonness: 'common' }),
    ];
    const lasts = [makeSurname({ language_ethnicity: 'japanese' }), makeSurname({ name: 'Smith' })];
    const pick = pickFresh(firsts, lasts, { gender: 'nonbinary', language_ethnicity: 'japanese', commonness: 'rare' });
    assert.equal(pick.first_name, 'Hana');
    assert.deepEqual(pick.relaxed_filters, ['gender']);
});

test('tolerates themes sent as a single string and null filters', () => {
    const firsts = [makeEntry({ name: 'Rex', themes: ['regal'] }), makeEntry({ name: 'Bob' })];
    const pick = pickFresh(firsts, [makeSurname()], { themes: 'regal', gender: null, language_ethnicity: 'nope' });
    assert.equal(pick.first_name, 'Rex');
    assert.deepEqual(pick.relaxed_filters, ['language_ethnicity']);
});

test('a filter sent as a list matches any of its values, in every kind of field', () => {
    const firsts = [
        makeEntry({ name: 'Ann', gender: 'female', age: ['child'], intelligence: 'plain', genre: ['horror'] }),
        makeEntry({ name: 'Bob', gender: 'male', age: ['elder'], intelligence: 'bookish', genre: ['western'] }),
    ];
    for (const [filters, name] of [
        [{ gender: ['male'] }, 'Bob'], [{ age: ['elder', 'nope'] }, 'Bob'], [{ intelligence: ['bookish'] }, 'Bob'],
        [{ genre: ['western', 'nope'] }, 'Bob'], [{ themes: [], age: [] }, 'Ann'],
    ]) {
        const pick = pickFresh(firsts, [makeSurname()], filters);
        assert.equal(pick.first_name, name, JSON.stringify(filters));
        assert.equal(pick.relaxed_filters, undefined, JSON.stringify(filters));
    }
});

const sharedFirsts = [makeEntry({ name: 'Noah', language_ethnicity: 'hebrew' }), makeEntry({ name: 'Noah' }), makeEntry({ name: 'Eli' })];

test('a first name and a surname used in one culture stay free in another', () => {
    const lasts = [makeSurname({ name: 'Cohen', language_ethnicity: 'hebrew' }), makeSurname({ name: 'Cohen' }), makeSurname({ name: 'Smith' })];
    const usedFirst = new Set();
    const usedLast = new Set();
    pickName(sharedFirsts, lasts, { language_ethnicity: 'hebrew' }, usedFirst, usedLast, fixedRng);
    const other = pickName(sharedFirsts, lasts, { language_ethnicity: 'english' }, usedFirst, usedLast, fixedRng);
    assert.equal(other.first_name, 'Noah');
    assert.equal(other.last_name, 'Cohen');
});

test('a used list from an earlier version counts its names in every culture and survives anything else', () => {
    assert.deepEqual([...readUsed(['Noah', 'Gone', 5, null], sharedFirsts)].sort(), ['english/Noah', 'hebrew/Noah']);
    assert.deepEqual([...readUsed(['hebrew/Noah'], sharedFirsts)], ['hebrew/Noah']);
    for (const stored of [undefined, null, 'Noah', {}]) assert.equal(readUsed(stored, sharedFirsts).size, 0);
});

test('a reset of the used names leaves tagged names first', () => {
    const firsts = [makeEntry({ name: 'Plain', genre: [] }), makeEntry({ name: 'Watt', genre: ['steampunk'] })];
    const usedFirst = new Set(['english/Plain', 'english/Watt']);
    const pick = pickName(firsts, [makeSurname()], { genre: 'steampunk' }, usedFirst, new Set(), fixedRng);
    assert.equal(pick.first_name, 'Watt');
    assert.equal(pick.relaxed_filters, undefined);
    assert.deepEqual([...usedFirst], ['english/Watt']);
});

test('in a group chat the advertisement bears the user\'s name, which SillyTavern does not prefix', () => {
    const chat = [{ mes: 'latest' }];
    injectBeforeLatest(chat, 'ad', 'Me');
    assert.equal(chat[0].name, 'Me');
    injectBeforeLatest(chat, 'ad');
    assert.equal(chat[1].name, 'NPC Name Suggester');
});

test('only lines holding nothing but our tool are hidden, and only while showing is off', () => {
    const chat = [
        { extra: { tool_invocations: [{ name: 'ours' }, { name: 'ours' }] } },
        { extra: { tool_invocations: [{ name: 'ours' }, { name: 'theirs' }] } },
        { extra: { tool_invocations: [{ name: 'theirs' }] } },
        { extra: { tool_invocations: [] } },
        { extra: {} },
    ];
    const lines = chat.map((_, id) => {
        const classes = new Set();
        return {
            classes,
            getAttribute: () => String(id),
            classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
        };
    });
    const hidden = () => lines.map(line => line.classes.has(HIDDEN_TOOL_CALL_CLASS));
    markToolCallLines(lines, chat, 'ours', false);
    assert.deepEqual(hidden(), [true, false, false, false, false]);
    markToolCallLines(lines, chat, 'ours', true);
    assert.deepEqual(hidden(), [false, false, false, false, false]);
});

test('the install folder is told from the module\'s address', () => {
    const at = folder => `http://host:1/scripts/extensions/third-party/${folder}/index.js?v=1`;
    assert.ok(isInstalledIn(at('Right'), 'third-party/Right'));
    assert.ok(!isInstalledIn(at('Right-main'), 'third-party/Right'));
});

test('the AI is told how to ask for an elf, a dwarf or a dragon', () => {
    const text = ['./assets/advertisement.txt', './advertisement.js'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8'));
    for (const race of ['elf', 'dwarf', 'dragon']) assert.ok(text.every(t => t.includes(`race: ${race}`)), race);
});

test('the AI calls the tool when a name is learned, not when a character arrives', () => {
    const [ad, code] = ['./assets/advertisement.txt', './advertisement.js']
        .map(file => readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('\\\'', '\''));
    const timing = 'Before writing a reply in which a new character\'s name first appears, call suggest_npc_name';
    assert.ok(ad.startsWith(timing), 'instructions open with the timing');
    assert.ok(ad.includes('A name appears only when {{user}} would learn it'), 'when a name is learned');
    assert.ok(ad.includes('fit the character as already established'), 'filters for a late call');
    assert.ok(code.includes(timing), 'tool description');
    for (const [label, text] of [['advertisement', ad], ['advertisement.js', code]]) {
        assert.ok(!/new NPC you introduce|about to introduce|once per new NPC/.test(text), `${label}: arrival timing left`);
    }
});

test('advertisement goes right before the latest message, so long chats keep it', () => {
    const chat = [{ mes: 'old' }, { mes: 'latest' }];
    injectBeforeLatest(chat, 'ad');
    assert.equal(chat.length, 3);
    assert.equal(chat[1].mes, 'ad');
    assert.equal(chat[1].extra.type, 'narrator');
    assert.equal(chat[2].mes, 'latest');
    const empty = [];
    injectBeforeLatest(empty, 'ad');
    assert.equal(empty[0].mes, 'ad');
});

test('a surname of the other gender is never given; one without a gender is', () => {
    const firsts = [makeEntry({ name: 'Piotr', gender: 'male' })];
    const kowalska = makeSurname({ name: 'Kowalska', gender: 'female' });
    const wojcik = makeSurname({ name: 'Wojcik' });
    assert.equal(pickFresh(firsts, [kowalska, wojcik]).last_name, 'Wojcik');
    assert.equal('last_name' in pickFresh(firsts, [kowalska]), false);
});

test('an ambiguous character takes a surname of any gender', () => {
    const firsts = [makeEntry({ name: 'Sasha', gender: 'ambiguous' })];
    const lasts = [makeSurname({ name: 'Kowalska', gender: 'female' })];
    assert.equal(pickFresh(firsts, lasts).last_name, 'Kowalska');
});

test('overused check folds case and accents, and no name of the new batch is on the list', () => {
    assert.equal(foldName('Élára'), foldName('elara'));
    const overused = loadOverused();
    const on = names => names.filter(n => overused.has(foldName(n)));
    const slop = ['Elara', 'Kael', 'Lyra', 'Seraphina', 'Thorn'];
    assert.deepEqual(on(slop), slop, 'the list holds names models keep inventing that are rare among real people');
    assert.deepEqual(on(['Maria', 'Anna', 'Thomas', 'Smith', 'Murphy', 'Ivan', 'Elena', 'Mihai', 'Popescu', 'Chen', 'Kim', 'Nguyen', 'Tanaka', 'Kofi']), [],
        'a name common among real people is no AI slop, whatever the models do');
    const batch = readFileSync(new URL('./tools/m5-names.txt', import.meta.url), 'utf8').split(/\r?\n/)
        .filter(l => l.startsWith('first | ') || l.startsWith('last | '))
        .map(l => l.split(' | ')[2]);
    assert.ok(batch.length > 1000, 'the batch is read');
    assert.deepEqual(batch.filter(n => overused.has(foldName(n))), []);
});

test('a real name marked not slop stays off the overused list, and the making tool keeps the mark', () => {
    const overused = loadOverused();
    assert.deepEqual(['jese', 'xaviere'].filter(n => overused.has(n)), []);
    const marked = readFileSync(new URL('./tools/overused-names.txt', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l.startsWith('#not-slop '));
    assert.deepEqual(marked.map(l => l.split(' ')[1]), ['jese', 'xaviere']);
    assert.match(readFileSync(new URL('./tools/m5-make-overused.mjs', import.meta.url), 'utf8'), /#not-slop /);
});

test('a data tool\'s list reads the same with either line end', () => {
    assert.deepEqual(parseLines('# note\r\na | b\r\n\r\nc | d\n'), [['a', 'b'], ['c', 'd']]);
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

async function testAsync(name, fn) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}`); console.error(`    ${e.message}`); }
}

await testAsync('a budget of 0 sends no request, though nothing is stored', async () => {
    const dir = pathToFileURL(mkdtempSync(join(tmpdir(), 'npcnames-llm-')) + '/');
    try {
        let fetched = 0;
        const fetchFn = async () => { fetched++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' } }], usage: { prompt_tokens: 10, completion_tokens: 1 } }) }; };
        await readJobs(client(dir, { fetchFn, wait: async () => {} }), [{ tag: 't', entries: [{ name: 'Smith' }] }], 'last', 0);
        assert.equal(fetched, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

await testAsync('a stored answer is read past the budget, a new call is not, and an empty answer\'s input counts as spent', async () => {
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

test('Wikidata\'s CSV: a quoted field keeps its comma and doubled quote', () => {
    assert.deepEqual(parseCsv('f,c,ln\r\nhttp://x/Q1,3,"Ion, ""Ionel"""\r\n'), [{ f: 'http://x/Q1', c: '3', ln: 'Ion, "Ionel"' }]);
});

test('a Wikidata label is a name without its bracketed note, and none where it holds two or a malformed one', () => {
    assert.deepEqual(['Thích (họ người)', 'Ganbold (Ганболд)', 'ปกรณ์/ภากร', "ffrench-O'Carroll", 'Богданa', 'Ó Néill']
        .map(nameOfLabel), ['Thích', 'Ganbold', null, null, null, 'Ó Néill']);
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

await testAsync('a Wikidata query given up stops the run, naming it, before a list is read thinner than its source', async () => {
    const dir = pathToFileURL(mkdtempSync(join(tmpdir(), 'npcnames-wd-')) + '/wd/');
    try {
        const fetchFn = async () => ({ status: 500, text: async () => 'down', headers: { get: () => null } });
        const wd = wikidata(dir, { fetchFn, wait: async () => {} });
        await assert.rejects(wd.queryAll(['SELECT 2'], 'thai-first'), /gave up thai-first-0/);
    } finally { rmSync(new URL('..', dir), { recursive: true, force: true }); }
});

await testAsync('Wikidata\'s 429 waits its Retry-After, and a stored answer asks nothing', async () => {
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

// What must stay true of the data. An apply tool's asserts check its input, once, on the database as
// it stood before: none of them looks at the database as it is now, so each pinned name stays here.
const inCulture = (list, culture) => list.filter(e => e.language_ethnicity === culture);
const keysOf = list => new Set(list.map(e => `${e.language_ethnicity}/${e.name}`));
const missing = (keys, wanted) => wanted.filter(k => !keys.has(k));
const present = (keys, unwanted) => unwanted.filter(k => keys.has(k));

function checkNamesAndHandles(data) {
    const all = [...data.first_names, ...data.last_names];
    assert.deepEqual(all.map(e => e.name).filter(n =>
        /^\p{Ll}/u.test(n)                                  // uncapitalised
        || /[/()]|\.$/.test(n)                              // "A/B", "Anu (2)", initials
        || /\s(?!(?:de|del|la|no|in|an)\s|h\p{Lu})\p{Ll}/u.test(n)   // a later word uncapitalised, but for particles
        || (/[A-Za-z]/.test(n) && /\p{Script=Cyrillic}/u.test(n))), []); // look-alike letters
    const handles = data.first_names.filter(e => e.genre.includes('cyberpunk'));
    assert.equal(handles.length, 100);
    assert.deepEqual(handles.filter(e => e.language_ethnicity !== 'cyberpunkHandle').map(e => e.name), []);
    assert.deepEqual(inCulture(data.last_names, 'cyberpunkHandle'), []);
    const names = new Set(all.map(e => e.name));
    const gone = ['Unnamed', 'Trnsfer', 'Qkr', 'Korea', 'Feng Shui', 'Kalevala', 'Abominable Snowmen', 'Accuser', 'Palladium', 'Wild Hunt',
        'Lord Shiva', 'Great Woman', 'Harsh joy', 'بسم الله', 'ابو علي', 'ابو محمد', 'ام محمد', 'Gioavanni', 'Mohmmad'];
    assert.deepEqual(gone.filter(n => names.has(n)), []);
    for (const list of [data.first_names, data.last_names]) {
        const keys = list.map(e => `${e.language_ethnicity}/${foldName(e.name).replace(/đ/g, 'd')}`);
        assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i && !['vietnamese/ngo', 'vietnamese/duc'].includes(k)), [], 'no name twice in a culture, accents aside'); // Ngô, Ngọ and Đức, Dục are two names each
        assert.deepEqual(list.filter(e => 'sentinel_fields' in e).map(e => e.name), []);
    }
}

function checkSurnameGenders(data) {
    const cultures = ['slavicPolish', 'slavicRussian', 'slavicOther', 'icelandic', 'ukrainian', 'turkish', 'swedish', 'greek', 'nepalese', 'irishGaelic', 'baltic', 'azerbaijani'];
    const FEMALE = /(sk|ck)a$|dóttir$|dottir$|dotter$|ová$|ienė$|(ов|ев|ск)а$|(ов|ев)ая$|(ov|yev)a$|(idou|opoulou)$/u;
    // Not -шин: the Ukrainian -ишин stays the same for a woman; nor the noun Литвин (Lytvyn).
    const MALE = /(sk|ck)i$|ński$|(ов|ев|ий)$|(?<!^Лит)[^ш]ин$|(ov|ev|yov)$|ņš$|(opoulos|idis|ides)$|^(Ó|Mac) /u;
    const wrong = data.last_names.filter(e => cultures.includes(e.language_ethnicity)).filter(e =>
        (FEMALE.test(e.name) && e.gender !== 'female') || (MALE.test(e.name) && e.gender !== 'male')
        // -son follows the person's sex in Icelandic; in Swedish it is a family name of both sexes.
        || (/son$/.test(e.name) && e.gender !== (e.language_ethnicity === 'icelandic' ? 'male' : undefined)));
    assert.deepEqual(wrong.map(e => e.name), []);
    // A Ukrainian form that does not decline is a woman's as well (Головко, Попович, Чайка).
    assert.deepEqual(inCulture(data.last_names, 'ukrainian').filter(e => e.gender
        && /((?<![сцз]ь)ка|ко|ук|юк|ич|ак|як|ач|ko|uk|yuk|ych|ak|yak|ach)$/u.test(e.name)).map(e => e.name), []);
    // Devi and Yadavani are women's surnames wherever they are filed; Hindi's others have no gender. Latin has its feminine forms.
    assert.deepEqual(data.last_names.filter(e => e.gender && !cultures.includes(e.language_ethnicity) && e.language_ethnicity !== 'latin').map(e => e.name).sort(), ['Devi', 'Yadavani']);
    // A missing name fails here. Greek -ou is used by both sexes; Irish women bear anglicised forms too.
    for (const [culture, name, gender] of [['greek', 'Nikolaou'], ['irishGaelic', "O'Byrne"], ['greek', 'Papadaki', 'female'],
        ['greek', 'Tassi', 'female'], ['greek', 'Zika', 'female'], ['greek', 'Mundis', 'male'], ['greek', 'Rubis', 'male'],
        ['hindi', 'Devi', 'female'], ['latin', 'Messalina', 'female'], ['baltic', 'Andrejeva', 'female'],
        ['baltic', 'Paulauskas', 'male'], ['irishGaelic', 'Ní Bhriain', 'female'], ['slavicOther', 'Dvořák', 'male'],
        // A surname's gender moves with it.
        ['baltic', 'Žukauskienė', 'female'], ['azerbaijani', 'Ahmadov', 'male'], ['slavicOther', 'Hristova', 'female'], ['greek', 'Makarezos', 'male']]) {
        const entry = inCulture(data.last_names, culture).find(e => e.name === name);
        assert.ok(entry, `no surname ${culture}/${name}`);
        assert.equal(entry.gender, gender, `${culture}/${name}`);
    }
    // Lithuanian -a is the man's form. These six left with the men's cut, so "not female" must also hold of their absence.
    const manForms = ['Noreika', 'Alekna', 'Mazeika', 'Rimša', 'Songaila', 'Čėsna'];
    assert.deepEqual(inCulture(data.last_names, 'baltic').filter(e => manForms.includes(e.name) && e.gender === 'female').map(e => e.name), []);
    const piotr = [makeEntry({ name: 'Piotr', gender: 'male', language_ethnicity: 'slavicPolish' })];
    for (let i = 0; i < 40; i++) {
        const pick = pickName(piotr, data.last_names, {}, new Set(), new Set(), max => i % max);
        assert.doesNotMatch(pick.last_name, /(sk|ck)a$/);
    }
    const forMen = inCulture(data.last_names, 'nepalese').filter(e => e.gender !== 'female').map(e => e.name);
    const ordinary = ['Magar', 'Yadav', 'Thapa', 'Gurung', 'Shrestha', 'Rai', 'Tamang', 'Karki', 'Adhikari', 'Bhandari'];
    assert.deepEqual(ordinary.filter(n => !forMen.includes(n)), [], 'a Nepalese man can draw the ordinary surnames of his country');
}

function checkCultures(data) {
    const nonHuman = ['cyberpunkHandle', 'fantasyDragon', 'fantasyDwarven', 'fantasyElvish'];
    const noSurnames = ['mongolian', 'nativeAmerican']; // Mongolian has none since milestone 3; see the plan.
    const cultures = ['arabic', 'chinese', 'dutch', 'english', 'estonian', 'finnish', 'french', 'german', 'greek',
        'hawaiian', 'hebrew', 'hindi', 'icelandic', 'indonesian', 'irishGaelic', 'italian', 'japanese', 'korean', 'latin',
        'maori', 'mayan', 'mongolian', 'nativeAmerican', 'nepalese', 'nigerian', 'norwegian', 'persian', 'portuguese',
        'scandinavian', 'serbian', 'slavicOther', 'slavicPolish', 'slavicRussian', 'spanish', 'swahili', 'swedish', 'thai',
        'turkish', 'ukrainian', 'yoruba', 'vietnamese', 'ghanaian', 'ethiopian', 'romanian', 'baltic', 'albanian',
        'azerbaijani', 'hungarian', 'fijian'];
    const offered = deriveEnumValues(data.first_names).language_ethnicity;
    assert.deepEqual([...cultures, ...nonHuman].filter(c => !offered.includes(c)), []);
    assert.equal(offered.includes('danish'), false);
    const short = [];
    for (const c of cultures) {
        const firsts = inCulture(data.first_names, c).filter(e => e.race === 'human');
        const lasts = inCulture(data.last_names, c);
        for (const g of ['male', 'female']) {
            if (firsts.filter(e => e.gender === g).length < 10) short.push(`${c} first ${g}`);
            if (!noSurnames.includes(c) && lasts.filter(e => !e.gender || e.gender === g).length < 10) short.push(`${c} last ${g}`);
        }
    }
    assert.deepEqual(short, []);
    for (const [label, first, last] of [['ghanaian', 28, 44], ['ethiopian', 53, 48]]) {
        assert.ok(inCulture(data.first_names, label).length >= first, label);
        assert.ok(inCulture(data.last_names, label).length >= last, label);
    }
    assert.deepEqual(inCulture(data.last_names, 'mongolian').map(e => e.name), []);
    assert.equal(inCulture(data.first_names, 'latin').filter(e => e.race === 'mythical' && e.mythology).length, 12);
    assert.ok(inCulture(data.last_names, 'latin').length >= 30, 'milestone 5 gives Latin its surnames');
    assert.equal(inCulture(data.first_names, 'scandinavian').filter(e => e.race === 'mythical').length, 14);
    const ferreira = inCulture(data.last_names, 'portuguese').find(e => e.name === 'Ferreira');
    assert.deepEqual(['age', 'intelligence', 'gender'].filter(k => k in ferreira), [], 'a first name made a surname keeps no first name\'s fields');
}

// A surname nobody can draw is dead data: each needs a first name of its culture
// that takes surnames and fits its gender.
function checkSurnamesReachable(data) {
    const takers = data.first_names.filter(e => e.race !== 'mythical');
    const reachable = s => takers.some(e => e.language_ethnicity === s.language_ethnicity && e.name !== s.name
        && (!s.gender || e.gender === 'ambiguous' || e.gender === s.gender));
    assert.deepEqual(data.last_names.filter(s => !reachable(s)).map(s => `${s.language_ethnicity}/${s.name}`), []);
}

// The README's lists and the instructions' cultures say what the data offers, no more and no less.
function checkDocuments(data) {
    const enums = deriveEnumValues(data.first_names);
    const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
    const readme = read('./README.md');
    for (const [field, values] of Object.entries(enums)) {
        const line = readme.match(new RegExp(`^- \\*\\*${field}\\*\\*:(.*)$`, 'm'))?.[1] ?? '';
        assert.deepEqual([...line.matchAll(/`([^`]+)`/g)].map(m => m[1]).sort(), values, `README ${field}`);
    }
    const cultures = read('./assets/advertisement.txt').match(/the cultural root of the name, one of: ([^.]+)\./)?.[1] ?? '';
    assert.deepEqual(cultures.split(', ').sort(), enums.language_ethnicity, 'advertisement');
}

function checkPinnedNames(data) {
    const firsts = keysOf(data.first_names);
    const lasts = keysOf(data.last_names);
    assert.deepEqual(missing(firsts, [
        'ghanaian/Alhassan', // an origin elsewhere holds no name back
        'romanian/Alexandru', 'romanian/Luminita', 'latin/Agripa', 'latin/Cicero', // Romanians out of Latin; two readers can bring a name in
        'scandinavian/Søren', 'fijian/Viliame', // Danes stay under scandinavian; the third reader settles a disagreement
        'maori/Shafraz', // a third answer equal to neither reader moves nothing
        'english/Flores', // one reader alone makes no first name a surname
        'hungarian/András', 'azerbaijani/Yusif', 'chinese/Hao', 'maori/Rosi',
        'nigerian/Yakubu', 'nigerian/Bilkisu', 'nigerian/Amina', // Hausa, not Yoruba
    ]), []);
    assert.deepEqual(present(firsts, ['maori/Viliame', 'spanish/Flores', 'finnish/Hristova', 'french/Ferreira', 'chinese/Zhang',
        'yoruba/Yakubu', 'yoruba/Bilkisu', 'yoruba/Amina', 'persian/Pixodarus', // Pixodarus is a Carian
        // One man's fame stays out.
        ...['Sitting Bull', 'Crazy Horse', 'Rain-in-the-Face', 'Black Elk', 'Cornplanter', 'Poundmaker', 'Cornstalk'].map(n => `nativeAmerican/${n}`),
    ]), []);
    assert.deepEqual(missing(lasts, ['ghanaian/Abubakar', 'romanian/Ciobanu', 'scandinavian/Østergaard', 'fijian/Tabua', 'fijian/Rabici',
        'portuguese/Ferreira', 'albanian/Hoxhaj',
        'korean/남궁', 'hebrew/דוד', // real surnames in both lists stay
    ]), []);
    // spanish/Flores is a surname since 10b (Mexico's 10th, three readers): the move rule above keeps english/Flores a first name.
    assert.deepEqual(present(lasts, ['arabic/يناير', 'arabic/مارس', 'slavicPolish/Sz', 'hebrew/Sh', 'yoruba/Gh', 'chinese/Mawar', 'korean/남자', 'azerbaijani/Memmedova', 'azerbaijani/Aliyeva',
        'latin/Gothicus', // a title
        // A woman's given name is no Yoruba surname.
        ...['Abosede', 'Ajoke', 'Atinuke', 'Aderonke', 'Adebimpe', 'Adejoke'].map(n => `yoruba/${n}`),
    ]), []);
    const culturesOf = name => data.first_names.filter(e => e.name === name).map(e => e.language_ethnicity);
    assert.deepEqual([...culturesOf('Fiji'), ...culturesOf('Rosi Ni')], [], 'a country, a broken form');
    assert.deepEqual(culturesOf('Ijeoma'), ['nigerian'], 'Igbo, not Yoruba');
    const first = (culture, name) => inCulture(data.first_names, culture).find(e => e.name === name);
    assert.deepEqual(data.first_names.filter(e => e.mythology && e.race !== 'mythical').map(e => e.name), []);
    assert.equal(first('mayan', 'Chaac').race, 'mythical');
    for (const c of ['english', 'arabic']) assert.equal(first(c, 'Noah').race, 'human');
    const dragons = data.first_names.filter(e => e.race === 'dragon').map(e => e.name);
    assert.deepEqual(['Smaug', 'Mushu', 'Maleficent', 'Saphira', 'Spike', 'Puff', 'Kingu', 'Samebito', 'Otohime', 'Lamia', 'Mishibijiw'].filter(n => dragons.includes(n)), []);
    assert.ok(dragons.length >= 30, `${dragons.length} dragons`);
    for (const [c, n, g] of [['arabic', 'Hamad', 'male'], ['persian', 'Sattar', 'male'], ['portuguese', 'Hermínia', 'female'], ['hindi', 'Shiva', 'ambiguous'], ['icelandic', 'Óliver', 'male'], ['italian', 'Giovanni', 'male'], ['arabic', 'Mohammad', 'male'], ['serbian', 'Borka', 'female'], ['ghanaian', 'Haruna', 'male']]) assert.equal(first(c, n).gender, g, n);
    assert.notEqual(first('english', 'Brown').commonness, 'common', 'a surname');
    assert.deepEqual(first('nativeAmerican', 'Big Elk').era, ['victorian']);
    assert.deepEqual(first('nativeAmerican', 'Winona').era, ['contemporary']);
    // The meaning-based classes tag real names by what they mean, not by how they sound.
    assert.ok(first('hawaiian', 'Mahina').themes.includes('lunar'), 'Mahina means moon');
    assert.ok(first('english', 'Georgia').themes.includes('rustic'), 'Georgia means farmer');
    for (const [c, n] of [['greek', 'Desdemona'], ['english', 'Carrie'], ['romanian', 'Vlad']]) assert.ok(first(c, n).genre.includes('horror'), n);
    assert.ok(!first('mongolian', 'Sarnai').themes.includes('lunar'), 'Sarnai means rose');
    assert.ok(!first('yoruba', 'Babatunde').genre.includes('horror'), 'Babatunde means the father has returned');
}

// The fix of milestone 5's names places them and deletes none: each stands somewhere, accents aside.
function checkNoNameLost(data) {
    const read = file => readFileSync(new URL(`./tools/${file}`, import.meta.url), 'utf8').split(/\r?\n/).map(l => l.split(' | '));
    const into = new Map(read('m6-tags.txt').filter(l => l[0] === 'merge' || l[0] === 'rename').map(l => [`${l[2]}|${l[3]}`, l[4]]));
    const names = new Set([...data.first_names, ...data.last_names].map(e => foldName(e.name)));
    const added = read('m5-names.txt').filter(l => l[0] === 'first' || l[0] === 'last');
    assert.equal(added.length, 3504);
    assert.deepEqual(added.map(([, c, n]) => into.get(`${c}|${n}`) ?? n).filter(n => !names.has(foldName(n))), []);
    assert.deepEqual([inCulture(data.first_names, 'vietnamese').some(e => e.name === 'Trần'), inCulture(data.last_names, 'vietnamese').some(e => e.name === 'Trần')], [false, true], 'Trần is a surname');
}

// Milestones 10a, 10b and 10b2: each common name of tools/m10a-names.txt, m10b-names.txt and
// m10b2-names.txt stands in its culture with its kind and sex (a surname's "-" is none).
function checkCommonNames(data) {
    const held = new Set(['first', 'last'].flatMap(kind => data[`${kind}_names`].map(e => `${kind}/${e.language_ethnicity}/${e.name}/${e.gender ?? '-'}`)));
    for (const file of ['m10a-names.txt', 'm10b-names.txt', 'm10b2-names.txt']) {
        const lines = parseLines(readFileSync(new URL(`./tools/${file}`, import.meta.url), 'utf8'));
        assert.deepEqual(lines.map(l => l.slice(0, 4).join('/')).filter(k => !held.has(k)), [], file);
    }
}

test('database invariants', () => {
    const data = JSON.parse(readFileSync(new URL('./data/name_database.tagged.json', import.meta.url), 'utf8'));
    for (const check of [checkNamesAndHandles, checkSurnameGenders, checkCultures, checkPinnedNames, checkSurnamesReachable, checkDocuments, checkNoNameLost, checkCommonNames]) check(data);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
