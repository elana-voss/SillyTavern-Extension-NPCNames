// The nano-gpt client of milestone 10's readers: every answer is stored under the caller's folder,
// keyed by the request, so a rerun costs nothing. One request a second; a 429 waits 65 s.
// Key: env NANOGPT_API_KEY, never written anywhere. A refusal is logged with its status and text.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const API = 'https://nano-gpt.com/api/v1/chat/completions';
const USAGE = 'https://nano-gpt.com/api/subscription/v1/usage';
const GAP_MS = 1000;
const TIMEOUT_MS = 300000;

/** A client storing answers in `dir` (a URL ending in /) and logging to `dir`/../llm.log. */
export function client(dir, { fetchFn = fetch, wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
    mkdirSync(dir, { recursive: true });
    const log = new URL('../llm.log', dir);
    const stats = { calls: 0, cached: 0, fail: 0, input: 0, output: 0 };
    let last = 0, slot = Promise.resolve();
    const throttle = () => (slot = slot.then(async () => {
        const w = last + GAP_MS - Date.now();
        if (w > 0) await wait(w);
        last = Date.now();
    }));
    const note = line => appendFileSync(log, `${new Date().toISOString()} ${line}\n`);

    /** The model's text, or null after five failed tries. */
    async function ask(model, prompt, { max_tokens = 8000, temperature = 0, tag = '', extra = {} } = {}) {
        const body = { model, messages: [{ role: 'user', content: prompt }], max_tokens, temperature, ...extra };
        const file = new URL(createHash('sha256').update(JSON.stringify(body)).digest('hex') + '.json', dir);
        if (existsSync(file)) { stats.cached++; return JSON.parse(readFileSync(file, 'utf8')).text; }
        for (let i = 0; i < 5; i++) {
            await throttle();
            try {
                const r = await fetchFn(API, {
                    method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.NANOGPT_API_KEY },
                    body: JSON.stringify(body),
                });
                if (r.status === 429) { note(`LIMIT 429 ${model} ${tag}`); await wait(65000); continue; }
                if (!r.ok) {
                    note(`FAIL ${r.status} ${model} ${tag} ${(await r.text()).slice(0, 300).replace(/\s+/g, ' ')}`);
                    stats.fail++; await wait(5000); continue;
                }
                const j = await r.json();
                const text = j.choices?.[0]?.message?.content ?? '';
                if (!text.trim()) {
                    // A reader that spends its tokens on reasoning answers nothing; the input is paid all the same.
                    stats.input += j.usage?.prompt_tokens ?? 0;
                    note(`EMPTY ${model} ${tag} finish=${j.choices?.[0]?.finish_reason} in=${j.usage?.prompt_tokens} out=${j.usage?.completion_tokens}`);
                    stats.fail++; continue;
                }
                stats.calls++; stats.input += j.usage?.prompt_tokens ?? 0; stats.output += j.usage?.completion_tokens ?? 0;
                writeFileSync(file, JSON.stringify({ model, tag, usage: j.usage, text }));
                note(`OK ${model} ${tag} in=${j.usage?.prompt_tokens}`);
                return text;
            } catch (e) { note(`FAIL ${e.name} ${model} ${tag}`); stats.fail++; await wait(5000); }
        }
        note(`GAVEUP ${model} ${tag}`);
        return null;
    }

    /** Input tokens of every stored answer, the spend so far. */
    const spent = () => readdirSync(dir).reduce((n, f) =>
        n + (JSON.parse(readFileSync(new URL(f, dir), 'utf8')).usage?.prompt_tokens ?? 0), 0);

    return { ask, spent, stats };
}

/** Runs fn over items with n workers; results in item order. */
export async function pool(items, n, fn) {
    let i = 0;
    const out = [];
    await Promise.all(Array.from({ length: n }, async () => {
        while (i < items.length) { const j = i++; out[j] = await fn(items[j], j); }
    }));
    return out;
}

/** The subscription's weekly input tokens used, or null when the server refuses. */
export async function weeklyUsed() {
    const r = await fetch(USAGE, { headers: { Authorization: 'Bearer ' + process.env.NANOGPT_API_KEY } });
    if (!r.ok) { console.error(`usage refused: ${r.status} ${(await r.text()).slice(0, 200)}`); return null; }
    return (await r.json()).weeklyInputTokens?.used ?? null;
}
