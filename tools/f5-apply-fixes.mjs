// The one data change of the fix of milestone 5's names: names go where three readers of different
// vendors, or the review after them, placed them. Nothing is deleted: two entries of one name
// become one, and the name stands. See the plan's section "5 fix".
// Writes the change list to logs/work/f5-changes.txt.
//
// Run on the database as it stood before the fix (main's): node tools/f5-apply-fixes.mjs
// Its count asserts refuse a database already changed.
//
// Lines of tools/f5-fixes.txt, fields separated by " | "; list is first or last; no gender "-":
//   move     | list | culture | name | new list | new culture
//   sex      | list | culture | name | gender (where the name stands by then)
//   mythical | first | culture | name (where the name stands by then)
// The lines hold in their order.
import assert from 'node:assert/strict';
import { loadDb, readLines, saveWithChanges } from './db.mjs';
import { foldName } from './overused.mjs';

const db = loadDb();
assert.equal(db.first_names.length, 6864, 'first names');
assert.equal(db.last_names.length, 2618, 'surnames');

const lists = { first: db.first_names, last: db.last_names };
const ARRAY_FIELDS = ['era', 'role', 'genre', 'themes'];
const GENDERS = ['male', 'female', 'ambiguous'];
// Vietnamese tones tell names apart, as Ngô from Ngọ; elsewhere two spellings differing by accents are one name.
const same = (e, culture, name) => e.language_ethnicity === culture
    && (e.name === name || (culture !== 'vietnamese' && foldName(e.name) === foldName(name)));

function find(list, culture, name) {
    const entry = list.find(e => e.language_ethnicity === culture && e.name === name);
    assert.ok(entry, `no ${culture}/${name}`);
    return entry;
}

/** The entry as the other list has it. A surname keeps only its own gender; a first name always has one. */
function convert(entry, toList, culture) {
    const { name, gender, mythology, race, era, role, allure, commonness, genre, themes } = entry;
    const shared = { language_ethnicity: culture, mythology, race };
    const rest = { allure, commonness, genre, themes };
    if (toList === 'last') return { name, ...shared, era, role, ...rest };
    return { name, gender: gender ?? 'ambiguous', ...shared, age: entry.age ?? ['adult'], era, role,
        intelligence: entry.intelligence ?? 'average', ...rest };
}

/** The present entry stands, spelling and single values too; it takes the moved one's list tags, and a gender if it has only "ambiguous". */
function join(kept, moved) {
    for (const k of [...ARRAY_FIELDS, 'age']) {
        if (k in kept && k in moved) kept[k] = [...new Set([...kept[k], ...moved[k]])];
    }
    if (kept.gender === 'ambiguous' && moved.gender) kept.gender = moved.gender;
    if (moved.race === 'mythical') kept.race = 'mythical';
}

function setSex(list, culture, name, gender) {
    const entry = find(lists[list], culture, name);
    if ((entry.gender ?? '-') === gender) return false;
    if (gender === '-') {
        assert.equal(list, 'last', `${name}: a first name has a gender`);
        delete entry.gender;
    } else {
        assert.ok(GENDERS.includes(gender), `gender ${gender}`);
        if (!entry.gender) {
            const { name: n, ...others } = entry;
            for (const k of Object.keys(entry)) delete entry[k];
            Object.assign(entry, { name: n }, { gender }, others);
        }
        entry.gender = gender;
    }
    return true;
}

function setMythical(culture, name) {
    const entry = find(db.first_names, culture, name);
    if (entry.race === 'mythical') return false;
    assert.equal(entry.race, 'human', `${culture}/${name}`);
    entry.race = 'mythical';
    return true;
}

/** Returns the name as it stands after the move: a joined entry keeps its own spelling. */
function move(list, culture, name, toList, toCulture) {
    const from = lists[list];
    const entry = find(from, culture, name);
    from.splice(from.indexOf(entry), 1);
    const moved = list === toList ? { ...entry, language_ethnicity: toCulture } : convert(entry, toList, toCulture);
    const kept = lists[toList].find(e => same(e, toCulture, name));
    if (kept) {
        join(kept, moved);
        return kept.name;
    }
    lists[toList].push(moved);
    return name;
}

const count = { sex: 0, mythical: 0, move: 0, joined: 0 };
const changes = [];
const spelled = new Map(); // a name joined under another spelling is found under that one by the lines after it
const current = (list, culture, name) => spelled.get(`${list}|${culture}|${name}`) ?? name;
for (const [kind, ...f] of readLines('f5-fixes.txt')) {
    if (kind === 'sex') {
        const [list, culture, name, gender] = f;
        if (setSex(list, culture, current(list, culture, name), gender)) {
            changes.push(`sex | ${list} | ${culture} | ${name} | ${gender}`);
            count.sex++;
        }
    } else if (kind === 'mythical') {
        const [list, culture, name] = f;
        assert.equal(list, 'first', `${name}: mythical is for first names`);
        if (setMythical(culture, current(list, culture, name))) {
            changes.push(`mythical | ${culture} | ${name}`);
            count.mythical++;
        }
    } else if (kind === 'move') {
        const [list, culture, name, toList, toCulture] = f;
        const before = lists[toList].length;
        const now = move(list, culture, name, toList, toCulture);
        const joined = lists[toList].length === before - (list === toList ? 1 : 0);
        if (now !== name) spelled.set(`${toList}|${toCulture}|${name}`, now);
        changes.push(`${joined ? 'joined' : 'moved'} | ${list} | ${culture} | ${name} | ${toList} | ${toCulture}${now === name ? '' : ` | ${now}`}`);
        count.move++;
        if (joined) count.joined++;
    } else {
        assert.fail(`kind ${kind}`);
    }
}

const out = saveWithChanges(db, 'f5', changes);
console.log(`first names ${db.first_names.length}, surnames ${db.last_names.length}; ${JSON.stringify(count)}`);
console.log(out);
