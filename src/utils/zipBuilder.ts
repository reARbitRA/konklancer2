/**
 * سازنده باینری آرشیو استاندارد ZIP (PKZIP Store Method با محاسبه دقیق CRC-32)
 * بدون نیاز به هیچ کتابخانه سنگین خارجی — اجرا روی تبلت در کسری از میلی‌ثانیه.
 */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipBlob(files: Record<string, string>): Blob {
  const encoder = new TextEncoder();
  const entries = Object.entries(files).map(([name, content]) => {
    const cleanName = name.replace(/^\/+/, '').replace(/\\/g, '/');
    const nameBytes = encoder.encode(cleanName);
    const dataBytes = encoder.encode(content);
    return {
      nameBytes,
      dataBytes,
      crc: crc32(dataBytes),
      offset: 0,
    };
  });

  const localChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    entry.offset = offset;
    const header = new Uint8Array(30 + entry.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract (2.0)
    view.setUint16(6, 0x0800, true); // UTF-8 filename flag
    view.setUint16(8, 0, true); // Compression method: 0 (store)
    view.setUint16(10, 0, true); // Mod time
    view.setUint16(12, 0, true); // Mod date
    view.setUint32(14, entry.crc, true);
    view.setUint32(18, entry.dataBytes.length, true);
    view.setUint32(22, entry.dataBytes.length, true);
    view.setUint16(26, entry.nameBytes.length, true);
    view.setUint16(28, 0, true); // Extra field length
    header.set(entry.nameBytes, 30);

    localChunks.push(header, entry.dataBytes);
    offset += header.length + entry.dataBytes.length;
  }

  const centralStart = offset;
  const centralChunks: Uint8Array[] = [];

  for (const entry of entries) {
    const cd = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(cd.buffer);
    view.setUint32(0, 0x02014b50, true); // Central directory signature
    view.setUint16(4, 20, true); // Version made by
    view.setUint16(6, 20, true); // Version needed
    view.setUint16(8, 0x0800, true); // UTF-8 flag
    view.setUint16(10, 0, true); // Store
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.dataBytes.length, true);
    view.setUint32(24, entry.dataBytes.length, true);
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, entry.offset, true);
    cd.set(entry.nameBytes, 46);

    centralChunks.push(cd);
    offset += cd.length;
  }

  const centralSize = offset - centralStart;
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // End of central directory signature
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralStart, true);
  eocdView.setUint16(20, 0, true);

  return new Blob([...localChunks, ...centralChunks, eocd] as BlobPart[], {
    type: 'application/zip',
  });
}
