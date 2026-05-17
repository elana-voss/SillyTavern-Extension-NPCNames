// Unit tests mirroring app/packages/cardwave_names/test/name_database_test.dart
// Run via: node test.js
//
// The picker is pure JS with no ST or DOM dependencies. Tests build small
// in-memory fixtures and verify filter / degradation / used-set / culture
// coherence / multi-era / intelligence-filter semantics.

import { filterFirstNames, pickAndMarkUsed, pickName, DROP_ORDER } from './picker.js';
import assert from 'node:assert/strict';

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
