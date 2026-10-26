import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFileTree, allFolderPaths, countFiles, everyFile, languageOf, fileKind, formatBytes, searchInFiles, uniquePath, isValidFilePath, renameFileKey } from '../src/components/workspace/fileTree';
import { highlight, lineCount } from '../src/components/workspace/highlight';

/**
 * این تست‌ها ابزارهای ورک‌اسپیس کد (درخت فایل، جست‌وجوی پروژه، هایلایت) را
 * می‌سنجند. این ماژول‌ها روزی حذف شده بودند چون هیچ‌جا import نمی‌شدند؛
 * اکنون در CodeWorkspace استفاده می‌شوند و رفتارشان باید قفل شود.
 */

const files: Record<string, string> = {
  'README.md': '# پروژه\n',
  'src/app.py': 'import os\n\ndef main():\n    print("hi")\n',
  'src/utils/helper.py': 'def add(a, b):\n    return a + b\n',
  'src/web/index.html': '<div id="app"></div>\n',
  'package.json': '{"name":"demo"}\n',
};

test('buildFileTree ساختار پوشه‌ای تو در تو می‌سازد', () => {
  const tree = buildFileTree(files);
  // فایل‌های ریشه مستقیم گره file هستند و پوشه‌ها گره folder
  assert.ok(tree.some((n) => n.type === 'file' && n.path === 'package.json'));
  const src = tree.find((n) => n.path === 'src');
  assert.ok(src, 'پوشه src ساخته نشده');
  const utils = src!.children.find((n) => n.path === 'src/utils');
  assert.ok(utils, 'پوشه تودرتوی src/utils ساخته نشده');
  assert.equal(utils!.children[0].path, 'src/utils/helper.py');
  assert.equal(countFiles(tree), Object.keys(files).length);
});

test('allFolderPaths و everyFile همه‌ی گره‌ها را برمی‌گردانند', () => {
  const tree = buildFileTree(files);
  assert.deepEqual(allFolderPaths(tree).sort(), ['src', 'src/utils', 'src/web']);
  const leaves = everyFile(tree).filter((n) => n.type === 'file');
  assert.equal(leaves.length, Object.keys(files).length);
  assert.ok(leaves.some((n) => n.path === 'package.json'));
});

test('شمارش اندازه‌ی فایل برگ‌ها درست است', () => {
  const tree = buildFileTree(files);
  const leaf = everyFile(tree).find((n) => n.path === 'src/app.py');
  assert.equal(leaf!.size, files['src/app.py'].length);
  assert.equal(formatBytes(undefined), '', 'اندازه‌ی نامعلوم باید رشته‌ی خالی باشد نه 0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
});

test('languageOf و fileKind برای پسوندهای گوناگون درست‌اند', () => {
  assert.equal(languageOf('a/b.py'), 'python');
  assert.equal(languageOf('a/b.tsx'), 'typescript');
  assert.equal(languageOf('a/b.json'), 'json');
  assert.equal(languageOf('a/b.md'), 'markdown');
  assert.equal(languageOf('a/b.unknownext'), 'text');
  assert.equal(fileKind('x/y.css'), 'css');
});

test('searchInFiles شماره‌ی خط و ستون دقیق می‌دهد', () => {
  const hits = searchInFiles(files, 'return');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, 'src/utils/helper.py');
  assert.equal(hits[0].matches[0].line, 2);
  assert.equal(hits[0].matches[0].column, 5);
  assert.equal(searchInFiles(files, 'a').length, 0, 'کوئری یک‌حرفی نباید نتیجه بدهد');
  assert.equal(searchInFiles(files, 'def').length, 2, 'جست‌وجو باید در چند فایل کار کند');
});

test('uniquePath نام تکراری نمی‌سازد', () => {
  const created = uniquePath(files, 'src');
  assert.equal(files[created], undefined, 'uniquePath مسیر موجود برگرداند');
  assert.match(created, /^src\/.+\.py$/);
  const again = uniquePath({ ...files, [created]: 'x' }, 'src');
  assert.notEqual(again, created);
  assert.equal(uniquePath({}, ''), 'file.py');
});

test('isValidFilePath مسیرهای ناامن را رد می‌کند', () => {
  assert.equal(isValidFilePath('src/app.py'), true);
  assert.equal(isValidFilePath('../etc/passwd'), false);
  assert.equal(isValidFilePath('/abs/path.py'), false);
  // اسلش دوتایی در normalize به یکی تبدیل می‌شود؛ رد کردنش لازم نیست
  assert.equal(isValidFilePath('src//double.py'), true);
  assert.equal(isValidFilePath(''), false);
});

test('renameFileKey محتوا را جابه‌جا می‌کند و کلید قدیمی را حذف می‌کند', () => {
  const next = renameFileKey(files, 'src/app.py', 'src/main.py');
  assert.equal(next['src/main.py'], files['src/app.py']);
  assert.equal(next['src/app.py'], undefined);
  assert.equal(Object.keys(next).length, Object.keys(files).length);
  assert.equal(renameFileKey(files, 'a', 'a'), files, 'تغییر نام بدون تغییر باید همان آبجکت را برگرداند');
});

test('highlight کد را هایلایت می‌کند و HTML را امن نگه می‌دارد', () => {
  const html = highlight('const x = 1; // hi', 'typescript');
  assert.match(html, /<span class="tok-/, 'هیچ توکنی هایلایت نشد');
  assert.match(html, /tok-com/);
  const escaped = highlight('<script>alert(1)</script>', 'typescript');
  assert.equal(escaped.includes('<script>'), false, 'خروجی هایلایت باید escape شود');
  // تگ‌ها ممکن است بین توکن‌ها شکسته شوند، پس وجود «&lt;» کافی است
  assert.match(escaped, /&lt;/);
  assert.equal(escaped.includes('&gt;'), true);
});

test('highlight برای زبان‌های مختلف خروجی معنی‌دار می‌دهد', () => {
  const py = highlight('def f(x):\n    return "s"', 'python');
  assert.match(py, /tok-kw/);
  assert.match(py, /tok-str/);
  const md = highlight('# title\n**bold**', 'markdown');
  assert.match(md, /tok-head/);
  assert.equal(highlight('plain text', 'text').includes('tok-'), false);
  assert.equal(lineCount('a\nb\nc'), 3);
  assert.equal(lineCount(''), 1);
});
