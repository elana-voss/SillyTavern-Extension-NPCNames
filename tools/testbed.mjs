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
// Writes every check and each recorded request to <root>/results.json and prints a summary.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINAL_TEXT, TOOL, startFakeLlm } from './fake-llm.mjs';

const ROOT = process.env.NPCNAMES_TESTBED ?? join(tmpdir(), 'SillyTavern-Extension-NPCNames');
const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const EXT_NAME = 'SillyTavern-Extension-NPCNames';
const ST_PORT = 8123;
const ST_URL = `http://127.0.0.1:${ST_PORT}`;
const EXT_FILES = ['manifest.json', 'index.js', 'picker.js', 'advertisement.js', 'style.css', 'settings.html', 'assets', 'data'];
const AD_START = 'Use the `suggest_npc_name` tool';
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

function installExtension() {
    const target = join(ROOT, 'data', 'default-user', 'extensions', EXT_NAME);
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

const SCENARIOS = {
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
        await page.waitForTimeout(300);
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
};

async function main() {
    if (!existsSync(join(ROOT, 'st', 'server.js'))) throw new Error(`No SillyTavern under ${ROOT}: see this file's head`);
    const names = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(SCENARIOS);
    installExtension();
    const fake = await startFakeLlm();
    const st = await startSillyTavern();
    const browser = await chromium.launch({ headless: true });
    const { page, errors } = await openPage(browser);
    try {
        for (const name of names) {
            scenarioName = name;
            fake.requests.length = 0;
            try {
                await SCENARIOS[name]({ page, fake });
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
