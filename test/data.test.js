// The name database's invariants and the documents that describe it.
import { test } from 'node:test';
import { deriveEnumValues, pickName } from '../picker.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foldName } from '../tools/overused.mjs';
import { parseLines } from '../tools/db.mjs';
import { makeEntry, ROOT } from './helpers.js';

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
    const read = file => readFileSync(new URL(file, ROOT), 'utf8');
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
        'hungarian/András', 'azerbaijani/Yusif', 'chinese/Hao', 'maori/Rosi',
        'nigerian/Yakubu', 'nigerian/Bilkisu', 'nigerian/Amina', // Hausa, not Yoruba
    ]), []);
    assert.deepEqual(present(firsts, ['maori/Viliame', 'finnish/Hristova', 'french/Ferreira', 'chinese/Zhang',
        'yoruba/Yakubu', 'yoruba/Bilkisu', 'yoruba/Amina', 'persian/Pixodarus', // Pixodarus is a Carian
        // One man's fame stays out.
        ...['Sitting Bull', 'Crazy Horse', 'Rain-in-the-Face', 'Black Elk', 'Cornplanter', 'Poundmaker', 'Cornstalk'].map(n => `nativeAmerican/${n}`),
    ]), []);
    assert.deepEqual(missing(lasts, ['ghanaian/Abubakar', 'romanian/Ciobanu', 'scandinavian/Østergaard', 'fijian/Tabua', 'fijian/Rabici',
        'portuguese/Ferreira', 'albanian/Hoxhaj',
        'korean/남궁', 'hebrew/דוד', // real surnames in both lists stay
    ]), []);
    // spanish/Flores is a surname since 10b (Mexico's 10th, three readers); 10c's readers (two of three) moved the first name english/Flores to spanish.
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
    for (const [c, n] of [['english', 'Desdemona'], ['english', 'Carrie'], ['romanian', 'Vlad']]) assert.ok(first(c, n).genre.includes('horror'), n);
    assert.ok(!first('mongolian', 'Sarnai').themes.includes('lunar'), 'Sarnai means rose');
    assert.ok(!first('yoruba', 'Babatunde').genre.includes('horror'), 'Babatunde means the father has returned');
}

// The fix of milestone 5's names places them and deletes none: each stands somewhere, accents aside.
function checkNoNameLost(data) {
    const read = file => readFileSync(new URL(`./tools/${file}`, ROOT), 'utf8').split(/\r?\n/).map(l => l.split(' | '));
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
        const lines = parseLines(readFileSync(new URL(`./tools/${file}`, ROOT), 'utf8'));
        assert.deepEqual(lines.map(l => l.slice(0, 4).join('/')).filter(k => !held.has(k)), [], file);
    }
}

test('database invariants', () => {
    const data = JSON.parse(readFileSync(new URL('./data/name_database.tagged.json', ROOT), 'utf8'));
    for (const check of [checkNamesAndHandles, checkSurnameGenders, checkCultures, checkPinnedNames, checkSurnamesReachable, checkDocuments, checkNoNameLost, checkCommonNames]) check(data);
});
