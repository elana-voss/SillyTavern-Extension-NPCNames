// Run via: node test.js

import { deriveEnumValues, filterFirstNames, pickAndMarkUsed, pickName, DROP_ORDER } from './picker.js';
import { injectBeforeLatest } from './advertisement.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
        name: 'Test',
        gender: 'female',
        language_ethnicity: 'english',
        mythology: null,
        race: 'human',
        age: ['adult'],
        era: ['contemporary'],
        role: ['neutral'],
        intelligence: 'average',
        allure: 'pleasant',
        commonness: 'uncommon',
        genre: ['sliceOfLife'],
        themes: [],
        ...overrides,
    };
}

function makeSurname(overrides = {}) {
    return {
        name: 'Generic',
        language_ethnicity: 'english',
        mythology: null,
        race: 'human',
        era: ['contemporary'],
        role: ['neutral'],
        allure: 'pleasant',
        commonness: 'uncommon',
        genre: ['sliceOfLife'],
        themes: [],
        ...overrides,
    };
}

// Deterministic RNG for predictable test outcomes.
const fixedRng = (max) => 0;

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
    const pick = pickName(
        firsts,
        lasts,
        { gender: 'female', language_ethnicity: 'japanese' },
        new Set(),
        new Set(),
        fixedRng,
    );
    assert.equal(pick.gender, 'female');
    assert.equal(pick.language_ethnicity, 'japanese');
    assert.ok(['Hana', 'Yuki'].includes(pick.first_name));
    assert.equal(pick.relaxed_filters, undefined);
});

test('drops filters in priority order when intersection is empty', () => {
    const mira = makeEntry({
        name: 'Mira',
        gender: 'female',
        language_ethnicity: 'slavicRussian',
        role: ['villain'],
        intelligence: 'bookish',
        allure: 'pretty',
        genre: ['horror', 'sliceOfLife'],
        themes: ['regal'],
    });
    const firsts = [mira];
    const lasts = [makeSurname({ name: 'Volkov', language_ethnicity: 'slavicRussian' })];
    const pick = pickName(
        firsts,
        lasts,
        {
            gender: 'female',
            language_ethnicity: 'slavicRussian',
            age: 'child',
            era: 'nineteenTwenties',
            role: 'villain',
            intelligence: 'bookish',
            themes: ['celestial'],
        },
        new Set(),
        new Set(),
        fixedRng,
    );
    assert.equal(pick.first_name, 'Mira');
    assert.ok(pick.relaxed_filters.includes('themes'));
    assert.ok(pick.relaxed_filters.includes('age'));
    assert.ok(pick.relaxed_filters.includes('era'));
    // themes drops before age per DROP_ORDER.
    assert.ok(
        pick.relaxed_filters.indexOf('themes') < pick.relaxed_filters.indexOf('age'),
    );
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
    const third = pickName(
        firsts,
        lasts,
        { language_ethnicity: 'japanese' },
        usedFirst,
        usedLast,
        fixedRng,
    );
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
    const pick = pickName(firsts, lasts, {}, new Set(), new Set(), fixedRng);
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
    const blunt = pickName(firsts, lasts, { intelligence: 'blunt' }, new Set(), new Set(), fixedRng);
    const avg = pickName(firsts, lasts, { intelligence: 'average' }, new Set(), new Set(), fixedRng);
    const book = pickName(firsts, lasts, { intelligence: 'bookish' }, new Set(), new Set(), fixedRng);
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
    const pick = pickName(firsts, lasts, { race: 'elf' }, new Set(), new Set(), fixedRng);
    assert.ok(pick.language_ethnicity.startsWith('fantasy'));
});

