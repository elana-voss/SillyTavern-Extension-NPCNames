// Where the extension is installed: SillyTavern looks for its templates under one folder name.

// True when the module at this address sits in the folder its templates are looked for in.
export function isInstalledIn(moduleUrl, folder) {
    return new URL(moduleUrl).pathname.endsWith(`/${folder}/index.js`);
}
