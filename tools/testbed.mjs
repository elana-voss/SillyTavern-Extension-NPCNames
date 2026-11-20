// Runs this extension inside a real SillyTavern, with a fake AI and a headless
// browser, and checks what cannot be read from the code. No provider is called
// and no other SillyTavern is touched.
//
// Setup, once, under <tmp>/SillyTavern-Extension-NPCNames (or $NPCNAMES_TESTBED):
//   git clone --depth 1 --branch release https://github.com/SillyTavern/SillyTavern.git st
//   (in st)      npm ci --omit=dev
//   (in browser) npm i playwright; PLAYWRIGHT_BROWSERS_PATH=ms npx playwright install chromium-headless-shell
//
// Run: node tools/testbed.mjs [scenario ...]
// Live run (a provider is called, only when named): NANOGPT_API_KEY=... node tools/testbed.mjs live
// sends LIVE_ASKS to LIVE_MODEL through nano-gpt; the fake forwards, so the key stays out of SillyTavern.
// Writes every check and each recorded request to <root>/results.json and prints a summary.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_NAME as TOOL } from '../advertisement.js';
import { FINAL_TEXT, startFakeLlm } from './fake-llm.mjs';

const ROOT = process.env.NPCNAMES_TESTBED ?? join(tmpdir(), 'SillyTavern-Extension-NPCNames');
const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const EXT_NAME = 'SillyTavern-Extension-NPCNames';
const ST_PORT = 8123;
const ST_URL = `http://127.0.0.1:${ST_PORT}`;
const EXT_FILES = ['manifest.json', 'index.js', 'picker.js', 'advertisement.js', 'tool-calls.js', 'style.css', 'settings.html', 'assets', 'data'];
const AD_START = 'Before writing a reply in which a new character';
const AD_END = 'anyone already named in the chat.';
const OLDEST = 'OLDEST-MESSAGE-OF-THE-LONG-CHAT';
const USER_TEXT = 'A stranger walks in. Who is it?';

process.env.PLAYWRIGHT_BROWSERS_PATH = join(ROOT, 'browser', 'ms');
const { chromium } = createRequire(join(ROOT, 'browser', 'package.json'))('playwright');

const checks = [];
const recorded = {};
let scenarioName = '';

function check(what, ok, detail = '') {
    checks.push({ scenario: scenarioName, what, ok: !!ok, detail: String(detail).slice(0, 500) });
}

function installExtension(folder = EXT_NAME) {
    const target = join(ROOT, 'data', 'default-user', 'extensions', folder);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    for (const file of EXT_FILES) cpSync(join(REPO, file), join(target, file), { recursive: true });
}

async function startSillyTavern() {
    const log = [];
    const proc = spawn(process.execPath, [
        'server.js', '--port', String(ST_PORT), '--dataRoot', join(ROOT, 'data'),
        '--browserLaunchEnabled', 'false', '--listen', 'false',
    ], { cwd: join(ROOT, 'st'), windowsHide: true });
    proc.stdout.on('data', d => log.push(String(d)));
    proc.stderr.on('data', d => log.push(String(d)));
    for (let i = 0; i < 180; i++) {
        if (proc.exitCode !== null) throw new Error(`SillyTavern exited: ${log.join('').slice(-800)}`);
        const up = await fetch(ST_URL).then(r => r.ok).catch(() => false);
        if (up) return proc;
        await new Promise(r => setTimeout(r, 1000));
    }
    proc.kill();
    throw new Error(`SillyTavern did not start: ${log.join('').slice(-800)}`);
}

