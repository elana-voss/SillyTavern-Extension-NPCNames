// What the AI is told about the tool: its name, description and parameters, the
// instructions placed in the chat (their culture list filled from the data), and the
// tool's answer with its note on when the name may be revealed.

export const TOOL_NAME = 'suggest_npc_name';

export const TOOL_DESCRIPTION =
    `Settle a new character's name: call ${TOOL_NAME}, with filters that fit the character as already established, at the latest before the reply in which their name first appears. An earlier call is fine if you keep the name back: it is the narrator's until the user's character hears or reads it (someone says it, it is written somewhere visible); until then, describe them. Returns a curated first name, with a last name where the culture has surnames, and classification tags (era, role, intelligence, allure, etc). Do NOT invent names yourself. Pass race: human for every person; race: mythical only for a god, spirit or monster; race: elf, race: dwarf or race: dragon for those; a mythology filter goes with race: mythical, never human. Pass commonness only when the story calls for it; otherwise leave it out.`;

// Sent with every name: the last thing the AI reads before it writes on.
export const REVEAL_NOTE =
    "The narrator's knowledge: write this name only once the user's character hears or reads it (someone says it, it is written somewhere visible), unless the card or the user's instructions say how names are revealed; until then, describe this person.";

// The tool's answer: the pick and the note.
export function toolAnswer(pick) {
    return JSON.stringify({ ...pick, reveal: REVEAL_NOTE });
}

// The instructions, with the cultures the data holds in place of CULTURES_MARK.
export const CULTURES_MARK = '%CULTURES%';
export function fillAdvertisement(template, enumValues) {
    return template.replace(CULTURES_MARK, enumValues.language_ethnicity.join(', '));
}

// The tool's parameters, each an enum of the values the name database holds.
export function buildToolParameters(enumValues) {
    const enumField = (values, description) => ({
        type: 'string',
        enum: values,
        description,
    });
    return {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: {
            gender: enumField(enumValues.gender, 'Gender of the new NPC.'),
            language_ethnicity: enumField(
                enumValues.language_ethnicity,
                'Cultural root. Real-world for humans; fantasyElvish, fantasyDwarven, fantasyDragon for non-human races; cyberpunkHandle for online handles.',
            ),
            mythology: enumField(enumValues.mythology, 'Pantheon of a god, spirit or monster; pass with race: mythical, never human.'),
            race: enumField(enumValues.race, 'human for every person; mythical only for a god, spirit or monster; elf, dwarf or dragon for those.'),
            age: enumField(enumValues.age, 'Lifestage the name fits.'),
            era: enumField(enumValues.era, 'Period the name evokes.'),
            role: enumField(enumValues.role, 'Narrative function (hero, villain, mentor, ...).'),
            intelligence: enumField(
                enumValues.intelligence,
                'How cerebral the name sounds: blunt / plain / average / thoughtful / bookish.',
            ),
            allure: enumField(
                enumValues.allure,
                'How attractive the name sounds: harsh / unremarkable / pleasant / pretty / striking.',
            ),
            commonness: enumField(
                enumValues.commonness,
                'Pass only when the story calls for it (a name that must sound plain and everyday, or strikingly unusual); otherwise leave it out.',
            ),
            genre: enumField(enumValues.genre, "The story's flavour; names fitting it become likelier, none is left out."),
            themes: {
                type: 'array',
                items: { type: 'string', enum: enumValues.themes },
                description: 'Zero or more decorative tags (overlap match).',
            },
        },
    };
}

// ST fills the prompt from the newest message backwards until the context
// budget runs out, so a message at the start of the chat is the first to be
// cut from a long chat. Right before the latest message it always survives.
// In a group chat SillyTavern prefixes a message's text with its speaker's name
// unless that is the user's, so there the message bears the user's name.
export function injectBeforeLatest(chat, text, groupUserName = null) {
    // ST's internal chat shape uses `mes` (not `content`); `extra.type ===
    // 'narrator'` marks a system message. setOpenAIMessages (openai.js) reads
    // `.mes` and crashes on the OpenAI wire shape.
    chat.splice(Math.max(chat.length - 1, 0), 0, {
        is_user: false,
        is_system: false,
        name: groupUserName ?? 'NPC Name Suggester',
        mes: text,
        extra: { type: 'narrator' },
    });
}
