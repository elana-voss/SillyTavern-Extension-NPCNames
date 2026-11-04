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
| 3 | Surnames: gender and non-surnames | R1, R7 | Done | | 3M | 0.2M | 4.4M, 0; code review Fable 5.1 medium |
| 4 | Cultures: labels and misfiled names | R1, R5, R6 | Done | | 4M | 0.5M | 3.1M, 0.09M; code review Fable 5.1 medium |
| 5 | New names | R1, R2, R5 | Done | | 6M | 1.5M | 9.9M, 0.37M at the last count; code review Fable 5.1 medium |
| 6 | Tags and spelling | R1, R7 | Done | | 3M | 0.2M | 4.2M, 0.14M; code review Fable 5.1 medium |
| 7 | Code, documents and tests | R1, R7 | In progress | Must | 2M | 0 | |
| 8 | Live run and release | R1 | To do | Must | 1M | 0.1M | |
| | Total | | | | 28M | 2.8M | |

Each milestone ends with `node test.js` passing and the extension working on the test bed.

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

Tests: `node test.js` 16 of 16; `node tools/testbed.mjs` 76 of 76. Measured: mythical 491, handles moved 100, deleted 51 (49 first names, 2 surnames), disagreed 30 unchanged; first names 4290, surnames 1948. Next: milestone 3.

### 3. Surnames: gender and non-surnames

- Surnames with a clearly gendered form, in every culture holding them (see Decisions), get a gender by ending, read over before going in; `picker.js:77` takes those of the character's gender and those without one. An ambiguous character takes any. "Piotr Kowalska" no longer occurs.
- Surnames that are not surnames (words, months, places, two-letter fragments; about 178-195 names are in both lists) leave the list by a written list; a name in both lists stays where it is really a surname in that culture.
- Mongolian gets no surname (41 of its 50 are also given names). The 17 Chinese names in both lists are read; surnames filed as first names leave the first names.

Tests: `node test.js` 20 of 20; `node tools/testbed.mjs` 76 of 76. Measured: first names 4283, surnames 1794. Next: milestone 4.

### 4. Cultures: labels and misfiled names

- The present `yoruba` first names and surnames become Ghanaian, `swahili` both Ethiopian; the Romanian names under `latin` become Romanian; the Baltic and Albanian names under `slavicOther`, Azerbaijani under `turkish`, Hungarian under `estonian`, Fijian under `maori`, Portuguese surnames under `french` and the rest are read culture by culture.
- New cultures appear only with both first names and surnames. Baltic, Albanian, Azerbaijani, Hungarian and Fijian are new too (the owner: "yes"); milestone 5 fills what they lack.
- A name moves only where two readers from different vendors agree; else it stays. Cultures are offered from the first names (`picker.js:143`), so Yoruba and Swahili are absent between milestones 4 and 5, with no release in between; milestone 5 brings them back, and every culture listed today is offered again by its end.

Tests: `node test.js` 22 of 22; `node tools/testbed.mjs` 76 of 76. Measured: first names 4266, surnames 1809; 575 names moved, 185 of them by the third reader, 1 merged into an existing entry, 15 of the moved are first names made surnames, 207 stayed on a disagreement; Fiji deleted, Rosi Ni corrected to Rosi; `yoruba` and `swahili` hold nothing and are not offered. Second reader 78,907 input tokens against the estimate of 0.5M; third reader 10,213 against the estimate of 0.1M.

Per changed culture, first names male/female/ambiguous gods among them; surnames male/female/none: albanian 17/1/0; 0/0/19, arabic 67/63/53 (52 gods); 0/0/47, azerbaijani 15/4/0; 12/6/1, baltic 6/12/0; 4/1/0, chinese 46/45/45 (45 gods); 0/0/49, dutch 50/43/1; 0/0/50, english 107/104/116 (47 gods); 0/0/25, estonian 38/47/0; 0/0/48, ethiopian 50/3/0; 0/0/48, fijian 20/15/0; 0/0/5, finnish 19/27/34 (34 gods); 0/0/49, french 33/58/2; 0/0/36, german 19/5/3; 0/0/64, ghanaian 25/3/0; 0/0/44, greek 57/51/6 (12 gods); 21/5/19, hawaiian 50/53/0; 0/0/23, hebrew 45/17/21 (22 gods); 0/0/47, hindi 56/52/11 (12 gods); 0/2/44, hungarian 7/4/0; 0/0/2, icelandic 47/47/50; 24/23/3, indonesian 49/53/0; 0/0/34, irishGaelic 50/51/14 (14 gods); 47/0/3, italian 49/53/50 (50 gods); 0/0/51, japanese 50/47/15 (13 gods); 0/0/26, latin 2/2/10 (12 gods); 0/0/0, maori 24/35/0; 0/0/42, mayan 45/47/48 (71 gods); 0/0/50, nepalese 48/50/0; 0/1/43, nigerian 50/49/0; 0/0/47, persian 40/14/0; 0/0/47, portuguese 51/42/1; 0/0/61, romanian 3/1/0; 0/0/4, scandinavian 7/2/11 (14 gods); 0/0/8, serbian 50/32/0; 0/0/57, slavicOther 27/40/61 (62 gods); 11/9/5, slavicPolish 50/16/0; 10/28/12, slavicRussian 54/52/0; 29/18/0, spanish 54/57/27; 0/0/51, swedish 48/5/0; 0/2/49, thai 50/50/0; 0/0/43, turkish 35/47/16 (16 gods); 0/0/31, ukrainian 48/50/0; 5/0/47.