async function openPage(browser) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => {
        if (m.type() === 'error' && /NPCNames|NPC Name|interceptor|tool/i.test(m.text())) errors.push(m.text());
    });
    await page.goto(ST_URL);
    // The first start asks for a persona name; any popup is confirmed.
    for (let i = 0; i < 120; i++) {
        const ready = await page.evaluate(async () => !!document.getElementById('npc_names_status')
            && (await import('/script.js')).characters.length > 0
            && document.querySelector('.popup[open]') === null).catch(() => false);
        if (ready) break;
        const ok = page.locator('.popup[open] .popup-button-ok');
        if (await ok.count().catch(() => 0)) await ok.first().click({ timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(1000);
    }
    return { page, errors };
}

// Sets the connection the way the settings page would, without its connect
// button: the fake AI is reached through the sources' own proxy settings.
function configure(page, port, settings) {
    return page.evaluate(async ({ port, settings }) => {
        const { oai_settings } = await import('/scripts/openai.js');
        const script = await import('/script.js');
        Object.assign(oai_settings, {
            function_calling: true,
            stream_openai: false,
            squash_system_messages: false,
            openai_max_context: 16384,
            openai_max_tokens: 300,
            custom_url: `http://127.0.0.1:${port}/v1`,
            custom_model: 'fake-model',
            reverse_proxy: '',
            proxy_password: '',
            chat_completion_source: 'custom',
        }, settings);
        if (oai_settings.chat_completion_source === 'claude') {
            oai_settings.reverse_proxy = `http://127.0.0.1:${port}/v1`;
            oai_settings.proxy_password = 'fake';
            oai_settings.claude_model = 'claude-sonnet-4-5';
        }
        if (oai_settings.chat_completion_source === 'makersuite') {
            oai_settings.reverse_proxy = `http://127.0.0.1:${port}`;
            oai_settings.proxy_password = 'fake';
            oai_settings.google_model = 'gemini-2.5-flash';
        }
        if (oai_settings.reverse_proxy) {
            const { getStringHash } = await import('/scripts/utils.js');
            const { accountStorage } = await import('/scripts/util/AccountStorage.js');
            accountStorage.setItem(`Proxy_SkipConfirm_${getStringHash(oai_settings.reverse_proxy)}`, 'true');
        }
        $('#main_api').val('openai').trigger('change');
        await new Promise(r => setTimeout(r, 300));
        Object.assign(oai_settings, settings);
        script.setOnlineStatus('Valid');
        script.resultCheckStatus?.();
    }, { port, settings });
}

// A new chat with the first character, optionally filled with old messages.
function newChat(page, oldMessages = 0) {
    return page.evaluate(async ({ oldMessages, OLDEST }) => {
        const script = await import('/script.js');
        if (script.this_chid === undefined) {
            const id = script.characters.findIndex(c => c);
            await script.selectCharacterById(id);
        }
        await script.doNewChat();
        for (let i = 0; i < oldMessages; i++) {
            script.chat.push({
                name: i % 2 ? script.name2 : script.name1,
                is_user: i % 2 === 0,
                is_system: false,
                mes: `${i === 0 ? OLDEST : `old message ${i}`} ${'lorem ipsum dolor '.repeat(40)}`,
                extra: {},
                send_date: new Date().toISOString(),
            });
        }
    }, { oldMessages, OLDEST });
}

// Sends through the page's own send button, and waits until the chat settles.
async function send(page, fake, expected = FINAL_TEXT) {
    const before = fake.requests.length;
    await page.fill('#send_textarea', USER_TEXT);
    await page.click('#send_but', { timeout: 10000 });
    for (let i = 0; i < 90; i++) {
        const state = await page.evaluate(async () => {
            const { chat } = await import('/script.js');
            return {
                last: chat.at(-1)?.mes ?? '',
                busy: document.getElementById('send_but')?.classList.contains('displayNone'),
            };
        });
        if (state.last.includes(expected) && !state.busy) break;
        await page.waitForTimeout(500);
    }
    await page.waitForTimeout(300);
    return fake.requests.slice(before);
}

function chatState(page) {
    return page.evaluate(async () => {
        const { chat } = await import('/script.js');
        return chat.map(m => ({
            name: m.name, mes: m.mes, is_system: m.is_system, tools: m.extra?.tool_invocations ?? null,
        }));
    });
}

function pageState(page) {
    return page.evaluate(async () => {
        const s = await import('/script.js');
        return JSON.stringify({
            chid: s.this_chid, characters: s.characters.length, chat: s.chat.length, online: s.online_status, api: s.main_api,
            popups: [...document.querySelectorAll('.popup[open]')].map(p => p.textContent.trim().slice(0, 120)),
            send: document.getElementById('send_but')?.className, toast: document.querySelector('#toast-container')?.textContent,
        });
    }).catch(e => e.message);
}

function badge(page) {
    return page.evaluate(() => {
        const el = document.getElementById('npc_names_status');
        return { text: el.textContent, cls: el.className };
    });
}

// How each tool-call line in the chat is displayed.
function toolLineDisplays(page) {
    return page.$$eval('#chat .mes.toolCall', lines => lines.map(line => getComputedStyle(line).display));
}

// Adds a tool-call line the way SillyTavern's tool manager does.
function addToolLine(page, tool) {
    return page.evaluate(async tool => {
        const { chat, addOneMessage } = await import('/script.js');
        const message = {
            name: 'System',
            is_system: true,
            is_user: false,
            mes: `Tool calls: ${tool}`,
            send_date: new Date().toISOString(),
            extra: { isSmallSys: true, tool_invocations: [{ id: tool, displayName: tool, name: tool, parameters: '{}', result: 'ok' }] },
        };
        chat.push(message);
        addOneMessage(message);
        await new Promise(done => setTimeout(done, 100));
    }, tool);
}

function checkToolLines(displays, hidden, what) {
    check(what, displays.length > 0 && displays.every(d => (d === 'none') === hidden), JSON.stringify(displays));
}

// The first request of a turn: the instructions in full, once, macros replaced.
function checkAd(serialized, label) {
    const count = serialized.split(AD_START).length - 1;
    check(`${label}: instructions reach the request once`, count === 1, `count ${count}`);
    check(`${label}: instructions reach it whole`, serialized.includes(AD_END));
    check(`${label}: no macro left unreplaced`, !serialized.includes('{{user}}'));
}

function checkToolTurn(requests, chat, label) {
    check(`${label}: two requests, call then close`, requests.length === 2, `got ${requests.length}`);
    check(`${label}: the tool's result went back to the AI`, requests.length === 2
        && JSON.stringify(requests[1]).includes('first_name'), JSON.stringify(requests[1]?.body ?? '').slice(-300));
    const invoked = chat.flatMap(m => m.tools ?? []);
    check(`${label}: the tool ran`, invoked.some(t => t.name === TOOL && t.result.includes('first_name')),
        JSON.stringify(invoked).slice(0, 300));
    check(`${label}: the closing text reached the chat`, chat.at(-1)?.mes.includes(FINAL_TEXT), chat.at(-1)?.mes);
    check(`${label}: the instructions are not stored in the chat`,
        !chat.some(m => m.mes.includes(AD_START) || m.name === 'NPC Name Suggester'));
}

const LIVE_MODEL = 'z-ai/glm-5.3-flash';
const LIVE_URL = 'https://nano-gpt.com/api/v1/chat/completions';
// Several cultures and kinds of story, each a new chat with the test bed's card.
const LIVE_ASKS = [
    '(OOC: the story moves to a café in present-day London, a quiet romance.) The English barista, a woman in her thirties, tells me her name as she hands me my coffee.',
    '(OOC: the story moves to present-day Bangkok, a crime story.) The Thai police detective, a man of forty, shows his badge and says his name.',
    '(OOC: the story moves to a surf town on Oahu today, slice of life.) The Hawaiian woman who runs the board rental introduces herself.',
    '(OOC: the story moves to an office in present-day Madrid, a workplace drama.) My new Spanish colleague, a man in his twenties, shakes my hand and gives his name.',
    '(OOC: the story moves to present-day Lagos, a thriller.) The Nigerian taxi driver, a woman, tells me her name when I get in.',
];

// Sends a text through the page's send button and waits until the AI's reply settles.
async function sendLive(page, text) {
    await page.fill('#send_textarea', text);
    await page.click('#send_but', { timeout: 10000 });
    await page.waitForTimeout(2000);
    for (let i = 0; i < 180; i++) {
        const settled = await page.evaluate(async () => {
            const { chat } = await import('/script.js');
            const last = chat.at(-1);
            return !document.getElementById('send_but')?.classList.contains('displayNone')
                && !last?.is_user && !last?.extra?.tool_invocations;
        });
        if (settled) break;
        await page.waitForTimeout(1000);
    }
}

const SCENARIOS = {
    async live({ page, fake }) {
        // SillyTavern's default of 300 output tokens ends a thinking model's reply before its text.
        await configure(page, fake.port, { custom_model: LIVE_MODEL, openai_max_tokens: 4096 });
        recorded.live = [];
        for (const ask of LIVE_ASKS) {
            const before = fake.requests.length;
            await newChat(page);
            await sendLive(page, ask);
            const chat = await chatState(page);
            const invoked = chat.flatMap(m => m.tools ?? []).filter(t => t.name === TOOL);
            const result = invoked.map(t => { try { return JSON.parse(t.result); } catch { return t.result; } });
            const requests = fake.requests.slice(before);
            const reply = chat.at(-1)?.mes ?? '';
            recorded.live.push({
                ask, args: invoked.map(t => t.parameters), result, reply,
                input: requests.reduce((n, r) => n + (r.response?.usage?.prompt_tokens ?? 0), 0),
                output: requests.reduce((n, r) => n + (r.response?.usage?.completion_tokens ?? 0), 0),
                finish: requests.map(r => r.response?.choices?.[0]?.finish_reason ?? String(r.response).slice(0, 100)),
            });
            check(`live: the tool was called for "${ask.slice(0, 40)}"`, invoked.length > 0, reply.slice(0, 200));
            const first = result[0]?.first_name;
            check(`live: the returned name reached the reply for "${ask.slice(0, 40)}"`, first && reply.includes(first), `${first} | ${reply.slice(0, 200)}`);
        }
    },
    async openai({ page, fake }) {
        await configure(page, fake.port, {});
        await newChat(page);
        const requests = await send(page, fake);
        recorded.openai = requests;
        const first = requests[0]?.body;
        check('the tool is offered', first?.tools?.some(t => t.function?.name === TOOL));
        checkAd(JSON.stringify(first?.messages ?? ''), 'openai');
        const messages = first?.messages ?? [];
        const at = messages.findIndex(m => JSON.stringify(m).includes(AD_START));
        check('sent as a system message', messages[at]?.role === 'system', messages[at]?.role);
        check('right before the latest message', at === messages.length - 2
            && JSON.stringify(messages.at(-1)).includes(USER_TEXT), `${at} of ${messages.length}`);
        checkToolTurn(requests, await chatState(page), 'openai');
    },
    async streaming({ page, fake }) {
        await configure(page, fake.port, { stream_openai: true });
        await newChat(page);
        const requests = await send(page, fake);
        recorded.streaming = requests;
        checkAd(JSON.stringify(requests[0]?.body.messages ?? ''), 'streaming');
        checkToolTurn(requests, await chatState(page), 'streaming');
    },
    async longChat({ page, fake }) {
        await configure(page, fake.port, { openai_max_context: 8192 });
        await newChat(page, 400);
        const requests = await send(page, fake);
        recorded.longChat = requests.map(r => ({ path: r.path, roles: r.body.messages?.map(m => m.role) }));
        const messages = requests[0]?.body.messages ?? [];
        const text = JSON.stringify(messages);
        check('the chat is really cut: the oldest message is gone', text.length > 0 && !text.includes(OLDEST));
        check('the chat is really cut: recent messages stay', text.includes('old message 399'));
        checkAd(text, 'long chat');
        checkAd(JSON.stringify(requests[1]?.body.messages ?? ''), 'long chat, after the tool call');
        checkToolTurn(requests, (await chatState(page)).slice(-4), 'long chat');
    },
    async claude({ page, fake }) {
        await configure(page, fake.port, { chat_completion_source: 'claude', use_sysprompt: true });
        await newChat(page);
        const requests = await send(page, fake);
        recorded.claude = requests;
        const first = requests[0]?.body;
        check('claude: the fake was reached on its route', requests[0]?.path.endsWith('/messages'), requests[0]?.path);
        check('claude: the tool is offered', first?.tools?.some(t => t.name === TOOL));
        checkAd(JSON.stringify({ s: first?.system, m: first?.messages }), 'claude');
        checkToolTurn(requests, await chatState(page), 'claude');
        const roles = (first?.messages ?? []).map(m => m.role);
        check('claude: user and assistant alternate', roles.every((r, i) => i === 0 || r !== roles[i - 1]), roles.join());
    },
    async claudeLong({ page, fake }) {
        await configure(page, fake.port, { chat_completion_source: 'claude', use_sysprompt: true, openai_max_context: 8192 });
        await newChat(page, 400);
        const requests = await send(page, fake);
        recorded.claudeLong = requests.map(r => ({ path: r.path, roles: r.body.messages?.map(m => m.role) }));
        checkAd(JSON.stringify({ s: requests[0]?.body.system, m: requests[0]?.body.messages }), 'claude long');
    },
    async gemini({ page, fake }) {
        await configure(page, fake.port, { chat_completion_source: 'makersuite', use_sysprompt: true });
        await newChat(page);
        const requests = await send(page, fake);
        recorded.gemini = requests;
        const first = requests[0]?.body;
        check('gemini: the fake was reached on its route', requests[0]?.path.endsWith(':generateContent'), requests[0]?.path);
        checkAd(JSON.stringify({ s: first?.systemInstruction ?? first?.system_instruction, c: first?.contents }), 'gemini');
        checkToolTurn(requests, await chatState(page), 'gemini');
    },
    async geminiLong({ page, fake }) {
        await configure(page, fake.port, { chat_completion_source: 'makersuite', use_sysprompt: true, openai_max_context: 8192 });
        await newChat(page, 400);
        const requests = await send(page, fake);
        recorded.geminiLong = requests.map(r => ({ path: r.path, roles: r.body.contents?.map(m => m.role) }));
        const first = requests[0]?.body;
        checkAd(JSON.stringify({ s: first?.systemInstruction ?? first?.system_instruction, c: first?.contents }), 'gemini long');
    },
    async squashed({ page, fake }) {
        await configure(page, fake.port, { squash_system_messages: true });
        await newChat(page);
        const requests = await send(page, fake);
        recorded.squashed = requests;
        const messages = requests[0]?.body.messages ?? [];
        checkAd(JSON.stringify(messages), 'squashed');
        const at = messages.findIndex(m => JSON.stringify(m).includes(AD_START));
        check('squashed: only the instructions in their message', messages[at]?.content.startsWith(AD_START),
            messages[at]?.content.slice(0, 200));
        check('squashed: right before the latest message', at === messages.length - 2, `${at} of ${messages.length}`);
        checkToolTurn(requests, await chatState(page), 'squashed');
    },
    async statusBadge({ page, fake }) {
        await configure(page, fake.port, {});
        await page.evaluate(() => $('#openai_function_calling').prop('checked', true).trigger('input'));
        await page.waitForTimeout(300);
        let b = await badge(page);
        check('badge: active', b.text.includes('Extension active') && b.cls.includes('ok'), JSON.stringify(b));

        await page.evaluate(() => $('#openai_function_calling').prop('checked', false).trigger('input'));
        // ST reports this only through SETTINGS_UPDATED, after its 1 s save debounce and the save request.
        // A timeout is not handled here: the check below reports the badge as it stands.
        await page.waitForFunction(() => document.getElementById('npc_names_status')?.textContent.includes('does not support'), null, { timeout: 5000 }).catch(() => {});
        b = await badge(page);
        check('badge: function calling off says inactive', b.text.includes('does not support') && b.cls.includes('warn'), JSON.stringify(b));
        await newChat(page);
        let requests = await send(page, fake);
        check('function calling off: neither tool nor instructions',
            !requests[0]?.body.tools && !JSON.stringify(requests[0]?.body ?? '').includes(AD_START) && requests.length === 1, requests.length);

        await page.evaluate(() => $('#openai_function_calling').prop('checked', true).trigger('input'));
        await page.waitForTimeout(300);
        await page.evaluate(() => $('#npc_names_enabled').prop('checked', false).trigger('change'));
        await page.waitForTimeout(300);
        b = await badge(page);
        check('badge: turned off', b.text.includes('turned off') && !/ok|warn/.test(b.cls.replace('npc-names-status', '')), JSON.stringify(b));
        await newChat(page);
        requests = await send(page, fake);
        check('turned off: neither tool nor instructions',
            !JSON.stringify(requests[0]?.body ?? '').includes(TOOL), requests.length);

        await page.evaluate(() => $('#npc_names_enabled').prop('checked', true).trigger('change'));
        await page.waitForTimeout(300);
        b = await badge(page);
        check('badge: on again', b.text.includes('Extension active'), JSON.stringify(b));

        await page.evaluate(() => $('#main_api').val('textgenerationwebui').trigger('change'));
        await page.waitForTimeout(500);
        b = await badge(page);
        check('badge: another kind of backend says inactive', b.text.includes('does not support'), JSON.stringify(b));
        await page.evaluate(() => $('#main_api').val('openai').trigger('change'));
        await page.waitForTimeout(300);
    },
    async oldUsedList({ page, fake }) {
        await configure(page, fake.port, {});
        await newChat(page);
        await page.evaluate(async () => {
            const { chat_metadata } = await import('/script.js');
            chat_metadata.npcNames = { usedFirst: ['Noah', 'Gone-From-The-Data'], usedLast: ['Berg'] };
        });
        const requests = await send(page, fake);
        const chat = await chatState(page);
        checkToolTurn(requests, chat, 'old used list');
        const stored = await page.evaluate(async () => (await import('/script.js')).chat_metadata.npcNames);
        check('old used list: stored again as culture and name', stored.usedFirst.length > 1 && stored.usedLast.length > 0
            && [...stored.usedFirst, ...stored.usedLast].every(k => k.includes('/')), JSON.stringify(stored));
    },
    async group({ page, fake }) {
        await configure(page, fake.port, {});
        const id = await page.evaluate(async () => {
            const script = await import('/script.js');
            const { openGroupById } = await import('/scripts/group-chats.js');
            const chatName = `testbed-${Date.now()}`;
            const response = await fetch('/api/groups/create', {
                method: 'POST',
                headers: script.getRequestHeaders(),
                body: JSON.stringify({
                    name: 'Testbed group', members: [script.characters.find(c => c).avatar], avatar_url: '',
                    allow_self_responses: false, hideMutedSprites: false, activation_strategy: 0, generation_mode: 0,
                    disabled_members: [], fav: false, chat_id: chatName, chats: [chatName], auto_mode_delay: 5,
                }),
            });
            const group = await response.json();
            await script.getCharacters();
            await openGroupById(group.id);
            return group.id;
        });
        try {
            const requests = await send(page, fake);
            recorded.group = requests;
            const messages = requests[0]?.body.messages ?? [];
            const ad = messages.find(m => JSON.stringify(m).includes(AD_START));
            check('group: instructions carry no name in front', String(ad?.content).startsWith(AD_START), String(ad?.content).slice(0, 60));
            checkAd(JSON.stringify(messages), 'group');
            const chat = await chatState(page);
            check('group: the tool ran', chat.flatMap(m => m.tools ?? []).some(t => t.name === TOOL), chat.length);
            check('group: the instructions are not stored in the chat', !chat.some(m => m.mes.includes(AD_START)));
            checkToolLines(await toolLineDisplays(page), true, 'group: the tool line is hidden');
        } finally {
            await page.evaluate(async id => {
                const { getRequestHeaders } = await import('/script.js');
                await fetch('/api/groups/delete', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ id }) });
            }, id);
        }
    },
    async toolLine({ page, fake }) {
        await configure(page, fake.port, {});
        await newChat(page);
        const requests = await send(page, fake);
        checkToolTurn(requests, await chatState(page), 'tool line');
        const setShown = on => page.evaluate(v => $('#npc_names_show_tool_calls').prop('checked', v).trigger('change'), on);
        checkToolLines(await toolLineDisplays(page), true, 'tool line: hidden by default');
        await setShown(true);
        checkToolLines(await toolLineDisplays(page), false, 'tool line: shown when turned on');
        await setShown(false);
        checkToolLines(await toolLineDisplays(page), true, 'tool line: hidden when turned off');
        await page.evaluate(async () => (await import('/script.js')).reloadCurrentChat());
        checkToolLines(await toolLineDisplays(page), true, 'tool line: still hidden after the chat is reloaded');

        const checkLines = async (expected, what) => {
            const displays = await toolLineDisplays(page);
            check(what, JSON.stringify(displays) === JSON.stringify(expected), JSON.stringify(displays));
        };
        await addToolLine(page, 'another_tool');
        await checkLines(['none', 'flex'], 'tool line: another tool\'s line stays visible');
        // Moves the AI's reply below the other tool's line, through the message's own edit buttons.
        await page.evaluate(async () => {
            const { chat } = await import('/script.js');
            const reply = chat.findLastIndex(m => !m.is_user && !m.is_system);
            $(`.mes[mesid="${reply}"] .mes_edit`).trigger('click');
            await new Promise(done => setTimeout(done, 300));
            $(`.mes[mesid="${reply}"] .mes_edit_down`).trigger('click');
            await new Promise(done => setTimeout(done, 300));
            $('.mes_edit_cancel').trigger('click');
        });
        await addToolLine(page, 'another_tool');
        await checkLines(['none', 'flex', 'flex'], 'tool line: right lines hidden after a message is moved');
        await page.evaluate(async () => {
            const { chat, deleteMessage } = await import('/script.js');
            await deleteMessage(chat.findIndex(m => m.is_user));
        });
        await addToolLine(page, 'another_tool');
        await checkLines(['none', 'flex', 'flex', 'flex'], 'tool line: right lines hidden after a message is deleted');
    },
    // The name data cannot load: the tool is off, but its old lines stay hidden.
    async toolLineNoData({ page }) {
        const second = await page.context().browser().newPage();
        try {
            await second.route('**/name_database.tagged.json*', route => route.abort());
            await second.goto(ST_URL);
            await second.waitForFunction(async () => (await import('/script.js')).characters.length > 0, null, { timeout: 60000 });
            await addToolLine(second, TOOL);
            const hidden = await second.waitForFunction(
                () => [...document.querySelectorAll('#chat .mes.toolCall')].some(l => getComputedStyle(l).display === 'none'),
                null, { timeout: 15000 },
            ).then(() => true).catch(() => false);
            check('tool line: hidden even when the name data cannot load', hidden, await toolLineDisplays(second).then(JSON.stringify));
        } finally {
            await second.close();
        }
    },
    // Last: the second copy takes over the page's interceptor.
    async wrongFolder({ page, errors }) {
        const folder = 'NPCNames-wrong';
        installExtension(folder);
        try {
            const toast = await page.evaluate(async folder => {
                await import(`/scripts/extensions/third-party/${folder}/index.js`);
                for (let i = 0; i < 20 && !document.querySelector('#toast-container .toast-error'); i++) {
                    await new Promise(done => setTimeout(done, 250));
                }
                return document.querySelector('#toast-container .toast-error')?.textContent ?? '';
            }, folder);
            check('wrong folder: an error stays on screen', toast.includes('wrong folder'), toast);
            const settings = await page.locator('#npc_names_enabled').count();
            check('wrong folder: no second settings block', settings === 1, settings);
            const expected = errors.findIndex(e => e.includes('wrong folder'));
            if (expected >= 0) errors.splice(expected, 1);
        } finally {
            rmSync(join(ROOT, 'data', 'default-user', 'extensions', folder), { recursive: true, force: true });
        }
    },
};

