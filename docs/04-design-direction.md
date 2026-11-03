# Obsidian Console direction and implementation

Locked palette: `#0B0C0B`, `#151715`, `#22261F`, `#9BA394`, `#D9F26A`, `#4ADE80`. The active implementation is `src/rebuild/App.tsx` and `src/rebuild/console.css`: a newly constructed shell with a 56px header, 232px desktop navigation, mobile dock, and rebuilt discovery, detail, pipeline, studio, insights and settings screens. Persian project data uses automatic text direction.

Not complete: the desktop rail is not yet collapsible, advanced legacy workflows remain missing, full Persian UI localization is not restored, and keyboard/screen-reader, responsive and contrast audits have not been performed on the new UI. A jsdom smoke is not a substitute for those checks.
