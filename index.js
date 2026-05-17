import {
    extension_settings,
    renderExtensionTemplateAsync,
    saveMetadataDebounced,
} from '../../../extensions.js';
import {
    chat_metadata,
    extension_prompt_roles,
    extension_prompt_types,
    saveSettingsDebounced,
    setExtensionPrompt,
} from '../../../../script.js';
import { eventSource, event_types } from '../../../events.js';
import { ToolManager } from '../../../tool-calling.js';
import { pickName, deriveEnumValues } from './picker.js';

const MODULE = 'npcNames';
const EXT_DIR = 'third-party/SillyTavern-Extension-NPCNames';
const TOOL_NAME = 'suggest_npc_name';
const ADVERTISEMENT_KEY = 'NPCNames_Advertisement';
const LOG_TAG = '[NPCNames]';
const DEFAULT_SETTINGS = { enabled: true, debugLog: false };

let firstNames = [];
let lastNames = [];
let enumValues = {};
let advertisement = '';

function loadSettings() {
    extension_settings[MODULE] = Object.assign(
        {},
        DEFAULT_SETTINGS,
        extension_settings[MODULE] ?? {},
    );
}

async function loadDataset() {
    const url = new URL('./data/name_database.tagged.json', import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    firstNames = data.first_names;
    lastNames = data.last_names;
    enumValues = deriveEnumValues(firstNames);
}

async function loadAdvertisement() {
    const url = new URL('./assets/advertisement.txt', import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    advertisement = await res.text();
}

function buildToolParameters() {
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
                'Cultural root. Real-world for humans; fantasy_* buckets for non-human races.',
            ),
            mythology: enumField(enumValues.mythology, 'Pantheon the name should evoke.'),
            race: enumField(enumValues.race, 'Species / race of the NPC.'),
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
                'How recognizable the name should be.',
            ),
            genre: enumField(enumValues.genre, "The story's flavour."),
            themes: {
                type: 'array',
                items: { type: 'string', enum: enumValues.themes },
                description: 'Zero or more decorative tags (overlap match).',
            },
        },
    };
}

function callPicker(args) {
    const meta = chat_metadata[MODULE] ?? { usedFirst: [], usedLast: [] };
    const usedFirst = new Set(meta.usedFirst ?? []);
    const usedLast = new Set(meta.usedLast ?? []);
    const result = pickName(firstNames, lastNames, args ?? {}, usedFirst, usedLast);
    chat_metadata[MODULE] = {
        usedFirst: [...usedFirst],
        usedLast: [...usedLast],
    };
    saveMetadataDebounced();
    return result;
}

function registerTool() {
    ToolManager.registerFunctionTool({
        name: TOOL_NAME,
        displayName: 'Suggest NPC Name',
        description:
            'Use for every new NPC you introduce. Returns a curated first+last name with classification tags (era, role, intelligence, allure, etc). Do NOT invent names yourself.',
        parameters: buildToolParameters(),
        shouldRegister: async () =>
            extension_settings[MODULE].enabled
            && ToolManager.isToolCallingSupported(),
        action: async (args) => {
            try {
                if (extension_settings[MODULE].debugLog) {
                    console.log(LOG_TAG, 'args:', args);
                }
                const pick = callPicker(args);
                if (extension_settings[MODULE].debugLog) {
                    console.log(LOG_TAG, 'pick:', pick);
                }
                return JSON.stringify(pick);
            } catch (e) {
                console.error(LOG_TAG, 'action error:', e);
                return JSON.stringify({ error: e.message });
            }
        },
        formatMessage: () => 'Picking a name…',
        stealth: false,
    });
}

function unregisterTool() {
    ToolManager.unregisterFunctionTool(TOOL_NAME);
}

function setAdvertisement(active) {
    // Empty string is ST's documented removal contract for extension
    // prompts; no separate unset API.
    setExtensionPrompt(
        ADVERTISEMENT_KEY,
        active ? advertisement : '',
        extension_prompt_types.IN_PROMPT,
        0,
        false,
        extension_prompt_roles.SYSTEM,
    );
}

function applyEnabled(active) {
    if (active) registerTool();
    else unregisterTool();
    setAdvertisement(active);
    updateStatusBadge();
}

function bindSettingCheckbox(selector, key, sideEffect) {
    $(selector)
        .prop('checked', extension_settings[MODULE][key])
        .on('change', function () {
            extension_settings[MODULE][key] = !!$(this).prop('checked');
            saveSettingsDebounced();
            sideEffect?.();
        });
}

function updateStatusBadge() {
    const el = document.getElementById('npc_names_status');
    if (!el) return;
    if (ToolManager.isToolCallingSupported()) {
        el.textContent = 'Tool calling supported. Extension active.';
        el.classList.remove('warn');
        el.classList.add('ok');
    } else {
        el.textContent = 'Current backend does not support tool calling. Extension inactive.';
        el.classList.remove('ok');
        el.classList.add('warn');
    }
}

jQuery(async () => {
    loadSettings();
    try {
        await loadDataset();
    } catch (e) {
        console.error(LOG_TAG, 'dataset load failed; tool will not register:', e);
        return;
    }
    // Advertisement is nice-to-have flavour; don't let its failure block
    // tool registration. Reload-on-toggle picks up a delayed success.
    loadAdvertisement().catch(e =>
        console.warn(LOG_TAG, 'advertisement load failed; tool registers without it:', e),
    );

    const html = await renderExtensionTemplateAsync(EXT_DIR, 'settings');
    $('#extensions_settings2').append(html);

    bindSettingCheckbox('#npc_names_enabled', 'enabled', () =>
        applyEnabled(extension_settings[MODULE].enabled),
    );
    bindSettingCheckbox('#npc_names_debug', 'debugLog');

    // Source / model change events don't fire when the user toggles the
    // standalone `Enable function calling` checkbox or loads an OAI preset
    // that flips it, so also re-poll on the broader settings-change events.
    for (const evt of [
        event_types.CHATCOMPLETION_SOURCE_CHANGED,
        event_types.CHATCOMPLETION_MODEL_CHANGED,
        event_types.OAI_PRESET_CHANGED_AFTER,
        event_types.SETTINGS_UPDATED,
    ]) {
        eventSource.on(evt, updateStatusBadge);
    }

    applyEnabled(extension_settings[MODULE].enabled);
});