test('multi-era entry matches each of its eras', () => {
    const eleanor = makeEntry({ name: 'Eleanor', era: ['victorian', 'midcentury'] });
    const beatrice = makeEntry({ name: 'Beatrice', era: ['ancient'] });
    const firsts = [eleanor, beatrice];
    const lasts = [makeSurname()];
    const victorian = pickName(firsts, lasts, { era: 'victorian' }, new Set(), new Set(), fixedRng);
    const midcentury = pickName(firsts, lasts, { era: 'midcentury' }, new Set(), new Set(), fixedRng);
    const ancient = pickName(firsts, lasts, { era: 'ancient' }, new Set(), new Set(), fixedRng);
    assert.equal(victorian.first_name, 'Eleanor');
    assert.equal(midcentury.first_name, 'Eleanor');
    assert.equal(ancient.first_name, 'Beatrice');
});

test('culture without surnames returns the first name alone', () => {
    const firsts = [makeEntry({ name: 'Paarthurnax', language_ethnicity: 'fantasyDragon', race: 'dragon' })];
    const lasts = [makeSurname({ name: 'Smith', language_ethnicity: 'english' })];
    const pick = pickName(firsts, lasts, {}, new Set(), new Set(), fixedRng);
    assert.equal(pick.first_name, 'Paarthurnax');
    assert.equal('last_name' in pick, false);
    assert.equal('last_name_role' in pick, false);
});

test('a god gets no surname even when its culture has surnames', () => {
    const firsts = [makeEntry({ name: 'Shiva', language_ethnicity: 'hindi', race: 'mythical' })];
    const lasts = [makeSurname({ name: 'Sharma', language_ethnicity: 'hindi' })];
    const pick = pickName(firsts, lasts, {}, new Set(), new Set(), fixedRng);
    assert.equal(pick.first_name, 'Shiva');
    assert.equal('last_name' in pick, false);
});

test('surname never repeats the first name', () => {
    const firsts = [makeEntry({ name: 'Agus' })];
    const lasts = [makeSurname({ name: 'Agus' }), makeSurname({ name: 'Wijaya' })];
    const pick = pickName(firsts, lasts, {}, new Set(), new Set(), fixedRng);
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
    const pick = pickName(
        firsts,
        lasts,
        { gender: 'nonbinary', language_ethnicity: 'japanese', commonness: 'rare' },
        new Set(),
        new Set(),
        fixedRng,
    );
    assert.equal(pick.first_name, 'Hana');
    assert.deepEqual(pick.relaxed_filters, ['gender']);
});

