// Run via: node test.js

import { deriveEnumValues, pickName } from './picker.js';
import { injectBeforeLatest } from './advertisement.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foldName, loadOverused } from './tools/overused.mjs';
import { parseLines } from './tools/db.mjs';

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
    const firsts = [
        makeEntry({ name: 'Hana', gender: 'female', language_ethnicity: 'japanese' }),
        makeEntry({ name: 'Yuki', gender: 'female', language_ethnicity: 'japanese' }),
        makeEntry({ name: 'Alice', gender: 'female', language_ethnicity: 'english' }),
    ];
    const lasts = [
        makeSurname({ name: 'Tanaka', language_ethnicity: 'japanese' }),
        makeSurname({ name: 'Smith', language_ethnicity: 'english' }),
    ];
    const pick = pickFresh(firsts, lasts, { gender: 'female', language_ethnicity: 'japanese' });
    assert.equal(pick.gender, 'female');
    assert.equal(pick.language_ethnicity, 'japanese');
    assert.ok(['Hana', 'Yuki'].includes(pick.first_name));
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
    assert.ok(usedFirst.has(third.first_name));
});

test('surname culture always matches the first name even without a culture filter', () => {
    const firsts = [makeEntry({ name: 'Hana', language_ethnicity: 'japanese' })];
    const lasts = [
        makeSurname({ name: 'Tanaka', language_ethnicity: 'japanese' }),
        makeSurname({ name: 'Smith', language_ethnicity: 'english' }),
        makeSurname({ name: 'Volkov', language_ethnicity: 'slavicRussian' }),
    ];
    const pick = pickFresh(firsts, lasts);
    assert.equal(pick.first_name, 'Hana');
    assert.equal(pick.last_name, 'Tanaka');
});

test('intelligence filter matches the exact 5-level enum value', () => {
    const firsts = [
        makeEntry({ name: 'Dim', intelligence: 'blunt' }),
        makeEntry({ name: 'Mid', intelligence: 'average' }),
        makeEntry({ name: 'Sharp', intelligence: 'bookish' }),
    ];
    const lasts = [makeSurname()];
    const blunt = pickFresh(firsts, lasts, { intelligence: 'blunt' });
    const avg = pickFresh(firsts, lasts, { intelligence: 'average' });
    const book = pickFresh(firsts, lasts, { intelligence: 'bookish' });
    assert.equal(blunt.first_name, 'Dim');
    assert.equal(avg.first_name, 'Mid');
    assert.equal(book.first_name, 'Sharp');
});

test('fantasy race pairs with fantasy ethnicity (database invariant)', () => {
    const firsts = [
        makeEntry({ name: 'Lirien', language_ethnicity: 'fantasyElvish', race: 'elf' }),
    ];
    const lasts = [
        makeSurname({ name: 'Silverleaf', language_ethnicity: 'fantasyElvish', race: 'elf' }),
    ];
    const pick = pickFresh(firsts, lasts, { race: 'elf' });
    assert.ok(pick.language_ethnicity.startsWith('fantasy'));
});

test('multi-era entry matches each of its eras', () => {
    const eleanor = makeEntry({ name: 'Eleanor', era: ['victorian', 'midcentury'] });
    const beatrice = makeEntry({ name: 'Beatrice', era: ['ancient'] });
    const firsts = [eleanor, beatrice];
    const lasts = [makeSurname()];
    const victorian = pickFresh(firsts, lasts, { era: 'victorian' });
    const midcentury = pickFresh(firsts, lasts, { era: 'midcentury' });
    const ancient = pickFresh(firsts, lasts, { era: 'ancient' });
    assert.equal(victorian.first_name, 'Eleanor');
    assert.equal(midcentury.first_name, 'Eleanor');
    assert.equal(ancient.first_name, 'Beatrice');
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
        || (/[A-Za-z]/.test(n) && /\p{Script=Cyrillic}/u.test(n))), []); // look-alike letters
    const handles = data.first_names.filter(e => e.genre.includes('cyberpunk'));
    assert.equal(handles.length, 100);
    assert.deepEqual(handles.filter(e => e.language_ethnicity !== 'cyberpunkHandle').map(e => e.name), []);
    assert.deepEqual(inCulture(data.last_names, 'cyberpunkHandle'), []);
    const names = new Set(all.map(e => e.name));
    const gone = ['Unnamed', 'Trnsfer', 'Qkr', 'Korea', 'Feng Shui', 'Kalevala', 'Abominable Snowmen', 'Accuser', 'Palladium', 'Wild Hunt'];
    assert.deepEqual(gone.filter(n => names.has(n)), []);
    for (const list of [data.first_names, data.last_names]) {
        const keys = list.map(e => `${e.language_ethnicity}/${e.name}`);
        assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], 'no name twice in a culture');
    }
}

