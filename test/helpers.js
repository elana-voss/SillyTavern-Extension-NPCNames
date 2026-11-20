// Shared by the test files: entries with defaults, a fixed random source and the project's root.
import { pickName } from '../picker.js';

export const ROOT = new URL('../', import.meta.url);

export function makeEntry(overrides = {}) {
    return {
        name: 'Test', gender: 'female', language_ethnicity: 'english', mythology: null, race: 'human', age: ['adult'],
        era: ['contemporary'], role: ['neutral'], intelligence: 'average', allure: 'pleasant', commonness: 'uncommon',
        genre: ['sliceOfLife'], themes: [], ...overrides,
    };
}

export function makeSurname(overrides = {}) {
    return {
        name: 'Generic', language_ethnicity: 'english', mythology: null, race: 'human', era: ['contemporary'],
        role: ['neutral'], allure: 'pleasant', commonness: 'uncommon', genre: ['sliceOfLife'], themes: [], ...overrides,
    };
}

// Deterministic RNG for predictable test outcomes.
export const fixedRng = (max) => 0;
export const pickFresh = (firsts, lasts, filters = {}) => pickName(firsts, lasts, filters, new Set(), new Set(), fixedRng);
