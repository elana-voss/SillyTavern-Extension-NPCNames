// Milestone 9's live check: does the AI give a new character's name before the user's character
// could learn it, and does a name appear that the tool did not return?
//
// Each chat is sent to nano-gpt as SillyTavern builds it: the card as the system prompt, the
// greeting and history, the instructions as a system message right before the latest message
// (advertisement.js), the tool offered with its description and parameters. A tool call is answered
// by the extension's own picker and the model is asked again, as SillyTavern does. Each chat has two
// user turns: a stranger appears (in the classroom, the user's character watches one), then the user's character
// asks the stranger's name. As in SillyTavern, {{user}} is the scene's user name and the culture list is filled.
// Old wording: the instructions, tool description and tool answer at commit 7c1f440 (milestone 12's start; milestone 9
// compared 8e11ce9).
//
// Run: node tools/m9-name-timing.mjs [--models a,b] [--scenes a,b] [--wordings old,new] [--runs 2] [--spend 600000] [--tag t]
// Key: env NANOGPT_API_KEY. Requests go through the data tools' client (nanogpt.mjs): every answer is stored
// under logs/work/m9/cache, so a rerun costs nothing; its log is logs/work/m9/llm.log.
// Writes logs/work/m9/results.json and excerpts.txt (results-<tag>.json, excerpts-<tag>.txt with --tag); prints a summary.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { TOOL_DESCRIPTION, TOOL_NAME, buildToolParameters, fillAdvertisement, toolAnswer } from '../advertisement.js';
import { deriveEnumValues, pickName } from '../picker.js';
import { arg } from './cli.mjs';
import { client } from './nanogpt.mjs';

const REPO = new URL('..', import.meta.url);
const OUT = new URL('logs/work/m9/', REPO);
const CACHE = new URL('cache/', OUT);
const OLD_COMMIT = '7c1f440';

const MODELS = arg('models', 'z-ai/glm-5.3-flash,deepseek/deepseek-v4.1-flash,mistralai/mistral-small-4-119b-2603,google/gemma-4-31b-it').split(',');
const WORDINGS = arg('wordings', 'old,new').split(',');
const RUNS = Number(arg('runs', 2));
const SPEND = Number(arg('spend', 600000));
const TAG = arg('tag', '') ? `-${arg('tag', '')}` : '';