Short for milestone 5: few are Hungarian 11 first names and 2 surnames, Romanian 4 and 4, Fijian 35 and 5, Baltic 18 and 5, Azerbaijani 19 and 19, Albanian 18 and 19; Ghanaian 3 women, Ethiopian 3 women; Latin has no surname. `scandinavian` and `slavicOther` are not emptied, their Danes and the names the readers did not move stay.

### 5. New names

- First: a list of overused names per culture, made by asking models of several vendors to invent NPC names and keeping what keeps coming back. A new name on it does not enter.
- Names come from public lists whose licence allows it (added to `THIRD_PARTY_LICENSES.md`), never invented by a model; a model only checks them. Each batch is tagged and checked before it goes in.
- Fills: new dragon names replacing the franchise characters (Smaug, Mushu, Maleficent; the owner: "replace"), which then leave; Vietnamese first names; male and female Native American names; Romanian, Ghanaian, Ethiopian, Baltic, Albanian, Azerbaijani, Hungarian, Fijian; what milestone 4 emptied (Yoruba, Swahili), and Latin, Scandinavian and other Slavic, which it left thin; female names for Latin, German, Scandinavian, Swahili, Swedish, Yoruba; surnames for Latin and Scandinavian; women's surnames for Irish (Ní, Nic) and Ukrainian, men's for Nepalese; `child`, ancient humans, `victorian`, `modern`; `steampunk`, `postApocalyptic`, `western`, `noirDetective`, `horror`; themes `lunar`, `rustic`. How many per class is written with the first batch; a class with no honest source stays thin and is named to the owner.

Tests: `node test.js` 36 of 36; `node tools/testbed.mjs` 76 of 76, run before the review's data corrections. Targets per class, written with the first batch: 60-150 first names, 30-80 surnames; the tool cuts a culture at 75 first names a sex and 60 surnames. Existing names on the overused list: 0 first names, 0 surnames (Xavière was the only one and is marked not slop).

Measured: first names 6903, surnames 2627 (+2686, +818; 49 dragons out, 60 in). Sources of the 3504 new names, a name counted once per source: Wikidata 2137, name-dataset 1798, SSA 588, popular-names 145, mythology 60.

Per culture, human first names male/female; surnames (male/female where gendered): albanian 75/75; 60. azerbaijani 75/75; 82 (33/27). baltic 75/72; 66 (32/29). ethiopian 75/47; 60. fijian 75/62; 60. german 19/75; 64. ghanaian 75/75; 60. hungarian 75/75; 60. irishGaelic 50/51; 110 (47/60). latin 74/43; 60 (0/13). nativeAmerican 42/38; 0. nepalese 48/50; 100 (1/1). nigerian 55/61; 47. romanian 75/75; 60. scandinavian 75/75; 60. slavicOther 75/75; 79 (29/27). swahili 32/30; 60. swedish 48/75; 51 (0/2). ukrainian 48/50; 106 (5/54). vietnamese 75/71; 39. yoruba 75/65; 60.

Per style, first names (human among them); surnames: steampunk 213 (213); 0. western 217 (217); 2. noirDetective 222 (222); 1. victorian 330 (330); 0. modern 390 (377); 0. child 310 (310). ancient 735 (275); 60. horror 19 (6); 0. lunar 23 (22); 3. rustic 28 (27); 112. postApocalyptic 1 (1, Scythe); 0.

What stays thin, for the owner: postApocalyptic 1 (both readers found no name), horror 19, lunar 23, rustic 28; Swahili 32 men and 30 women; ancient women greek 13 and persian 10; Native American 42 men and 38 women, no surnames; Ethiopian women 47, Fijian women 62. German men 19 and Swedish men 48 were not a fill.

