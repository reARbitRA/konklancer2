/**
 * Package the standalone single-file HTML into a ZIP archive.
 *
 * Why ZIP (and not raw .html / .apk on Google Drive):
 * - Google Drive serves raw executable files (.apk) behind a virus-scan
 *   interstitial that breaks direct download.
 * - ZIP archives pass through Google Drive's virus scanner cleanly and the
 *   user's tablet can extract the HTML with any file manager.
 * - GitHub Pages serves the raw file byte-for-byte without any proxy mangling
 *   (Cloudflare Rocket Loader can corrupt `<script type="module">` tags in raw
 *   HTML served through CDN caches).
 *
 * The ZIP is stored with a fixed deterministic name so the release workflow
 * can compute a SHA-256 checksum after upload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const releaseDir = path.resolve('release');
const htmlFile = path.join(releaseDir, 'KonkLancer-Tablet-App-v3.html');
const outDir = path.join(releaseDir, 'zip');
const outZip = path.join(outDir, 'KonkLancer-Tablet-App-v3.zip');

if (!fs.existsSync(htmlFile)) {
  console.error('[zip] Standalone HTML not found — run `npm run build:html` first');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// Use the system `zip` if available; fall back to a Node ZIP builder that
// reuses the same store-method ZIP format as src/utils/zipBuilder.ts.
try {
  execFileSync('zip', ['-j', '-9', outZip, htmlFile], { stdio: 'inherit' });
} catch {
  console.log('[zip] system `zip` not available — using built-in store-method ZIP');
  const htmlBytes = fs.readFileSync(htmlFile);
  const zipBuf = buildStoreZip([{ name: path.basename(htmlFile), data: htmlBytes }]);
  fs.writeFileSync(outZip, zipBuf);
}

console.log(`[zip] Wrote ${outZip} (${(fs.statSync(outZip).size / 1024).toFixed(1)} KB)`);

// Also write a checksum file next to the ZIP so the release workflow can
// verify integrity after upload to Google Drive.
const crypto = await import('node:crypto');
const hash = crypto.createHash('sha256').update(fs.readFileSync(outZip)).digest('hex');
fs.writeFileSync(path.join(outDir, 'KonkLancer-Tablet-App-v3.sha256'), hash + '\n', 'utf8');
console.log(`[zip] SHA-256: ${hash}`);

// -------- minimal store-method ZIP (PKZIP) --------
function buildStoreZip(entries) {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const chunks = [];
  let offset = 0;
  const central = [];

  for (const e of entries) {
    const nameBytes = Buffer.from(e.name, 'utf8');
    const data = e.data;
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);

    const localOffset = offset;
    chunks.push(local, data);
    offset += local.length + data.length;

    const cd = Buffer.alloc(46 + nameBytes.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBytes.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(localOffset, 42);
    nameBytes.copy(cd, 46);
    central.push(cd);
  }

  const centralBuf = Buffer.concat(central);
  const centralStart = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, eocd]);
}
