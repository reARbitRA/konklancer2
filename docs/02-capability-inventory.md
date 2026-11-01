# Capability inventory and parity

| Capability | Rebuilt UI | Evidence / gap |
|---|---|---|
| Discovery, manual projects, project status | yes | Mocked DOM smoke; real feed endpoint tested locally |
| AI analysis, proposal drafting, deliverable generation | partial | Calls existing browser services; live provider not verified; device-key architecture remains |
| File editor and ZIP | partial | Basic editing/export; legacy tree, rename, preview, formats and advanced production workflows not all restored |
| Proposal recording and outcomes | partial | Local in-memory API CRUD/stats tested; redesigned UI lacks full legacy breakdowns and actions |
| Local scan | partial | Button uses existing endpoint; real external scan not performed |
| Cloud status, sync and scan queue | implemented, unverified live | New controls call existing routes; actual GitHub Actions dispatch and sync not run |
| Scheduler | partial | Read/write verified on isolated local server; live external scan not run |
| Google/GitHub sign-in | partial | UI wired; real OAuth not tested. Telegram login not restored |
| Notifications, reminders, model management, advanced GitHub workflows | missing or partial | Legacy implementations retained as reference, not mounted |
| Accessibility and responsive behavior | partial | Focus styling and skip control present; no comprehensive real-browser keyboard, screen-reader or viewport audit |

Older `FEATURE-MATRIX.md` describes the previous frontend and historical checks, not proof of parity for the rebuilt entry.
