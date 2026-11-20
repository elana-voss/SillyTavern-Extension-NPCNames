// The extension's own modules: the pick, what the AI is told, the tool-call lines.
import { test } from 'node:test';
import { pickName, readUsed } from '../picker.js';
import { TOOL_DESCRIPTION, TOOL_NAME, buildToolParameters, injectBeforeLatest } from '../advertisement.js';
import { isInstalledIn } from '../install.js';
import { HIDDEN_TOOL_CALL_CLASS, markToolCallLines } from '../tool-calls.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEntry, makeSurname, fixedRng, pickFresh, ROOT } from './helpers.js';

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

test('C5: the tool is named once, and the description calls it by that name', () => {
    assert.equal(TOOL_NAME, 'suggest_npc_name');
    assert.ok(TOOL_DESCRIPTION.includes(`call ${TOOL_NAME}, with`));
});

test('the install folder is told from the module\'s address', () => {
    const at = folder => `http://host:1/scripts/extensions/third-party/${folder}/index.js?v=1`;
    assert.ok(isInstalledIn(at('Right'), 'third-party/Right'));
    assert.ok(!isInstalledIn(at('Right-main'), 'third-party/Right'));
});

test('the AI is told how to ask for an elf, a dwarf or a dragon', () => {
    const text = [readFileSync(new URL('./assets/advertisement.txt', ROOT), 'utf8'), TOOL_DESCRIPTION];
    for (const race of ['elf', 'dwarf', 'dragon']) assert.ok(text.every(t => t.includes(`race: ${race}`)), race);
});

test('10e: the AI passes a commonness only when the story calls for it', () => {
    const ad = readFileSync(new URL('./assets/advertisement.txt', ROOT), 'utf8');
    const only = 'only when the story calls for it';
    assert.ok(/`commonness`: common, uncommon, rare\. Pass it only when the story calls for it/.test(ad), 'instructions');
    assert.ok(TOOL_DESCRIPTION.includes(`Pass commonness ${only}`), 'tool description');
    assert.ok(buildToolParameters({}).properties.commonness.description.includes(only), 'commonness field');
});

test('the AI calls the tool when a name is learned, not when a character arrives', () => {
    const [ad, code] = [readFileSync(new URL('./assets/advertisement.txt', ROOT), 'utf8'), TOOL_DESCRIPTION];
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


// 10d: first names of `common`, `uncommon` and `rare` sizes; the share of each class over evenly spread draws, each on a fresh used set unless one is given.
const classList = sizes => Object.entries(sizes).flatMap(([commonness, n]) =>
    Array.from({ length: n }, (_, i) => makeEntry({ name: `${commonness}${i}`, commonness })));
function classShares(firsts, filters = {}, used = () => new Set(), draws = 2000) {
    const count = { common: 0, uncommon: 0, rare: 0 };
    for (let k = 0; k < draws; k++) {
        const pick = pickName(firsts, [makeSurname()], filters, used(), new Set(), max => Math.floor(k / draws * max));
        count[pick.commonness]++;
    }
    return Object.fromEntries(Object.entries(count).map(([c, n]) => [c, Math.round(100 * n / draws)]));
}

test('10d: common names come 7 picks in 10 in any list, a less usual name never likelier, a common one at most 4x an uncommon, 16x a rare one', () => {
    assert.equal(classShares(classList({ common: 10, uncommon: 10, rare: 10 })).common, 70);
    assert.equal(classShares(classList({ common: 10, uncommon: 5, rare: 20 })).common, 70);
    assert.equal(classShares(classList({ common: 8, uncommon: 1, rare: 1 })).common, 80);
    assert.equal(classShares(classList({ common: 1, rare: 20 })).common, Math.round(100 * 16 / 36));
    assert.equal(classShares(classList({ common: 1, uncommon: 20 })).common, Math.round(100 * 4 / 24));
});

test('10d: the lean is set from the unused names, an uncommon one 4x a rare one once the common names are used', () => {
    const firsts = classList({ common: 10, uncommon: 10, rare: 10 });
    const commonUsed = () => new Set(firsts.filter(e => e.commonness === 'common').map(e => `english/${e.name}`));
    assert.deepEqual(classShares(firsts, {}, commonUsed), { common: 0, uncommon: 80, rare: 20 });
});

test('10d: a commonness the AI passes keeps an even pick among the names it allows', () => {
    assert.equal(classShares(classList({ common: 1, rare: 19 }), { commonness: ['common', 'rare'] }).common, 5);
});

// What must stay true of the data. An apply tool's asserts check its input, once, on the database as
