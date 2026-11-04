# NPC Name Suggester

SillyTavern extension; software project, run by the skill software-project.

- The plan: `PLAN.md`.
- Tests: `node test.js`. `index.js` imports SillyTavern modules and only runs inside SillyTavern; keep logic that needs a test in `picker.js` or `advertisement.js`.
- `data/name_database.tagged.json` began as a copy from cardwave (`tools/generate_names/data`) and now has corrected names; a fresh copy from there brings the malformed names back.
