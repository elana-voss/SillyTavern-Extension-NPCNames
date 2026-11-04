// ST fills the prompt from the newest message backwards until the context
// budget runs out, so a message at the start of the chat is the first to be
// cut from a long chat. Right before the latest message it always survives.
export function injectBeforeLatest(chat, text) {
    // ST's internal chat shape uses `mes` (not `content`); `extra.type ===
    // 'narrator'` marks a system message. setOpenAIMessages (openai.js) reads
    // `.mes` and crashes on the OpenAI wire shape.
    chat.splice(Math.max(chat.length - 1, 0), 0, {
        is_user: false,
        is_system: false,
        name: 'NPC Name Suggester',
        mes: text,
        extra: { type: 'narrator' },
    });
}
