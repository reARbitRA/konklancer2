# Work-in-progress changelog

- Replaced mounted frontend with a new Obsidian UI; old source retained for reference.
- Restored local project recovery-vault writes and prevented writes when stored data is unreadable.
- Added legacy route aliases, cloud status/sync/queue controls, scheduler interval controls, and a hash-router-safe skip control.
- Ran local unit/build/jsdom and isolated backend checks described in `06-verification.md`.

Feature parity, live connectivity, comprehensive accessibility testing, deployment and release remain incomplete.
- Hardened Node LLM relay URL validation, explicit server-key selection and redirect behavior; added tests.
- Added dialog focus containment, Escape handling and focus restoration for command and add-project dialogs.
- Reject unsafe ZIP entry paths and expose studio rename/confirmed delete without overwriting original generated-file records.
- Apply the existing content policy before rebuilt AI analysis, proposal and generation requests.
- Added Persian-first RTL presentation and a persistent English/Persian language toggle; checked overview layout in three Chromium viewport widths.