function checkSurnameGenders(data) {
    const cultures = ['slavicPolish', 'slavicRussian', 'slavicOther', 'icelandic', 'ukrainian', 'turkish', 'swedish', 'greek', 'nepalese', 'irishGaelic', 'baltic', 'azerbaijani'];
    const FEMALE = /(sk|ck)a$|dóttir$|dottir$|dotter$|ová$|ienė$|(ов|ев|ск)а$|(ов|ев)ая$|(ov|yev)a$|(idou|opoulou)$/u;
    // Not -шин: the Ukrainian -ишин stays the same for a woman.
    const MALE = /(sk|ck)i$|ński$|(ов|ев|ий)$|[^ш]ин$|(ov|ev|yov)$|ņš$|(opoulos|idis|ides)$|^(Ó|Mac) /u;
    const wrong = data.last_names.filter(e => cultures.includes(e.language_ethnicity)).filter(e =>
        (FEMALE.test(e.name) && e.gender !== 'female') || (MALE.test(e.name) && e.gender !== 'male')
        // -son follows the person's sex in Icelandic; in Swedish it is a family name of both sexes.
        || (/son$/.test(e.name) && e.gender !== (e.language_ethnicity === 'icelandic' ? 'male' : undefined)));
    assert.deepEqual(wrong.map(e => e.name), []);
    // Devi and Yadavani are women's surnames wherever they are filed; Hindi's others have no gender. Latin has its feminine forms.
    assert.deepEqual(data.last_names.filter(e => e.gender && !cultures.includes(e.language_ethnicity) && e.language_ethnicity !== 'latin').map(e => e.name).sort(), ['Devi', 'Yadavani']);
    // A missing name fails here. Greek -ou is used by both sexes; Irish women bear anglicised forms too.
    for (const [culture, name, gender] of [['greek', 'Nikolaou'], ['irishGaelic', "O'Byrne"], ['greek', 'Papadaki', 'female'],
        ['greek', 'Tassi', 'female'], ['greek', 'Zika', 'female'], ['greek', 'Mundis', 'male'], ['greek', 'Rubis', 'male'],
        ['hindi', 'Devi', 'female'], ['latin', 'Messalina', 'female'], ['baltic', 'Andrejeva', 'female'],
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
    assert.deepEqual(present(lasts, ['spanish/Flores', 'arabic/يناير', 'arabic/مارس', 'slavicPolish/Sz', 'hebrew/Sh', 'yoruba/Gh', 'chinese/Mawar', 'korean/남자',
        'latin/Gothicus', // a title
        // A woman's given name is no Yoruba surname.
        ...['Abosede', 'Ajoke', 'Atinuke', 'Aderonke', 'Adebimpe', 'Adejoke'].map(n => `yoruba/${n}`),
    ]), []);
    const culturesOf = name => data.first_names.filter(e => e.name === name).map(e => e.language_ethnicity);
    assert.deepEqual(culturesOf('Fiji'), [], 'a country');
    assert.deepEqual(culturesOf('Rosi Ni'), [], 'a broken form');
    assert.deepEqual(culturesOf('Ijeoma'), ['nigerian'], 'Igbo, not Yoruba');
    const first = (culture, name) => inCulture(data.first_names, culture).find(e => e.name === name);
    assert.deepEqual(data.first_names.filter(e => e.mythology && e.race !== 'mythical').map(e => e.name), []);
    assert.equal(first('mayan', 'Chaac').race, 'mythical');
    assert.equal(first('english', 'Noah').race, 'human');
    assert.equal(first('arabic', 'Noah').race, 'human');
    const dragons = data.first_names.filter(e => e.race === 'dragon').map(e => e.name);
    assert.deepEqual(['Smaug', 'Mushu', 'Maleficent', 'Saphira', 'Spike', 'Puff', 'Kingu', 'Samebito', 'Otohime', 'Lamia', 'Mishibijiw'].filter(n => dragons.includes(n)), []);
    assert.ok(dragons.length >= 30, `${dragons.length} dragons`);
    assert.deepEqual(first('nativeAmerican', 'Big Elk').era, ['victorian']);
    assert.deepEqual(first('nativeAmerican', 'Winona').era, ['contemporary']);
    // The meaning-based classes tag real names by what they mean, not by how they sound.
    assert.ok(first('hawaiian', 'Mahina').themes.includes('lunar'), 'Mahina means moon');
    assert.ok(first('english', 'Georgia').themes.includes('rustic'), 'Georgia means farmer');
    assert.ok(first('greek', 'Desdemona').genre.includes('horror'), 'Desdemona means ill-fated');
    assert.ok(!first('mongolian', 'Sarnai').themes.includes('lunar'), 'Sarnai means rose');
    assert.ok(!first('yoruba', 'Babatunde').genre.includes('horror'), 'Babatunde means the father has returned');
}

test('database invariants', () => {
    const data = JSON.parse(readFileSync(new URL('./data/name_database.tagged.json', import.meta.url), 'utf8'));
    for (const check of [checkNamesAndHandles, checkSurnameGenders, checkCultures, checkPinnedNames]) check(data);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
