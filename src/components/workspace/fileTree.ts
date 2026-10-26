/**
 * ابزارهای درخت فایل، تشخیص زبان و جست‌وجوی داخل پروژه برای ورک‌اسپیس کد.
 * همه چیز خالص (pure) است تا در UI با useMemo قابل استفاده باشد.
 */

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children: FileTreeNode[];
  size?: number;
}

export interface SearchMatch {
  line: number;
  column: number;
  text: string;
}

export interface FileSearchHit {
  path: string;
  matches: SearchMatch[];
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const normalize = (raw: string) => raw.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/{2,}/g, '/');

/** ساخت درخت پوشه/فایل از فهرست مسیرهای تخت. */
export function buildFileTree(files: Record<string, string>): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', type: 'folder', children: [] };

  for (const [rawPath, content] of Object.entries(files)) {
    const full = normalize(rawPath);
    if (!full) continue;
    const parts = full.split('/').filter(Boolean);
    let current = root;
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      const path = current.path ? `${current.path}/${part}` : part;
      let next = current.children.find((child) => child.name === part && child.type === (isLeaf ? 'file' : 'folder'));
      if (!next) {
        next = {
          name: part,
          path,
          type: isLeaf ? 'file' : 'folder',
          children: [],
          size: isLeaf ? new TextEncoder().encode(content).length : undefined,
        };
        current.children.push(next);
      }
      current = next;
    });
  }

  const sort = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return collator.compare(a.name, b.name);
    });
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}

/** همه‌ی پوشه‌ها را باز می‌کند (برای دکمه‌ی «باز کردن همه»). */
export function allFolderPaths(nodes: FileTreeNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'folder') {
      acc.push(node.path);
      allFolderPaths(node.children, acc);
    }
  }
  return acc;
}

export function countFiles(nodes: FileTreeNode[]): number {
  return nodes.reduce((total, node) => (node.type === 'file' ? total + 1 : total + countFiles(node.children)), 0);
}

export function everyFile(nodes: FileTreeNode[], acc: FileTreeNode[] = []): FileTreeNode[] {
  for (const node of nodes) {
    if (node.type === 'file') acc.push(node);
    else everyFile(node.children, acc);
  }
  return acc;
}

export type CodeLanguage =
  | 'python'
  | 'typescript'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'html'
  | 'css'
  | 'shell'
  | 'yaml'
  | 'sql'
  | 'text';

export const LANGUAGE_LABEL: Record<CodeLanguage, string> = {
  python: 'Python',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  json: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  shell: 'Shell',
  yaml: 'YAML',
  sql: 'SQL',
  text: 'Plain Text',
};

export function languageOf(path: string): CodeLanguage {
  const lower = path.toLowerCase();
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.tsx') || lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.jsx') || lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 'markdown';
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.vue') || lower.endsWith('.svelte')) return 'html';
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) return 'css';
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) return 'shell';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.sql')) return 'sql';
  return 'text';
}

/** نوع نمایش آیکن بر اساس پسوند. */
export function fileKind(path: string): 'py' | 'ts' | 'js' | 'json' | 'md' | 'html' | 'css' | 'sh' | 'yaml' | 'txt' {
  const language = languageOf(path);
  switch (language) {
    case 'python':
      return 'py';
    case 'typescript':
      return 'ts';
    case 'javascript':
      return 'js';
    case 'json':
      return 'json';
    case 'markdown':
      return 'md';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'shell':
      return 'sh';
    case 'yaml':
      return 'yaml';
    default:
      return 'txt';
  }
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * جست‌وجوی متن داخل فایل‌های پروژه. حساسیت به بزرگی/کوچکی حروف ندارد،
 * نتیجه به‌صورت خط‌به‌خط برمی‌گردد و برای هر فایل سقف دارد تا UI کند نشود.
 */
export function searchInFiles(
  files: Record<string, string>,
  query: string,
  options: { maxPerFile?: number; maxFiles?: number } = {},
): FileSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const maxPerFile = options.maxPerFile ?? 20;
  const maxFiles = options.maxFiles ?? 40;
  const hits: FileSearchHit[] = [];

  for (const [path, content] of Object.entries(files)) {
    const matches: SearchMatch[] = [];
    content.split('\n').forEach((line, index) => {
      if (matches.length >= maxPerFile) return;
      const column = line.toLowerCase().indexOf(needle);
      if (column >= 0) {
        matches.push({ line: index + 1, column: column + 1, text: line.trim().slice(0, 220) });
      }
    });
    if (matches.length > 0) {
      hits.push({ path, matches });
      if (hits.length >= maxFiles) break;
    }
  }
  return hits;
}

/** مقدار پیشنهادی برای مسیر فایل جدید، با جلوگیری از نام تکراری. */
export function uniquePath(files: Record<string, string>, folder: string, base = 'file'): string {
  const extension = base.includes('.') ? '' : '.py';
  const stem = base.includes('.') ? base.replace(/\.[^.]+$/, '') : base;
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : extension;
  let index = 1;
  let candidate = `${folder ? `${folder}/` : ''}${stem}${ext}`;
  while (files[candidate] !== undefined) {
    index += 1;
    candidate = `${folder ? `${folder}/` : ''}${stem}-${index}${ext}`;
  }
  return candidate;
}

/** بررسی معتبر بودن مسیر فایل (هم‌راستا با sanitizeSolutionFiles در سرور). */
export function isValidFilePath(path: string): boolean {
  const raw = String(path ?? '').trim();
  // اعتبارسنجی روی مسیر خام انجام می‌شود؛ normalize مسیر مطلق را به نسبی
  // تبدیل می‌کرد و باعث می‌شد «/etc/passwd» معتبر شمرده شود.
  if (!raw || raw.startsWith('/') || raw.startsWith('\\') || raw.includes('..') || /^[A-Za-z]:/.test(raw)) return false;
  const clean = normalize(raw).trim();
  if (!clean || clean.startsWith('/') || clean.includes('..')) return false;
  if (!/^[\w\-./@()\u0600-\u06FF ]+$/.test(clean)) return false;
  return /\.[A-Za-z0-9]+$/.test(clean);
}

/** حذف/تغییر مسیر یک فایل و به‌روزرسانی کلیدها. */
export function renameFileKey(
  files: Record<string, string>,
  from: string,
  to: string,
): Record<string, string> {
  if (from === to) return files;
  const next: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    next[path === from ? to : path] = content;
  }
  return next;
}
