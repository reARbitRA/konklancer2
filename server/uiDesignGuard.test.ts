/**
 * UI design-system guard.
 *
 * The app was migrated to a single neo-brutalist design language. This test
 * exists because a previous pass restyled only part of the app and the rest of
 * the screens silently kept the old dark `slate/indigo/emerald` theme.
 *
 * Any component that ships user-facing markup must be free of legacy tokens.
 * If this test fails, the new screen was not migrated — fix the markup instead
 * of relaxing the assertion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');
const IGNORED_DIRS = new Set(['node_modules']);
const IGNORED_FILES = new Set([
  'index.css', // defines the tokens themselves
]);

/** Tailwind families that belong to the retired dark theme. */
const LEGACY_PALETTE = /\b(?:bg|text|border|from|to|via|ring|divide|placeholder|fill|stroke|decoration|outline|shadow|accent|caret)-(?:slate|indigo|emerald|sky|rose|zinc|neutral|teal|cyan)-[0-9]{2,3}\b/;
/** Rounded corners and soft shadows are not part of the brutalist language. */
const LEGACY_SHAPE = /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b|\bshadow-(?:sm|md|lg|xl|2xl)\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name)));
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
    if (IGNORED_FILES.has(entry.name)) continue;
    out.push(path.join(dir, entry.name));
  }
  return out;
}

const files = walk(SRC);

test('design guard: every source file is scanned', () => {
  assert.ok(files.length > 10, `expected to scan the app sources, found ${files.length}`);
});

test('no legacy dark-theme colour tokens remain in any component', () => {
  const offenders: string[] = [];
  for (const file of files) {
    const rel = path.relative(SRC, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const palette = line.match(LEGACY_PALETTE);
      if (palette) offenders.push(`${rel}:${i + 1} → ${palette[0]}`);
    });
  }
  assert.deepEqual(offenders, [], `Legacy colour tokens found:\n${offenders.join('\n')}`);
});

test('no legacy rounded/soft-shadow shapes remain in any component', () => {
  const offenders: string[] = [];
  for (const file of files) {
    const rel = path.relative(SRC, file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const shape = line.match(LEGACY_SHAPE);
      if (shape) offenders.push(`${rel}:${i + 1} → ${shape[0]}`);
    });
  }
  assert.deepEqual(offenders, [], `Legacy shape utilities found:\n${offenders.join('\n')}`);
});

test('every mounted dialog uses the shared brutalist design language', () => {
  const modals = ['AIEvaluatorModal.tsx', 'ProposalStudioModal.tsx', 'SettingsModal.tsx', 'GitHubDispatcher.tsx'];
  for (const name of modals) {
    const file = path.join(SRC, 'components', name);
    const src = fs.readFileSync(file, 'utf8');
    const brutal = /BrutalModal|border-\[3px\] border-\[#0a0a0a\]|shadow-\[8px_8px_0px_0px_#000\]/.test(src);
    assert.ok(brutal, `${name} does not use the brutalist modal shell`);
  }
});

test('the retired legacy Header component is gone', () => {
  const header = path.join(SRC, 'components', 'Header.tsx');
  const src = fs.readFileSync(header, 'utf8');
  assert.ok(!/export const Header/.test(src), 'legacy Header component must not come back');
  assert.ok(/export type AppTab/.test(src), 'Header.tsx must keep exporting the AppTab type');
});
