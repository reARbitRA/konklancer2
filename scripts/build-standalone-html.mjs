import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const assetsDir = path.join(distDir, 'assets');
const outDir = path.resolve('release');
fs.mkdirSync(outDir, { recursive: true });

let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
const assetFiles = fs.readdirSync(assetsDir);
const cssFile = assetFiles.find((f) => f.endsWith('.css'));
const jsFile = assetFiles.find((f) => f.endsWith('.js'));

if (!jsFile) {
  throw new Error('Built JS bundle not found in dist/assets');
}

const cssRaw = cssFile ? fs.readFileSync(path.join(assetsDir, cssFile), 'utf8') : '';
const jsRaw = fs
  .readFileSync(path.join(assetsDir, jsFile), 'utf8')
  // Prevent any embedded "</script" literal inside strings/regexes from closing the inline script tag
  .replace(/<\/script/gi, '<\\/script');

html = html.replace(/<link[^>]+rel="stylesheet"[^>]*>/gi, () => `<style>${cssRaw}</style>`);
html = html.replace(
  /<script[^>]+type="module"[^>]+src="[^"]+"[^>]*><\/script>/gi,
  () =>
    `<script>window.__KONKLANCER_STANDALONE__ = true;</script>\n<script type="module">\n${jsRaw}\n</script>`,
);

const targetPath = path.join(outDir, 'KonkLancer-Tablet-App-v3.html');
fs.writeFileSync(targetPath, html, 'utf8');
console.log(`Built standalone single-file app: ${targetPath} (${(fs.statSync(targetPath).size / 1024).toFixed(1)} KB)`);