### 6. Tags and spelling

- Real names marked gender-ambiguous get their gender where it is clear (50 Icelandic, 25 Spanish, the rest found by reading); wrong genders (Hamad, Sattar, Hermínia) corrected.
- Misspellings (Gioavanni, Mohmmad) and near-duplicates (Βασίλης and Βασιλης, Chen and Chén) corrected; the leaked `sentinel_fields` key removed.
- From the audit: `Lord Shiva` (a god, under race human), `Great Woman`, `Harsh joy`, the phrase `بسم الله` and the kunyas `ابو علي`, `ابو محمد`, `ام محمد` leave or are corrected; the malformed-name test also checks later words; the near-spellings `Mamedova`/`Memmedova` and `Leordo` are read.
- `horror` and `modern`, today only Lovecraft entities, and common-name tags such as `Brown` as a common first name, corrected. A sample of `role`, `intelligence`, `allure`, `age` and `commonness` is checked; only clear errors change.
- Measured: `node test.js` 20 of 20, `node tools/testbed.mjs` 76 of 76 (before the review's eight gender lines went back to main's values, data only). `tools/m6-apply-tags.mjs` with `tools/m6-tags.txt`, run on main's database: 213 genders, 71 tags, 66 renames, 37 merges, 11 removed, `sentinel_fields` off 5 entries. First names 6903 to 6864, surnames 2627 to 2618.
- Read and left unchanged: of 312 spellings sent to the second reader, 274; of 158 genders sent to it, 55 changed, the rest did not (it differed or did not know, the review took six back).

### 7. Code, documents and tests

- A filter sent as a list works (`picker.js:22`). Used names are told apart by culture (`index.js:95`) because milestone 5 brought names shared across cultures (159 first names and 7 surnames, measured by the audit). A reset leaves tagged names first (`picker.js:42`). Names are not used up by a discarded swipe, if SillyTavern lets the code tell. The prefix on the instructions in group chats (openai.js line 599 of SillyTavern) is avoided. A wrong install folder (`index.js:13`, `index.js:201`) shows an error.
- `index.js:112` no longer promises a first and last name; README step 2 names `None`; `docs/4_sillytavern_console_example.txt` current; the hackerb9 licence checked at its source.
- Tests: list filters, surname gender, used names across cultures, surname cultures that can be reached, data checks; the unused imports removed.

### 8. Live run and release

One live model through nano-gpt on the test bed with the finished work: an ordinary NPC, a Thai NPC, an elf, a dragon, a long chat. Test bed removed. The owner tries it; on his word: version 0.1.5, commit and push.

## Questions for the owner

None open.

## Decisions

