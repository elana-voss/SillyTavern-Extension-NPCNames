# Plan

Run by the skill software-project. Every token figure is Claude's estimate (input, output and cache summed over an agent and its reviewer), to be replaced by the measured one beside it.

## Requirements (the owner's words)

- R1 "not all delivered classes we claim to have names actually have names"; "I expect it to potentially have more errors or oversights."
- R2 "the idea of this extension is to AVOID typical AI-slop names which are overused. So do NOT fill in names like "Elara" or "Thorn" or whatever variations of AI slop exists in other languages. The goal is to a have a variety of real world names."
- R3 "A Thai character is able to fetch Thai names." Names in native script stay.
- R4 "filters in this extension are used by the remote LLM"; filters are dropped when nothing matches. The extension applies no filter on its own.
- R5 Thin classes get names ("agreed"); Vietnamese first names ("yes"); male and female Native American names ("yes"); "add missing cultures" (Romanian, Ethiopian, Ghanaian).
- R6 Names under the wrong culture move "only if you are sure".
- R7 "then write a plan to fix all of this", meaning every finding below; `race: human` is the tag for ordinary human names.
- R8 About the project that shows how nano-gpt is reached: "do NOT reference that project from here, just look how it access nano-gpt."

## Milestones

| # | Milestone | Requirement | Status | Priority | Claude tokens | nano-gpt input | Actual |
|---|---|---|---|---|---|---|---|
| 1 | Test bed and the unpublished fixes | R1 | Done | | 5M | 0 | 3.0M, 0; code review Fable 5.1 medium |
| 2 | Gods, handles and non-names | R1, R2, R7 | Done | | 4M | 0.3M | 1.7M, 0; code review Fable 5.1 medium |
| 3 | Surnames: gender and non-surnames | R1, R7 | In progress | Must | 3M | 0.2M | |
| 4 | Cultures: labels and misfiled names | R1, R5, R6 | To do | Must | 4M | 0.5M | |
| 5 | New names | R1, R2, R5 | To do | Must | 6M | 1.5M | |
| 6 | Tags and spelling | R1, R7 | To do | Must | 3M | 0.2M | |
| 7 | Code, documents and tests | R1, R7 | To do | Must | 2M | 0 | |
| 8 | Live run and release | R1 | To do | Must | 1M | 0.1M | |
| | Total | | | | 28M | 2.8M | |

Each milestone ends with `node test.js` passing and the extension working on the test bed. Data milestones show the owner the list of changes before it goes in.

### 1. Test bed and the unpublished fixes

A SillyTavern release in a temporary folder outside the repo, this extension installed in it, a local fake OpenAI-style server recording requests and answering with a tool call, driven by a headless browser. Removed when the list is done. Checks what cannot be read from the code: the tool is called; the instructions reach the request in a long chat, also as a narrator message with Claude and Gemini sources and with squashed system messages; the status badge. Findings on the uncommitted work in `picker.js:60-110`, `advertisement.js:4`, `index.js:155` are fixed, then it is committed.

Tests: `node test.js` 14 of 14; `node tools/testbed.mjs` 76 of 76. Next: milestone 2.

### 2. Gods, handles and non-names

- Add the `race` value `mythical`. No picker change: values are read from the data (`index.js:42`); the filter is `picker.js:21`.
- By rule, `race: mythical`: names with a mythology (165), and gender-ambiguous names tagged ancient outside English (297 of the 343), except words on the deletion list. Read by Claude and, unseeing, by a second reader: the 46 English ambiguous ancient names, the 24 other ancient names (Ixtab is a god, Noah a person), the 79 English ambiguous names that are neither ancient nor handles, and the Mayan names not tagged ancient (Chaac is a god, Uxmal a place). Disagreement: unchanged.
- The 100 handles move to the culture `cyberpunkHandle`, which has no surnames.
- Gods get no surname. `picker.js:77` already gives none when a culture has none; this adds race.
- Entries that name nothing (Unnamed, Trnsfer, Qkr, Korea, Feng Shui, Kalevala, Abominable Snowmen, Accuser, Palladium, Wild Hunt) are deleted, by a written list made from the same reading; how many is measured then.
- `assets/advertisement.txt:6-8`, `index.js:112` and the README: `race: human` for every person; `mythical` only for a god, spirit or monster; a `mythology` filter goes with `race: mythical`, never `human`, because `mythology` is dropped before `race` (`picker.js:1`) and the pantheon would be lost; `cyberpunkHandle` named among the cultures.

Tests: `node test.js` 16 of 16; `node tools/testbed.mjs` 76 of 76. Measured: mythical 491, handles moved 100, deleted 51 (49 first names, 2 surnames), disagreed 30 unchanged; first names 4290, surnames 1948. Waits for the owner's word on merging, after he has seen the change list.

### 3. Surnames: gender and non-surnames

- Surnames in `slavicPolish`, `slavicRussian`, `slavicOther` and `icelandic` get a gender by ending, read over before going in; `picker.js:77` takes those of the character's gender and those without one. An ambiguous character takes any. "Piotr Kowalska" no longer occurs.
- Surnames that are not surnames (words, months, places, two-letter fragments; about 178-195 names are in both lists) leave the list by a written list; a name in both lists stays where it is really a surname in that culture.
- Mongolian gets no surname (41 of its 50 are also given names). The 17 Chinese names in both lists are read; surnames filed as first names leave the first names.

### 4. Cultures: labels and misfiled names

