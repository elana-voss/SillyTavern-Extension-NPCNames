// What the AI is sent, then and now: the instructions (assets/advertisement.txt filled from the data, as
// index.js does at load) and the tool's description, against a commit's. Line ends are read as LF on both sides.
//
// Run: node tools/ad-text-diff.mjs [--rev 60ffc03]
// Writes logs/work/ad-text-diff.txt (each differing part, then and now); prints one line per part.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { TOOL_DESCRIPTION, fillAdvertisement } from '../advertisement.js';
import { deriveEnumValues } from '../picker.js';
import { arg } from './cli.mjs';

const REPO = new URL('..', import.meta.url);
const REV = arg('rev', 'HEAD');
const OUT = new URL('logs/work/ad-text-diff.txt', REPO);
const lf = text => text.replace(/\r\n/g, '\n');
const git = path => lf(execFileSync('git', ['show', `${REV}:${path}`], { cwd: REPO, encoding: 'utf8' }));
const read = path => lf(readFileSync(new URL(path, REPO), 'utf8'));

// A commit's description, from its source: the string after TOOL_DESCRIPTION =, its tool name filled in.
function oldDescription() {
    const src = git('advertisement.js');
    const name = src.match(/TOOL_NAME = '([^']+)'/)?.[1];
    const m = src.match(/TOOL_DESCRIPTION =\s*(['`])((?:[^\\]|\\.)*?)\1;/s);
    return m[2].replaceAll("\\'", "'").replaceAll('${TOOL_NAME}', name);
}

const enumValues = deriveEnumValues(JSON.parse(read('data/name_database.tagged.json')).first_names);
const parts = [
    ['instructions', fillAdvertisement(git('assets/advertisement.txt'), enumValues), fillAdvertisement(read('assets/advertisement.txt'), enumValues)],
    ['tool description', oldDescription(), TOOL_DESCRIPTION],
];
mkdirSync(new URL('.', OUT), { recursive: true });
writeFileSync(OUT, parts.filter(([, a, b]) => a !== b).map(([what, a, b]) => `== ${what}, ${REV}:\n${a}\n== now:\n${b}\n`).join('\n'));
for (const [what, a, b] of parts) console.log(`${what}: ${a === b ? 'same' : 'DIFFERS'} (${a.length} then, ${b.length} now)`);
