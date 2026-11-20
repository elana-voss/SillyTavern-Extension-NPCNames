// A fake AI for the test bed: speaks the OpenAI, Claude and Gemini wire formats,
// records every request and answers with a call to the extension's tool, then
// with a closing text once the tool's result comes back. Costs no provider tokens, unless a
// live run gives it a provider to forward OpenAI requests to (startFakeLlm's `forward`).
import { createServer } from 'node:http';
import { TOOL_NAME as TOOL } from '../advertisement.js';
export const FINAL_TEXT = 'FAKE-FINAL: the stranger gives a name.';
const TOOL_ARGS = { gender: 'female', language_ethnicity: 'japanese' };

const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };

function openAi(body, res) {
    const offered = (body.tools ?? []).some(t => t.function?.name === TOOL);
    const wantsTool = offered && body.messages.at(-1)?.role !== 'tool';
    const message = wantsTool
        ? {
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: TOOL, arguments: JSON.stringify(TOOL_ARGS) },
            }],
        }
        : { role: 'assistant', content: FINAL_TEXT };
    const finish = wantsTool ? 'tool_calls' : 'stop';
    if (!body.stream) {
        return sendJson(res, {
            id: 'fake',
            object: 'chat.completion',
            model: body.model,
            choices: [{ index: 0, message, finish_reason: finish }],
            usage,
        });
    }
    const delta = wantsTool
        ? { role: 'assistant', tool_calls: message.tool_calls.map((c, index) => ({ index, ...c })) }
        : message;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const choice of [{ index: 0, delta }, { index: 0, delta: {}, finish_reason: finish }]) {
        res.write(`data: ${JSON.stringify({ id: 'fake', object: 'chat.completion.chunk', model: body.model, choices: [choice] })}\n\n`);
    }
    res.end('data: [DONE]\n\n');
}

function claude(body, res) {
    const offered = (body.tools ?? []).some(t => t.name === TOOL);
    const last = body.messages.at(-1)?.content;
    const hasResult = Array.isArray(last) && last.some(p => p.type === 'tool_result');
    const wantsTool = offered && !hasResult;
    sendJson(res, {
        id: 'fake',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: wantsTool
            ? [{ type: 'tool_use', id: 'toolu_1', name: TOOL, input: TOOL_ARGS }]
            : [{ type: 'text', text: FINAL_TEXT }],
        stop_reason: wantsTool ? 'tool_use' : 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
    });
}

function gemini(body, res) {
    const declared = (body.tools ?? []).flatMap(t => t.function_declarations ?? t.functionDeclarations ?? []);
    const offered = declared.some(d => d.name === TOOL);
    const parts = body.contents.at(-1)?.parts ?? [];
    const hasResult = parts.some(p => p.functionResponse ?? p.function_response);
    const wantsTool = offered && !hasResult;
    sendJson(res, {
        candidates: [{
            index: 0,
            finishReason: 'STOP',
            content: {
                role: 'model',
                parts: wantsTool
                    ? [{ functionCall: { name: TOOL, args: TOOL_ARGS } }]
                    : [{ text: FINAL_TEXT }],
            },
        }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    });
}

function sendJson(res, value) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

// Starts the server. `requests` holds every POST received, newest last.
// A live run: the request goes to the provider, its model set; the key is added here, so it never
// reaches SillyTavern's files. The answer is recorded beside the request; a refusal is logged.
async function forwardOpenAi(body, res, forward, entry) {
    let r;
    try {
        r = await fetch(forward.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${forward.key}` },
            body: JSON.stringify({ ...body, model: forward.model, stream: false }),
        });
    } catch (e) {
        console.error(`live: the provider is unreachable, ${e.message}`);
        entry.response = e.message;
        res.writeHead(502);
        return res.end(e.message);
    }
    const text = await r.text();
    if (!r.ok) console.error(`live: the provider refused, ${r.status} ${text.slice(0, 300)}`);
    try {
        entry.response = JSON.parse(text);
    } catch {
        entry.response = text;
    }
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(text);
}

/** `forward` ({ url, key, model }) sends OpenAI requests to a real provider instead of faking them. */
export async function startFakeLlm(port = 0, forward = null) {
    const requests = [];
    const server = createServer(async (req, res) => {
        const path = req.url.split('?')[0];
        if (req.method === 'GET' && path.endsWith('/models')) {
            return sendJson(res, { object: 'list', data: [{ id: 'fake-model', object: 'model' }] });
        }
        if (req.method !== 'POST') {
            res.writeHead(404);
            return res.end();
        }
        const body = JSON.parse(await readBody(req));
        const entry = { path, body };
        requests.push(entry);
        if (path.endsWith('/chat/completions')) return forward ? forwardOpenAi(body, res, forward, entry) : openAi(body, res);
        if (path.endsWith('/messages')) return claude(body, res);
        if (path.endsWith(':generateContent')) return gemini(body, res);
        res.writeHead(404);
        res.end();
    });
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    return {
        requests,
        port: server.address().port,
        close: () => new Promise(resolve => server.close(resolve)),
    };
}
