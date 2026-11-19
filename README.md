# SillyTavern NPC Name Suggester

A SillyTavern extension that picks NPC names from a curated database, so the AI stops inventing yet another Elara or Marcus.

- Whenever a new character enters the story, the AI asks the extension for a name. You do not type anything special.
- The name fits the character: the AI can ask for a gender, culture, era or vibe.
- Names do not repeat: one already used in the chat stays away while other names fit.
- It needs an AI backend that supports tool calling; most modern Chat Completion APIs do.

## Install

In SillyTavern, open Extensions, click Install Extension, paste this URL, and confirm:

```
https://github.com/elana-voss/SillyTavern-Extension-NPCNames
```

## Setup

Three settings must be on after install.

### Step 1: Enable function calling

![Step 1](docs/1_sillytavern_get_name_enable_function_calling.png)

In the Chat Completion Presets panel, tick **Enable function calling**.

### Step 2: Set Prompt Post-Processing to `None` or a "with tools" option

![Step 2](docs/2_sillytavern_get_name_preset_enable_use_tools.png)

In the API panel, set Prompt Post-Processing to `None` or to one of the "with tools" options. The others will not let the AI call any tools.

### Step 3: Turn on the extension

![Step 3](docs/3_sillytavern_get_name_enable_extension.png)

In Extensions, open NPC Name Suggester and check that **Enable suggest_npc_name tool** is ticked; it is on by default. The status badge turns green.

## Verify it works

These prompts are just to confirm the tool fires. In normal roleplay you do not type anything special; the AI calls the tool on its own whenever a new NPC enters the scene.

Drop one of these into a chat:

> Introduce a new NPC walking into the scene right now.

> A grizzled noir-coded private investigator from the 1920s walks into the bar. Introduce him.

> Three peasant farmhands stop the party at the gate. Name them.

If the debug-log checkbox is on, every call shows up in the browser devtools console. See [docs/4_sillytavern_console_example.txt](docs/4_sillytavern_console_example.txt) for an example trace.

## Backend requirement

Only works with AI backends that support tool calling. Most modern Chat Completion APIs do. If yours does not, the status badge says so and the extension does nothing.

## Settings

Three checkboxes:

- **Enable suggest_npc_name tool**: on by default.
- **Log tool calls to console (debug)**: off by default.
- **Show Suggest NPC Name tool calls in chat**: off by default. While off, the "Tool calls: Suggest NPC Name" lines are hidden; the AI still receives the name. A line that also holds another extension's tool stays visible.

The extension also adds a chunk of text just before the latest chat message, explaining the tool to the AI. See [assets/advertisement.txt](assets/advertisement.txt) for the wording.

## How it works

The AI calls the tool before the reply in which a new character's name first appears, which is when your character would learn it; until then it describes them. A card or your own instructions can say how names are revealed. It can pass filters like gender, culture, era, vibe. It gets back a first and last name plus a few tags to colour the narration; gods, dragons, cyberpunk handles, Native American and Mongolian figures get a single name: gods take no surname and the database has none for the others. A name already used in the chat will not come back from the same culture until every name fitting the request has been used.

Pseudo-signature of `suggest_npc_name` (every argument is optional, pass any subset):
```
suggest_npc_name(
  gender?, language_ethnicity?, mythology?, race?,
  age?, era?, role?, intelligence?, allure?,
  commonness?, genre?, themes?
)
```

The values currently in the database:

- **gender**: `male`, `female`, `ambiguous`
- **language_ethnicity**: `albanian`, `arabic`, `azerbaijani`, `baltic`, `chinese`, `cyberpunkHandle`, `dutch`, `english`, `estonian`, `ethiopian`, `fantasyDragon`, `fantasyDwarven`, `fantasyElvish`, `fijian`, `finnish`, `french`, `german`, `ghanaian`, `greek`, `hawaiian`, `hebrew`, `hindi`, `hungarian`, `icelandic`, `indonesian`, `irishGaelic`, `italian`, `japanese`, `korean`, `latin`, `maori`, `mayan`, `mongolian`, `nativeAmerican`, `nepalese`, `nigerian`, `norwegian`, `persian`, `portuguese`, `romanian`, `scandinavian`, `serbian`, `slavicOther`, `slavicPolish`, `slavicRussian`, `spanish`, `swahili`, `swedish`, `thai`, `turkish`, `ukrainian`, `vietnamese`, `yoruba`
- **mythology**: `celtic`, `egyptian`, `greek`, `hindu`, `japanese`, `lovecraft`, `mesopotamian`, `nativeAmerican`, `norse`, `roman`, `slavic`
- **race**: `human`, `mythical`, `elf`, `dwarf`, `dragon`
- **age**: `child`, `youngAdult`, `adult`, `elder`
- **era**: `ancient`, `victorian`, `nineteenTwenties`, `midcentury`, `modern`, `contemporary`, `nearFuture`, `timeless`
- **role**: `hero`, `villain`, `mentor`, `sidekick`, `comicRelief`, `loveInterest`, `antihero`, `neutral`, `bystander`
- **intelligence**: `blunt`, `plain`, `average`, `thoughtful`, `bookish`
- **allure**: `harsh`, `unremarkable`, `pleasant`, `pretty`, `striking`
- **commonness**: `common`, `uncommon`, `rare`
- **genre**: `fantasy`, `cyberpunk`, `steampunk`, `western`, `noirDetective`, `horror`, `sliceOfLife`, `postApocalyptic`
- **themes**: `airy`, `brutish`, `celestial`, `earthy`, `exotic`, `fiery`, `floral`, `gemstone`, `icy`, `literary`, `lunar`, `military`, `mystical`, `regal`, `religious`, `rustic`, `scholarly`, `solar`, `watery`

`race: human` is for every person; `mythical` only for a god, spirit or monster. A `mythology` filter goes with `race: mythical`, never `human`: when nothing matches, `mythology` is dropped before `race` and the pantheon is lost. `cyberpunkHandle` holds online handles (GhostRunner, Nova404), not names.

A filter sent as a list matches any of its values. Unknown values are tolerated: the picker drops only the filters that stop a name from matching and reports them. A `genre` filter picks names tagged with that genre first, then untagged names, which it reports as relaxed; some genres hold very few tagged names (`postApocalyptic` one, `horror` 26).

## Data Source

The name database was built by the cardwave project: https://github.com/elana-voss/cardwave. This extension ships a copy of the data, with malformed names corrected, and a small JavaScript port of the name picker.

## License

LGPL-2.1-or-later. The database includes content from hackerb9/ssa-baby-names which is LGPL-2.1, so the whole extension follows the same license. Full per-corpus attribution in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
