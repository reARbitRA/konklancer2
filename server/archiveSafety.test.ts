import test from 'node:test';
import assert from 'node:assert/strict';
import { createZipBlob, isSafeArchivePath } from '../src/utils/zipBuilder';

test('archive paths cannot escape the extraction directory', () => {
  for (const path of ['../secret', 'dir/../../secret', '/etc/passwd', 'C:/secret', 'C:\\secret', 'dir\\..\\secret', 'dir//file', 'dir/./file', 'file\0.txt', 'dir/.. /secret', 'file:stream', 'CON.txt']) {
    assert.equal(isSafeArchivePath(path), false, path);
    assert.throws(() => createZipBlob({ [path]: 'content' }), /Unsafe archive path/);
  }
  assert.equal(isSafeArchivePath('docs/راهنما.md'), true);
  assert.ok(createZipBlob({ 'docs/راهنما.md': 'content' }).size > 0);
});