- The names from name-dataset, built from the Facebook leak, stay; the licence file says where it comes from. The owner: "keep, it is just general names, there is no conflict in using them".
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
- Gendered surnames everywhere (main session's decision, since "a man gets a woman's surname" must not remain anywhere): `slavicPolish`, `slavicRussian`, `slavicOther`, `icelandic`, `ukrainian`, `turkish`, `swedish`, `greek`, `nepalese` (Devi, Magarni, Yadavani) and `irishGaelic` get a gender, by the same tool. Swedish -son is a family name of both sexes: none; -dotter female. Icelandic -son and -dóttir follow the person's sex. Greek -idou and -opoulou are female; patronymic -ou is borne by both sexes: none. Irish `Ó X` and `Mac X` are male, a woman's being Ní and Nic; anglicised forms (O'Byrne) none. Not clearly gendered gets none (-енко, -чук, -ишин, -oğlu, Serbian -ić, Norwegian and Danish -sen).
- Counts male/female/no gender: Polish 10/28/11, Russian 28/17/0, Other 12/10/5, Icelandic 24/23/3, Ukrainian 5/0/47, Azerbaijani 12/6/1, Baltic 4/1/0, Turkish 0/0/31, Swedish 0/2/48, Greek 21/5/19, Nepalese 0/3/45, Irish 47/0/3. Ukrainian and Irish hold no female form, Swedish and Nepalese no male one; the ungendered serve those characters (for Irish women three: Conchobhair, Maoilchiaráin, O'Byrne). Every other culture has no gender on any surname.
- Removal needs both readers non-surname, category may differ; unsure keeps. 104 removed + 50 Mongolian; 29 disagreements unchanged.
- Chinese names in both lists are 16, not 17. First names removed by both readers: Jiang, Kwok, Shi, Wu, Yeung, Zhang, Zhu (Kwok, Yeung are not in both lists; asked because the line says surnames filed as first names leave).
- Second reader's list: 270 surname entries, 35 Chinese first names; numbered answers merged in `tools/m3-readings.txt`.
- The milestone's tool runs on main's database, not on its own result; its count asserts refuse any other.
- The test bed turns the extension on at its start: the status badge scenario turns it off and on, and a run ending before SillyTavern's debounce saved the on left the next run with it off (32/76 on two runs).
- The review's one finding: Greek Tassi and Zika (female) and Mundis and Rubis (male) read none against the same endings elsewhere; given those genders. Paraskeva stays none, also used by both sexes.
- `yoruba` and `swahili` are relabelled whole (main session's decision): every name goes to Ghanaian and Ethiopian. Ghana and Ethiopia have many Muslim and Christian given names, so a second reader's Arabic or English names the origin and holds nothing back; only a name both readers place in another specific culture would move there, and none did (Abubakar, Yakubu, read Nigerian by the second reader alone, are Ghanaian).
- No key `danish` (main session's decision; the owner said yes to five new cultures and Danish is not among them): the Danes stay under `scandinavian`, whose label is true of them, and Norse gods stay there as `race: mythical`.
- `latin` keeps its 12 gods with their mythology and takes Agripa and Cicero; Artiom goes to Romanian, where the third reader sides with Claude; other disagreements stay, listed in the change list.
- Second reader: `moonshotai/kimi-k2.6`, through nano-gpt, every human name in lists of 100, blind, after Claude's reading was written. An answer naming the culture a name is filed under counts as stays. 393 names had no two equal answers: 58 only Claude would move, 335 only the second reader.
- `X+surname` moves a first name to X's surnames, without its age, intelligence and gender; a name already there is merged into that entry (Hristova, `slavicOther`, female). Makarezos gets male on entering Greek, as -os is the man's form; no other moved surname enters a gendered culture with a gendered form.
- The third reader settles disagreements: `z-ai/glm-5.3`, through nano-gpt, read only those names, blind, in mixed lists of 30, without the present culture or a "stays". A name moves where its answer equals Claude's or the second reader's and is not the present culture. Its plain culture never equals `X+surname`, so Flores, Hartman, Hartmann, Schmit and Soderman stay first names where they are. Devi and Yadavani keep female on moving to Hindi.
- Targets: 60-150 first names, 30-80 surnames a class; the tool cuts at 75 first names a sex and 60 surnames. English style names are not cut (588). Native American up to 150; Nepalese surnames up to 100, so that Bhandari, named in the milestone's order, enters (80 cut it out).
- `#not-slop` in `tools/overused-names.txt` marks a real name the counting would put on the list and keeps it off; Xavière is the one.
- Latin surnames in -illa, -ina, -ia, -ana are female; Baltic surnames in -s, -š, -ņ male; Baltic, Azerbaijani and other Slavic surnames are cut per gender.
- The test allows Rosi in `german` too: it is also a German name.
- Dragons come from `dragons.txt`: descriptive labels, type words, Wings of Fire, Durple and Gayant left out; all 49 old ones out; fields neutral, harsh, uncommon, mystical.
- Meaning-based classes are a tag only where both readers agree (first names, 6253 asked). Three of their answers left out by Claude's own reading: Sarnai (rose), Babatunde and Yetunde (a parent has returned).
- Igbo and Hausa under `yoruba`: both readers asked blind which people each candidate belongs to. Those both call Igbo (38 candidates, 17 in the data) and Yakubu, Bilkisu and Amina, both call Hausa, are filed as `nigerian`, which exists and is true of them. Other candidates both call Hausa do not enter `yoruba`; the free place went to Kayode.
- Nepalese surnames: sources popular-names NP and Wikidata; both readers asked whether each is an ordinary family name of men in Nepal, not blind to the country, since the blind question failed Yadav: 136 of 146 passed. Entries ungendered; Magar male as before.

- The review of milestone 5: fixed are Lithuanian surnames in -a filed female (now -a but -eva, -ova, -iņa, -ina, -ska is the man's form; the six fell to the men's cut), six women's given names as Yoruba surnames, five non-dragons, Gothicus, Pixodarus, seven by-names of one famous man (Sitting Bull, Crazy Horse, Rain-in-the-Face, Black Elk, Cornplanter, Poundmaker, Cornstalk); Native American by-names in English are era victorian; Latin -ella is female (Metella).
- Same review, Claude's verdict, left as they are: Ghanaian men's names that are also surnames (Akan names serve as both; Mahama, Iddrisu, Salifu are given names); Tanzanian politicians' surnames under `swahili` (real surnames); Bambalio and Gaumata (a cognomen, a real name); Mamedova and Memmedova, and the old Leordo (spelling, milestone 6).

- Audit after milestone 5 (Fable 5.1 medium): on track. The audit and its two fixes cost 2.5M. Accepted: one shared module for the data tools with the debug loop removed; one test load and one invariants test, so tests are smaller than the product; its data defects go to milestone 6. Not taken: gating by spelling variant, since the two variants in the data (Lira, Silas) are real names and milestone 6 adds no names; dropping `mythology: null`, since no requirement asks for a smaller file.
- Open estimates not scaled: milestones 1 to 5 cost 22.1M against 22M.
- `tools/db.mjs`, where the four apply tools differed: lists split on either line end (milestone 2 split on LF alone, so it kept the CR in a line's last field and refused its list in a Windows checkout, where git's `autocrlf` gives the lists CRLF; pinned by a test).
- `tools/db.mjs`: the change list is written before the database (milestone 5's order; 2 to 4 wrote the database first, and a failure between the two would lose the list while the count asserts refuse a second run). Not tested: a failed disk write is worth no test here.
- `tools/db.mjs`: every apply tool prints the change list's path (milestone 5 did not, 2 to 4 did). Not tested: output only.
- `test.js`, where the data tests differed: a surname looked up by name must exist (the surname test's lookup failed on a missing name, the Lithuanian test's `?.` passed on one). Kept the failing way; the six Lithuanian man's forms left at milestone 5's review, so they stand as "no female entry of these". A first name looked up by culture (the gods test's lookup by name alone saw only the last of a name's cultures; Noah is now checked in both of his). The load stays a plain parse, not `loadDb`, whose byte check would fail a checkout with other line ends.
- `test.js`, the audit's merge: no assert of a single name dropped. The apply tools' asserts check their input once, on the database before them, and none looks at the data as it is now; the audit's ~80 lines rested on that, so the invariants test holds every assert in about 150 lines. Four culture checks went that the every-culture assert already holds (ghanaian, ethiopian, yoruba, fijian offered).

- Milestone 6, `modern`: the era holds 377 real names, so it is right as it stands; no change. `horror`: Lovecraft entries stay; Vlad, Carrie, Norman, Damian, Annabelle, Malachi and Silas gain it, where the reader and the builder both hold the name dark. Reader's yes without the builder's stays out: Mircea, Ileana, Lucian, Lucius, Ezekiel; Sabrina, reader's no.
- Milestone 6, `hindi/Shiva`: filed female, the reader said either; set to ambiguous. `english/Fardu` and `english/Golden` stay ambiguous, the builder could not confirm the reader.
- Milestone 6, near-spellings: `Memmedova` merged into `Mamedova` and `Aliyeva` into `Əliyeva`, both readers calling them one name. `Leordo` stays: both call it a typo, of different names (Leonardo, Leopoldo).
- Milestone 6, spellings both readers fixed that stay, as real forms: swedish `Lias`, ghanaian `Yeboaa` (Akan feminine), portuguese `Jhonatan`, chinese `Joeng` (Cantonese romanisation), nepalese `Shreesti`, finnish `Cavander`; spanish `Yent` stays, its fix `Yente` being a woman's name on a man's entry. Taken with only one reader's spelling, the other agreeing it is a typo or the spelling plainly right: Stephn, Bryân, Dainella, Lukus, Kateya, Printess.
- Milestone 6, the review: eight gender changes that had passed the readers were wrong and stay as on main: Borka, Mileta, Gerti, Haruna, Didière, Friðlín, Viglín, Folorunsho.
- Milestone 6, `arabic` `أم`, `ام`, `Um` and `ابومحمد` left with the audit's kunyas: parts or another spelling of the same.

## Trials

- Closed, reverted: a milestone agent reads only its section of the plan. Figure, context at an agent's end: 97,274, then 94,485, 97,467, 94,038; the hand-over limit sets it, and the plan was still read six times.
- Milestone 3 cost 4.4M against 3M: the gender work widened to five more cultures and one round of corrections to genders. The estimate is not raised; the audit after milestone 5 scales the open ones.
- Open: an agent's brief after a hand-over is its work order only, and its background jobs are watched by a Monitor that speaks only on failure or at the end. Figure: Claude tokens per data milestone; before: milestone 5 cost 9.9M over seven agents, three of which put no name in.
- Open: briefs quote the plan's section and name the tools needed; scripts are written with the Write tool, not a Bash heredoc; name lists go to the model reader by script, never into the agent's context. Figures, milestones 2 to 5 by the audit: PLAN.md read 4 to 6 times per agent; 7 failed heredocs; 36,546 tokens on one list.
