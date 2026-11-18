// Marks the chat lines SillyTavern shows for tool calls. Its manual gives the
// `toolCall` class for hiding them with CSS; that class is on every tool's
// line, so this picks out the lines that hold nothing but our own tool.
export const HIDDEN_TOOL_CALL_CLASS = 'npc-names-hidden-tool-call';

function holdsOnlyTool(message, toolName) {
    const invocations = message?.extra?.tool_invocations;
    return Array.isArray(invocations)
        && invocations.length > 0
        && invocations.every(invocation => invocation.name === toolName);
}

export function markToolCallLines(lines, chat, toolName, show) {
    for (const line of lines) {
        const message = chat[Number(line.getAttribute('mesid'))];
        line.classList.toggle(HIDDEN_TOOL_CALL_CLASS, !show && holdsOnlyTool(message, toolName));
    }
}