async function main() {
    if (!existsSync(join(ROOT, 'st', 'server.js'))) throw new Error(`No SillyTavern under ${ROOT}: see this file's head`);
    const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(SCENARIOS).filter(n => n !== 'live');
    if (names.includes('live') && !process.env.NANOGPT_API_KEY) throw new Error('The live run needs NANOGPT_API_KEY');
    installExtension();
    const fake = await startFakeLlm(0, names.includes('live')
        ? { url: LIVE_URL, key: process.env.NANOGPT_API_KEY, model: LIVE_MODEL } : null);
    const st = await startSillyTavern();
    const browser = await chromium.launch({ headless: true });
    const { page, errors } = await openPage(browser);
    // The status badge scenario turns the extension off and on; a run can end before SillyTavern's
    // debounce saves the on, and the next run would start with it off.
    await page.evaluate(() => $('#npc_names_enabled').prop('checked', true).trigger('change'));
    try {
        for (const name of names) {
            scenarioName = name;
            fake.requests.length = 0;
            try {
                await SCENARIOS[name]({ page, fake, errors });
            } catch (e) {
                check('scenario ran to its end', false, `${e.message.slice(0, 200)} ${await pageState(page)}`);
            }
            await page.screenshot({ path: join(ROOT, `shot-${name}.png`) }).catch(() => {});
        }
        check('no page error from the extension or a tool', errors.length === 0, errors.join(' | '));
    } finally {
        await browser.close();
        st.kill();
        await fake.close();
    }
    const failed = checks.filter(c => !c.ok);
    writeFileSync(join(ROOT, 'results.json'), JSON.stringify({ checks, recorded }, null, 1));
    console.log(`${checks.length - failed.length}/${checks.length} checks passed; details in results.json`);
    for (const c of failed.slice(0, 9)) console.log(`FAIL ${c.scenario}: ${c.what}: ${c.detail.slice(0, 160)}`);
    process.exit(failed.length > 0 ? 1 : 0);
}

await main();
