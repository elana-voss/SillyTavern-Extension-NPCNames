# SillyTavern NPC Name Suggester

A SillyTavern extension that gives your AI a tool to pick curated NPC
names from a frozen tagged database (4342 first names + 1950 surnames,
sourced from 8 public-domain and open-source corpora). When the AI is
about to introduce a new character, it calls `suggest_npc_name` with
optional filters (gender, culture, era, genre, etc.) and gets back a
single first+last name pair plus its classification tags (role, era,
allure, etc.) to colour the narration.

Names already used in the current chat are tracked in chat metadata and
never repeat within a single story.

## Install

**System-wide only.** Drop or clone this folder at:

```
<SillyTavern>/public/scripts/extensions/third-party/SillyTavern-Extension-NPCNames/
```

The per-user install location (`data/<user>/extensions/`) is NOT
supported: this extension uses relative imports of ST's internal modules
that only resolve from the system-wide path.

After installing, restart SillyTavern.

## Setup walkthrough

Three SillyTavern panels need to be configured. All three are needed before
the extension's status badge flips green.

### 1. Enable function calling

In the AI Response Configuration panel (slider icon), tick **"Enable
function calling"**. The blue check next to the label means the current
model is on ST's supported-tool-calling list.

![Enable function calling](docs/1_sillytavern_get_name_enable_function_calling.png)

### 2. Pick a tool-aware Prompt Post-Processing preset

In the API panel, set **Prompt Post-Processing** to either *"Semi-strict
(alternating roles; with tools)"* or *"Strict (user first, alternating
roles; with tools)"*. Anything labelled "no tools" disables tool calling
even if step 1 is on.

![Pick a tool-aware preset](docs/2_sillytavern_get_name_preset_enable_use_tools.png)

### 3. Enable the extension

Open the Extensions panel, find **"NPC Name Suggester"**, and tick
*"Enable suggest_npc_name tool"*. The status badge should show
*"Tool calling supported. Extension active."* in green.

![Enable the extension](docs/3_sillytavern_get_name_enable_extension.png)

## Smoke test

Drop one of these into a chat:

- *"Introduce a new NPC walking into the scene right now."*
- *"A grizzled noir-coded private investigator from the 1920s walks into the bar. Introduce him."*
- *"Three peasant farmhands in a medieval village stop the party at the gate — name them."*

If you turn on **"Log tool calls to console (debug)"** in the extension's
settings, each call shows up in the browser devtools console. See
[docs/4_sillytavern_console_example.txt](docs/4_sillytavern_console_example.txt)
for a real-trace excerpt of the tool registration + a call + the picker's
JSON response.

## Backend requirement

Only works with AI backends that support **tool calling**: OpenAI, Claude,
Mistral, Google Gemini, Groq, DeepSeek, Cohere, MiniMax, Moonshot (Kimi),
xAI Grok, OpenRouter, NanoGPT, and OpenAI-compatible custom endpoints.

On backends without tool-calling (e.g. text-completion endpoints like
KoboldCpp in legacy mode), the extension silently does nothing. The
settings panel shows a live status badge telling you whether the current
backend supports the tool.

## Settings

Open the Extensions panel and find "NPC Name Suggester":
- **Enable suggest_npc_name tool** — registers / unregisters the tool with
  the AI. Default on.
- **Log tool calls to console (debug)** — prints each picker call and
  result to the browser devtools console. Default off.

## Dataset origin

The name database was built and classified by the **cardwave** project — see
https://github.com/elana-voss/cardwave for the dataset's full generation
pipeline (corpus loaders, multi-stage merge, LLM-based classification).
This extension is a standalone JavaScript port that consumes the frozen
JSON and adds nothing of its own to the data.

## License

LGPL-2.1-or-later. See [LICENSE](LICENSE).

The bundled dataset includes content from hackerb9/ssa-baby-names
(LGPL-2.1), which is why the extension itself is LGPL-2.1-or-later. See
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for full corpus
attribution.
