# SillyTavern NPC Name Suggester

A SillyTavern extension that gives your AI a tool to pick curated NPC names from a frozen tagged database.

When the AI is about to introduce a new character, it calls `suggest_npc_name` with optional filters to colour the narration: gender, culture, mythology, race, age, era, role, intelligence, allure, commonness, genre, and themes.

It gets back a single first and last name pair plus its classification tags: the first name's age, era, role, intelligence, allure, commonness, genre, themes (and mythology when applicable); and the surname's role, allure, commonness, genre, and themes.

Names already used in the current chat are tracked in chat metadata and never repeat within a single story.

## Install

In SillyTavern's **Extensions** panel, click **"Install Extension"** at the top, paste this URL, and confirm:

```
https://github.com/elana-voss/SillyTavern-Extension-NPCNames
```

## Setup walkthrough

After install, three panels need configuration. The screenshot file numbers below match the step numbers. Work through them in order.

### Step 1: Enable function calling

![Step 1: Enable function calling](docs/1_sillytavern_get_name_enable_function_calling.png)

In the **Chat Completion Presets** panel, tick **"Enable function calling"**. The blue check icon next to the label means the current model is on ST's supported-tool-calling list.

### Step 2: Pick a tool-aware Prompt Post-Processing preset

![Step 2: Tool-aware Prompt Post-Processing](docs/2_sillytavern_get_name_preset_enable_use_tools.png)

In the **API** panel, set **Prompt Post-Processing** to either *"Semi-strict (alternating roles; with tools)"* or *"Strict (user first, alternating roles; with tools)"*. Anything labelled "no tools" disables tool calling even if Step 1 is on.

### Step 3: Enable the extension

![Step 3: Enable the extension](docs/3_sillytavern_get_name_enable_extension.png)

Open the **Extensions** panel, find **"NPC Name Suggester"**, and tick *"Enable suggest_npc_name tool"*. The status badge should read *"Tool calling supported. Extension active."* in green.

## Smoke test

Drop one of these into a chat:

- *"Introduce a new NPC walking into the scene right now."*
- *"A grizzled noir-coded private investigator from the 1920s walks into the bar. Introduce him."*
- *"Three peasant farmhands in a medieval village stop the party at the gate. Name them."*

If you turn on **"Log tool calls to console (debug)"** in the extension's settings, each call shows up in the browser devtools console. See [docs/4_sillytavern_console_example.txt](docs/4_sillytavern_console_example.txt) for a real-trace excerpt of the tool registration, a call, and the picker's JSON response.

## Backend requirement

Only works with AI backends that support **tool calling**: OpenAI, Claude, Mistral, Google Gemini, Groq, DeepSeek, Cohere, MiniMax, Moonshot (Kimi), xAI Grok, OpenRouter, NanoGPT, and OpenAI-compatible custom endpoints.

On backends without tool-calling (e.g. text-completion endpoints like KoboldCpp in legacy mode), the extension silently does nothing. The settings panel shows a live status badge telling you whether the current backend supports the tool.

## Settings

Open the Extensions panel and find "NPC Name Suggester":

- **Enable suggest_npc_name tool**: registers or unregisters the tool with the AI. Default on.
- **Log tool calls to console (debug)**: prints each picker call and result to the browser devtools console. Default off.

While enabled, the extension also injects a system-prompt section ([assets/advertisement.txt](assets/advertisement.txt)) that explains the tool to the LLM in detail and lists every filter value with examples. This is what teaches the model when to call the tool and how to fill the filters.

## Dataset origin

The name database was built and classified by the **cardwave** project. See https://github.com/elana-voss/cardwave for the dataset's full generation pipeline (corpus loaders, multi-stage merge, LLM-based classification). This extension is a standalone JavaScript port that consumes the frozen JSON and adds nothing of its own to the data.

## License

LGPL-2.1-or-later. See [LICENSE](LICENSE).

The bundled dataset includes content from hackerb9/ssa-baby-names (LGPL-2.1), which is why the extension itself is LGPL-2.1-or-later. See [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for full corpus attribution.