- The present `yoruba` first names and surnames become Ghanaian, `swahili` both Ethiopian; the Romanian names under `latin` become Romanian; the Baltic and Albanian names under `slavicOther`, Azerbaijani under `turkish`, Hungarian under `estonian`, Fijian under `maori`, Portuguese surnames under `french` and the rest are read culture by culture.
- New cultures appear only with both first names and surnames. Baltic, Albanian, Azerbaijani, Hungarian and Fijian are new too (the owner: "yes"); milestone 5 fills what they lack.
- A name moves only where two readers from different vendors agree; else it stays. Cultures are offered from the first names (`picker.js:143`), so Yoruba and Swahili are absent between milestones 4 and 5, with no release in between; milestone 5 brings them back, and every culture listed today is offered again by its end.

### 5. New names

- First: a list of overused names per culture, made by asking models of several vendors to invent NPC names and keeping what keeps coming back. A new name on it does not enter.
- Names come from public lists whose licence allows it (added to `THIRD_PARTY_LICENSES.md`), never invented by a model; a model only checks them. Each batch is tagged and checked before it goes in.
- Fills: new dragon names replacing the franchise characters (Smaug, Mushu, Maleficent; the owner: "replace"), which then leave; Vietnamese first names; male and female Native American names; Romanian, Ghanaian, Ethiopian, Baltic, Albanian, Azerbaijani, Hungarian, Fijian; what milestone 4 emptied (Yoruba, Swahili, Latin, Scandinavian, other Slavic); female names for Latin, German, Scandinavian, Swahili, Swedish, Yoruba; surnames for Latin and Scandinavian; `child`, ancient humans, `victorian`, `modern`; `steampunk`, `postApocalyptic`, `western`, `noirDetective`, `horror`; themes `lunar`, `rustic`. How many per class is written with the first batch; a class with no honest source stays thin and is named to the owner.

### 6. Tags and spelling

- Real names marked gender-ambiguous get their gender where it is clear (50 Icelandic, 25 Spanish, the rest found by reading); wrong genders (Hamad, Sattar, Hermínia) corrected.
- Misspellings (Gioavanni, Mohmmad) and near-duplicates (Βασίλης and Βασιλης, Chen and Chén) corrected; the leaked `sentinel_fields` key removed.
- `horror` and `modern`, today only Lovecraft entities, and common-name tags such as `Brown` as a common first name, corrected. A sample of `role`, `intelligence`, `allure`, `age` and `commonness` is checked; only clear errors change.

### 7. Code, documents and tests

- A filter sent as a list works (`picker.js:22`). Used names are told apart by culture (`index.js:95`) only if milestone 5 brought a name shared across cultures; today none is. A reset leaves tagged names first (`picker.js:42`). Names are not used up by a discarded swipe, if SillyTavern lets the code tell. The prefix on the instructions in group chats (openai.js line 599 of SillyTavern) is avoided. A wrong install folder (`index.js:13`, `index.js:201`) shows an error.
- `index.js:112` no longer promises a first and last name; README step 2 names `None`; `docs/4_sillytavern_console_example.txt` current; the hackerb9 licence checked at its source.
- Tests: list filters, surname gender, used names across cultures, surname cultures that can be reached, data checks; the unused imports removed.

### 8. Live run and release

One live model through nano-gpt on the test bed with the finished work: an ordinary NPC, a Thai NPC, an elf, a dragon, a long chat. Test bed removed. The owner tries it; on his word: version 0.1.5, commit and push.

## Questions for the owner

None open.

## Decisions

- Nothing is pushed before milestone 8's word from the owner: extension users update from the repo's main branch.
- No new filter: `race: human` does it, with one new value. Filters stay the remote LLM's; if it passes none, a god can still come back.
- The order filters are dropped in does not change (`picker.js:1`).
- The test bed stays although Fable judged it too costly for the product's size: how SillyTavern treats the instructions is the largest thing unverified, and it spares the owner the checks.
- Gods without a pantheon get none: no requirement asks for more pantheons, and `race: mythical` reaches them.
- Reviews by Fable medium: the second reader on reading lists, milestones over about 300 changed lines, the audit after milestone 5.
- Scripts that call nano-gpt live outside the repo, with stored answers so a rerun costs nothing; its limits are read before the first call.
- A data change is one script per milestone, kept in `tools/`.
- The test bed reaches the fake AI through SillyTavern's own proxy settings for Claude and Gemini.
- The extension is copied into the test bed, not linked, so removing the bed cannot touch the repo; Playwright lives in the temporary folder too.
- The status badge changes only after SillyTavern's settings save (its 1 s debounce and the request) when function calling is unticked; the extension stays as it is and the test waits for it.
- The review's one finding, a genre preference lost for one pick after the used names reset (`picker.js:66-72`), is milestone 7's "A reset leaves tagged names first"; it is fixed there.
- Qkr and Korea are surnames (korean), Unnamed a dragon: deleted though surnames and dragons are later milestones, because this milestone's line names them.
- Second reader's lists: every name read once, blind; candidates from the 297 and 165 mixed in. Places, groups, titles, books and common words count as naming nothing.
- Deletion disagreed (God-D, God-E, God-L, Sampo): stays, race mythical by the rule.
- The tool's mythology, race and language_ethnicity field descriptions in `index.js` say the same as its description, since the AI reads them.

## Trials

- Open: a milestone agent gets only its own section of the plan to read, not the plan whole, and is told to read CLAUDE.md once. Figure: context at an agent's end; before: 97,274 at milestone 1's hand-over; 94,485 at milestone 2's, no real change yet, open.