test('tolerates themes sent as a single string and null filters', () => {
    const firsts = [makeEntry({ name: 'Rex', themes: ['regal'] }), makeEntry({ name: 'Bob' })];
    const pick = pickName(
        firsts,
        [makeSurname()],
        { themes: 'regal', gender: null, language_ethnicity: 'nope' },
        new Set(),
        new Set(),
        fixedRng,
    );
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

test('database holds no malformed names', () => {
    const data = JSON.parse(readFileSync(new URL('./data/name_database.tagged.json', import.meta.url), 'utf8'));
    const bad = [...data.first_names, ...data.last_names].map(e => e.name).filter(n =>
        /^\p{Ll}/u.test(n)                                  // uncapitalised
        || /[/()]|\.$/.test(n)                              // "A/B", "Anu (2)", initials
        || (/[A-Za-z]/.test(n) && /\p{Script=Cyrillic}/u.test(n))); // look-alike letters
    assert.deepEqual(bad, []);
});

test('database files gods, handles and non-names as the readings say', () => {
    const data = JSON.parse(readFileSync(new URL('./data/name_database.tagged.json', import.meta.url), 'utf8'));
    const byName = new Map(data.first_names.map(e => [e.name, e]));
    assert.deepEqual(data.first_names.filter(e => e.mythology && e.race !== 'mythical').map(e => e.name), []);
    assert.equal(byName.get('Chaac').race, 'mythical');
    assert.equal(byName.get('Noah').race, 'human');
    const handles = data.first_names.filter(e => e.genre.includes('cyberpunk'));
    assert.equal(handles.length, 100);
    assert.deepEqual(handles.filter(e => e.language_ethnicity !== 'cyberpunkHandle').map(e => e.name), []);
    assert.deepEqual(data.last_names.filter(e => e.language_ethnicity === 'cyberpunkHandle'), []);
    const names = new Set([...data.first_names, ...data.last_names].map(e => e.name));
    const gone = ['Unnamed', 'Trnsfer', 'Qkr', 'Korea', 'Feng Shui', 'Kalevala', 'Abominable Snowmen', 'Accuser', 'Palladium', 'Wild Hunt'];
    assert.deepEqual(gone.filter(n => names.has(n)), []);
});

test('a surname of the other gender is never given; one without a gender is', () => {
    const firsts = [makeEntry({ name: 'Piotr', gender: 'male' })];
    const kowalska = makeSurname({ name: 'Kowalska', gender: 'female' });
    const wojcik = makeSurname({ name: 'Wojcik' });
    assert.equal(pickName(firsts, [kowalska, wojcik], {}, new Set(), new Set(), fixedRng).last_name, 'Wojcik');
    assert.equal('last_name' in pickName(firsts, [kowalska], {}, new Set(), new Set(), fixedRng), false);
});

test('an ambiguous character takes a surname of any gender', () => {
    const firsts = [makeEntry({ name: 'Sasha', gender: 'ambiguous' })];
    const lasts = [makeSurname({ name: 'Kowalska', gender: 'female' })];
    assert.equal(pickName(firsts, lasts, {}, new Set(), new Set(), fixedRng).last_name, 'Kowalska');
});

test('database genders surnames by their endings and keeps no men with women\'s surnames', () => {
    const data = JSON.parse(readFileSync(new URL('./data/name_database.tagged.json', import.meta.url), 'utf8'));
    const cultures = ['slavicPolish', 'slavicRussian', 'slavicOther', 'icelandic', 'ukrainian', 'turkish', 'swedish', 'greek', 'nepalese', 'irishGaelic', 'baltic', 'azerbaijani'];
    const FEMALE = /(sk|ck)a$|dóttir$|dottir$|dotter$|ová$|ienė$|(ов|ев|ск)а$|(ов|ев)ая$|(ov|yev)a$|(idou|opoulou)$/u;
    // Not -шин: the Ukrainian -ишин stays the same for a woman.
    const MALE = /(sk|ck)i$|ński$|(ов|ев|ий)$|[^ш]ин$|(ov|ev|yov)$|ņš$|(opoulos|idis|ides)$|^(Ó|Mac) /u;
    const wrong = data.last_names.filter(e => cultures.includes(e.language_ethnicity)).filter(e =>
        (FEMALE.test(e.name) && e.gender !== 'female') || (MALE.test(e.name) && e.gender !== 'male')
        // -son follows the person's sex in Icelandic; in Swedish it is a family name of both sexes.
        || (/son$/.test(e.name) && e.gender !== (e.language_ethnicity === 'icelandic' ? 'male' : undefined)));
    assert.deepEqual(wrong.map(e => e.name), []);
    assert.deepEqual(data.last_names.filter(e => e.gender && !cultures.includes(e.language_ethnicity)).map(e => e.name), []);
    const genderOf = (culture, name) => data.last_names.find(e => e.language_ethnicity === culture && e.name === name).gender;
    assert.equal(genderOf('greek', 'Nikolaou'), undefined, 'Greek -ou is used by both sexes');
    assert.equal(genderOf('irishGaelic', "O'Byrne"), undefined, 'women bear anglicised forms too');
    for (const name of ['Papadaki', 'Tassi', 'Zika']) assert.equal(genderOf('greek', name), 'female', name);
    for (const name of ['Mundis', 'Rubis']) assert.equal(genderOf('greek', name), 'male', name);
    assert.equal(genderOf('nepalese', 'Devi'), 'female');
    const firsts = [makeEntry({ name: 'Piotr', gender: 'male', language_ethnicity: 'slavicPolish' })];
    for (let i = 0; i < 40; i++) {
        const pick = pickName(firsts, data.last_names, {}, new Set(), new Set(), max => i % max);
        assert.doesNotMatch(pick.last_name, /(sk|ck)a$/);
    }
});

test('database holds no non-surnames, no Mongolian surnames, no surnames as Chinese first names', () => {
    const data = JSON.parse(readFileSync(new URL('./data/name_database.tagged.json', import.meta.url), 'utf8'));
    const lasts = new Set(data.last_names.map(e => `${e.language_ethnicity}/${e.name}`));
    const firsts = new Set(data.first_names.map(e => `${e.language_ethnicity}/${e.name}`));
    const gone = ['arabic/يناير', 'arabic/مارس', 'slavicPolish/Sz', 'hebrew/Sh', 'yoruba/Gh', 'chinese/Mawar', 'korean/남자'];
    assert.deepEqual(gone.filter(n => lasts.has(n)), []);
    assert.deepEqual(data.last_names.filter(e => e.language_ethnicity === 'mongolian').map(e => e.name), []);
    assert.ok(lasts.has('korean/남궁') && lasts.has('hebrew/דוד'), 'real surnames in both lists stay');
    assert.ok(!firsts.has('chinese/Zhang') && firsts.has('chinese/Hao'));
});

test('database files Ghanaian, Ethiopian and misfiled names under their cultures; gods and disagreed names stay', () => {
    const data = JSON.parse(readFileSync(new URL('./data/name_database.tagged.json', import.meta.url), 'utf8'));
    const of = (list, culture) => list.filter(e => e.language_ethnicity === culture);
    const firstIn = (culture, name) => of(data.first_names, culture).find(e => e.name === name);
    const lastIn = (culture, name) => of(data.last_names, culture).find(e => e.name === name);
    for (const [gone, label, first, last] of [['yoruba', 'ghanaian', 28, 44], ['swahili', 'ethiopian', 53, 48]]) {
        assert.equal(of(data.first_names, gone).length + of(data.last_names, gone).length, 0, gone);
        assert.equal(of(data.first_names, label).length, first, label);
        assert.equal(of(data.last_names, label).length, last, label);
    }
    assert.ok(firstIn('ghanaian', 'Alhassan') && lastIn('ghanaian', 'Abubakar'), 'an origin elsewhere holds no name back');
    const offered = deriveEnumValues(data.first_names).language_ethnicity;
    assert.ok(offered.includes('ghanaian') && offered.includes('ethiopian') && !offered.includes('yoruba'));
    assert.equal(offered.includes('danish'), false);

    // Latin: Romanians out, its gods in place with their mythology; a disagreement stays.
    assert.ok(firstIn('romanian', 'Alexandru') && lastIn('romanian', 'Ciobanu') && firstIn('romanian', 'Luminita'));
    assert.deepEqual(of(data.first_names, 'latin').filter(e => e.race !== 'mythical').map(e => e.name), ['Artiom']);
    assert.equal(of(data.first_names, 'latin').filter(e => e.race === 'mythical' && e.mythology).length, 12);
    assert.equal(of(data.last_names, 'latin').length, 0);

    // Danes and Norse gods stay under scandinavian; Fijian first names the second reader kept stay.
    assert.ok(firstIn('scandinavian', 'Søren') && lastIn('scandinavian', 'Østergaard'));
    assert.equal(of(data.first_names, 'scandinavian').filter(e => e.race === 'mythical').length, 14);
    assert.ok(firstIn('maori', 'Viliame') && lastIn('fijian', 'Tabua'));

    // A surname's gender moves with it; a first name made a surname keeps no first name's fields.
    assert.equal(lastIn('baltic', 'Žukauskienė').gender, 'female');
    assert.equal(lastIn('azerbaijani', 'Ahmadov').gender, 'male');
    assert.equal(lastIn('slavicOther', 'Hristova').gender, 'female');
    assert.equal(lastIn('greek', 'Makarezos').gender, 'male');
    assert.equal(firstIn('finnish', 'Hristova'), undefined);
    const ferreira = lastIn('portuguese', 'Ferreira');
    assert.ok(ferreira && !firstIn('french', 'Ferreira'));
    assert.deepEqual(['age', 'intelligence', 'gender'].filter(k => k in ferreira), []);
    assert.ok(firstIn('hungarian', 'András') && lastIn('albanian', 'Hoxhaj') && firstIn('azerbaijani', 'Yusif'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
