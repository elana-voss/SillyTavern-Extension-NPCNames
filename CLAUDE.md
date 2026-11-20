# NPC Name Suggester

SillyTavern extension; software project, run by the skill software-project.

- The plan: `PLAN.md`. The done milestones' sections: `logs/plan-history.md` (local, not tracked, not read).
- Tests: `npm test` (`node --test test/*.test.js`; one test: add `--test-name-pattern=<part>`). `test/` holds `product`, `tools` and `data` tests. `index.js` imports SillyTavern modules and only runs inside SillyTavern; keep logic that needs a test in `picker.js`, `advertisement.js` or `tool-calls.js`.
- `data/name_database.tagged.json` began as a copy from cardwave (`tools/generate_names/data`) and now has corrected names; a fresh copy from there brings the malformed names back.
