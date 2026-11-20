// The command line of the data tools: `--key value` options and `--flag` switches.
const argv = process.argv.slice(2);

/** The value after `--k`, else `d`. */
export const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };

/** Whether `--k` was given. */
export const flag = k => argv.includes('--' + k);