const git = path => execFileSync('git', ['show', `${OLD_COMMIT}:${path}`], { cwd: REPO, encoding: 'utf8' });
const oldDescription = git('advertisement.js').match(/TOOL_DESCRIPTION =\s*`([^`]*)`/)[1].replaceAll('${TOOL_NAME}', TOOL_NAME);
const db = JSON.parse(readFileSync(new URL('data/name_database.tagged.json', REPO), 'utf8'));
const enumValues = deriveEnumValues(db.first_names);
const parameters = buildToolParameters(enumValues);
const wording = {
    old: { ad: git('assets/advertisement.txt'), description: oldDescription, answer: pick => JSON.stringify(pick) },
    new: { ad: readFileSync(new URL('assets/advertisement.txt', REPO), 'utf8'), description: TOOL_DESCRIPTION, answer: toolAnswer },
};

// A long chat: twenty earlier messages of routine station life among the crew already named.
const chores = ['the coolant loop in bay three', 'a cracked seal on the ore hopper', 'the hydroponics timers',
    'a jammed cargo crane', 'drift in the docking lasers', 'the water reclaimer filters', 'a flickering hull sensor',
    'the backup reactor test', 'a stuck pressure door on deck two', 'the comms relay alignment'];
const longHistory = chores.flatMap((chore, i) => [
    { role: 'user', content: `Rhee checks the duty board and heads off to deal with ${chore}. "Anything else I should know before I start, Captain?"` },
    { role: 'assistant', content: `Captain Ines Varga glances up from her tablet. "Just ${chore}, and log it when you're done." Dr. Tomas Okafor, passing with a tray of samples, adds that the last shift left the tools scattered. Pell, the engineer, mutters from under a console that ${chore} has failed ${i + 2} times this month. The work takes most of the shift: panels off, parts swapped, readings checked twice, and the station hums on around you while the ore freighters drift past the viewport.` },
]);

const SCENES = {
    // The user's report of milestone 12: the narrator describes a few classmates, then the user's character watches one.
    classroom: {
        user: 'Sam',
        known: ['Sam', 'Hale', 'Westbrook', 'High', 'Hey', 'Nice'],
        system: 'You are the narrator of an interactive story set at Westbrook High, an ordinary high school in a small American town today. You describe the world and play every character except Sam, the user\'s character, a bored seventeen-year-old student. Write in second person, two or three short paragraphs per reply.',
        greeting: 'Third period, history. Mr Hale drones on about trade routes while the clock above the door crawls toward noon. You slump in your seat and look around. A boy in a varsity jacket sleeps with his cheek on his textbook. Two girls by the window pass a folded note back and forth. Near the back sits someone you have never seen before: a girl with purple hair, headphones around her neck, sketching in the margin of her notebook.',
        history: [],
        turn1: 'I stare at the girl with purple hair. I\'ve never seen her before. What is she doing?',
        turn2: 'The bell rings. I walk over to her desk. "Hey, I\'m Sam. Nice drawing. What\'s your name?"',
    },
    tavern: {
        user: 'Corin',
        known: ['Corin', 'Varnholt', 'Hilde', 'Drowned', 'Lantern'],
        system: 'You are the narrator of an interactive story set in Varnholt, a rain-soaked river town in a low-fantasy kingdom. You describe the world and play every character except Corin, the user\'s character, a travelling sellsword. Write in second person, two or three short paragraphs per reply.',
        greeting: 'Rain hammers the shutters of the Drowned Lantern. Hilde, the innkeeper, slides a mug of dark ale across the bar to you without being asked. The common room is half empty: a few bargemen at dice, a dog asleep by the fire.',
        history: [],
        turn1: 'I sit at the end of the bar with my back to the wall, nurse my ale and watch the door. I don\'t talk to anyone. Describe who comes in next.',
        turn2: 'I catch the newcomer\'s eye and raise my mug. "Join me? I\'m Corin. And you are?"',
    },
    train: {
        user: 'Lucía',
        known: ['Lucía', 'Madrid', 'Lisboa', 'Lusitania', 'Ramón'],
        system: 'Eres el narrador de una historia interactiva en la España de hoy. Describes el mundo e interpretas a todos los personajes excepto a Lucía, el personaje del usuario, una arquitecta de treinta años. Escribe en segunda persona y en español, dos o tres párrafos breves por respuesta.',
        greeting: 'El tren nocturno Lusitania sale de Madrid hacia Lisboa con diez minutos de retraso. Ramón, el revisor, te ha marcado el billete y se ha ido por el pasillo. Tienes el compartimento para ti sola, de momento.',
        history: [],
        turn1: 'Me siento junto a la ventanilla y miro la noche. No hablo con nadie. Describe a la persona que entra en el compartimento.',
        turn2: 'Le ofrezco una galleta. —Soy Lucía. ¿Y usted cómo se llama?',
    },
    station: {
        user: 'Rhee',
        known: ['Rhee', 'Ines', 'Varga', 'Tomas', 'Okafor', 'Pell', 'Kestrel', 'Captain'],
        system: 'You are the narrator of an interactive story aboard Kestrel Station, an ore-mining outpost in the asteroid belt. You describe the world and play every character except Rhee, the user\'s character, a maintenance tech. Write in second person, two or three short paragraphs per reply.',
        greeting: 'Kestrel Station wakes for the morning shift. Captain Ines Varga is already on the command deck; Dr. Tomas Okafor runs the infirmary; Pell keeps the engines alive.',
        history: longHistory,
        turn1: 'A supply shuttle docks. I wait at the airlock without a word and watch who steps off. Describe the new arrival.',
        turn2: 'I step forward and offer a hand. "Welcome aboard. I\'m Rhee. What do we call you?"',
    },
};
const SCENE_NAMES = arg('scenes', Object.keys(SCENES).join(',')).split(',');

// mulberry32: the picks repeat on a rerun, so the stored answers are found again.
function seeded(text) {
    let a = createHash('sha256').update(text).digest().readUInt32LE(0);
    return max => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return (((t ^ (t >>> 14)) >>> 0) % max);
    };
}

// The stored answers keep their names: the key is { body, run }, its hash cut to 24 characters.
const llm = client(CACHE, { name: h => h.slice(0, 24) });
async function complete(body, run) {
    const json = await llm.send(body, { key: { body, run }, tag: `run ${run}`, allow: () => llm.stats.input <= SPEND });
    if (!json) throw new Error(llm.stats.input > SPEND ? `spend limit ${SPEND} reached` : 'no answer after five tries');
    return json;
}

// One user turn as SillyTavern runs it: instructions before the latest message, tool calls answered
// and the model asked again, at most three rounds.
async function userTurn(chat, messages, text) {
    messages.push({ role: 'user', content: text });
    const turn = { text: '', calls: [] };
    for (let round = 0; round < 3; round++) {
        // A tool call and its answer are one chat item in SillyTavern, so the instructions go before both.
        let at = messages.length - 1;
        while (messages[at].role === 'tool') at--;
        const ad = fillAdvertisement(chat.words.ad, enumValues).replaceAll('{{user}}', chat.scene.user);
        const sent = [...messages.slice(0, at), { role: 'system', content: ad }, ...messages.slice(at)];
        const body = {
            model: chat.model, messages: [{ role: 'system', content: chat.scene.system }, ...sent],
            tools: [{ type: 'function', function: { name: TOOL_NAME, description: chat.words.description, parameters } }],
            tool_choice: 'auto', temperature: 1, max_tokens: 1500,
        };
        const json = await complete(body, chat.run);
        chat.input += json.usage?.prompt_tokens ?? 0;
        const msg = json.choices?.[0]?.message ?? {};
        if (msg.content) turn.text += `${msg.content}\n`;
        if (!msg.tool_calls?.length) break;
        messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
        for (const call of msg.tool_calls) {
            let filters = {};
            try { filters = JSON.parse(call.function.arguments || '{}'); } catch { /* a malformed call gets no filters, as SillyTavern passes it on */ }
            const pick = pickName(db.first_names, db.last_names, filters, chat.usedFirst, chat.usedLast, chat.rng);
            turn.calls.push({ filters, first: pick.first_name, last: pick.last_name ?? '' });
            messages.push({ role: 'tool', tool_call_id: call.id, content: chat.words.answer(pick) });
        }
    }
    messages.push({ role: 'assistant', content: turn.text.trim() });
    return turn;
}

const COMMON = new Set(('I You He She It We They The A An And But Or If When Then There This That His Her Their Your My Our ' +
    'What Who Why How Where Yes No Not Just Join Welcome Anything Describe Le La El Los Las Un Una Y Soy Usted Tú Él Ella ' +
    'Es Está Se Te Lo Por Para Con Sin En De Del Al Qué Quién Cómo Sí Buenas Gracias Perdón Señor Señora Don Doña ' +
    'Captain Doctor Dr Mr Mrs Ms Miss Sir Lady Lord Station God').split(' '));

// Capitalised words that are not sentence-initial, not known, not common; and every part of a tool's name.
function namesIn(text, known, toolParts) {
    const found = new Set();
    for (const m of text.matchAll(/(^|[^\p{L}])(\p{Lu}[\p{Ll}'’-]+)/gu)) {
        const word = m[2];
        const before = text.slice(0, m.index + m[1].length).trimEnd();
        const initial = before === '' || /[.!?¿¡"«»“”*—–:\n-]$/.test(before);
        if (toolParts.has(word) || (!initial && !COMMON.has(word) && !known.has(word))) found.add(word);
    }
    return [...found];
}

function sentenceWith(text, word) {
    const at = text.indexOf(word);
    return text.slice(Math.max(0, at - 90), at + word.length + 60).replace(/\s+/g, ' ');
}

// Whether a word's first occurrence stands inside a quotation, so someone says it.
function said(text, word) {
    const before = text.slice(0, text.indexOf(word));
    const count = re => (before.match(re) ?? []).length;
    return count(/"/g) % 2 === 1 || count(/[“«]/g) > count(/[”»]/g) || /(^|\n)\s*—[^\n]*$/.test(before);
}

async function runChat(model, scene, words, run) {
    const chat = {
        model, scene: SCENES[scene], words: wording[words], run, input: 0,
        usedFirst: new Set(), usedLast: new Set(), rng: seeded(`${model}|${scene}|${words}|${run}`),
    };
    const messages = [...chat.scene.history, { role: 'assistant', content: chat.scene.greeting }];
    const t1 = await userTurn(chat, messages, chat.scene.turn1);
    const t2 = await userTurn(chat, messages, chat.scene.turn2);
    const toolParts = new Set([...t1.calls, ...t2.calls].flatMap(c => `${c.first} ${c.last}`.split(/\s+/)).filter(Boolean));
    const known = new Set(chat.scene.known);
    const early = namesIn(t1.text, known, toolParts);
    const reveal = namesIn(t2.text, known, toolParts);
    return {
        model, scene, words, run, input: chat.input,
        calls1: t1.calls, calls2: t2.calls, early, unsaid: early.filter(w => !said(t1.text, w)), invented: [...early, ...reveal].filter(w => !toolParts.has(w)),
        revealFromTool: reveal.some(w => toolParts.has(w)), text1: t1.text, text2: t2.text,
    };
}

const results = [];
// One model's chats run in sequence; the models run side by side, three requests at a time.
await Promise.all(MODELS.map(async model => {
    for (const scene of SCENE_NAMES) for (const words of WORDINGS) for (let run = 1; run <= RUNS; run++) {
        try { results.push(await runChat(model, scene, words, run)); } catch (e) {
            console.error(`${model} ${scene} ${words} ${run}: ${e.message}`);
            results.push({ model, scene, words, run, error: e.message });
        }
    }
}));

writeFileSync(new URL(`results${TAG}.json`, OUT), JSON.stringify(results, null, 1));
const excerpts = results.filter(r => !r.error).map(r => [
    `== ${r.model} ${r.scene} ${r.words} run ${r.run}; tool: ${r.calls1.map(c => `${c.first} ${c.last}`).join(', ') || '-'} | ${r.calls2.map(c => `${c.first} ${c.last}`).join(', ') || '-'}`,
    ...r.early.map(w => `  turn 1 ${r.unsaid.includes(w) ? 'UNSAID' : 'said'} ${w}: ...${sentenceWith(r.text1, w)}...`),
    ...r.invented.filter(w => !r.early.includes(w)).map(w => `  turn 2 invented ${w}: ...${sentenceWith(r.text2, w)}...`),
].join('\n'));
writeFileSync(new URL(`excerpts${TAG}.txt`, OUT), excerpts.join('\n'));

const errors = results.filter(r => r.error).length;
console.log(`chats ${results.length}, failed ${errors}, input tokens this run ${llm.stats.input}, all chats ${results.reduce((s, r) => s + (r.input ?? 0), 0)}`);
for (const model of MODELS) for (const words of WORDINGS) {
    const rows = results.filter(r => r.model === model && r.words === words && !r.error);
    const count = f => rows.filter(f).length;
    console.log(`${model} ${words}: chats ${rows.length}, early-name chats ${count(r => r.early.length)}, unsaid ${count(r => r.unsaid.length)}, invented-name chats ${count(r => r.invented.length)}, tool in turn 1 ${count(r => r.calls1.length)}, tool by reveal ${count(r => r.calls1.length + r.calls2.length)}`);
}
