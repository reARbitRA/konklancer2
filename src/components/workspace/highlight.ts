/**
 * هایلایت سبک و بدون وابستگی برای ادیتور کد.
 * ورودی متن خام است و خروجی HTML امن (escape‌شده) با spanهای رنگی.
 * هیچ کتابخانه‌ای اضافه نمی‌کند و برای فایل‌های چند صد کیلوبایتی هم سریع است.
 */
import type { CodeLanguage } from './fileTree';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const PY_KEYWORDS =
  'def|class|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|import|from|as|with|try|except|finally|raise|yield|lambda|pass|break|continue|global|nonlocal|assert|del|async|await|match|case';
const JS_KEYWORDS =
  'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|super|import|from|export|default|try|catch|finally|throw|typeof|instanceof|in|of|await|async|yield|interface|type|enum|implements|public|private|readonly|static|get|set|null|undefined|true|false|void|this|delete';
const SH_KEYWORDS = 'if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|local|echo|cd|pip|python3?|npm|npx|git|mkdir|cp|mv|rm|cat|chmod|set';
const SQL_KEYWORDS =
  'select|from|where|insert|into|values|update|set|delete|create|table|alter|drop|join|left|right|inner|outer|group|by|order|having|limit|offset|and|or|not|null|primary|key|foreign|references|as|distinct|count|sum|avg|on';

interface Bucket {
  com?: string;
  str?: string;
  num?: string;
  kw?: string;
  fn?: string;
  type?: string;
  prop?: string;
  tag?: string;
  head?: string;
  op?: string;
  tail?: string;
}

function master(bucket: Bucket): RegExp {
  const parts = Object.entries(bucket)
    .filter(([, pattern]) => Boolean(pattern))
    .map(([name, pattern]) => `(?<${name}>${pattern})`);
  // بدون فلگ «y» (sticky): با sticky، exec بعد از اولین توکن در صورت
  // عدم تطابق دقیق در همان ایندکس متوقف می‌شد و بقیه‌ی خط رنگ نمی‌گرفت.
  // بدون فلگ «i»: با i، الگوی «\b[A-Z]...» با حروف کوچک هم تطابق می‌یافت و
  // همه‌ی شناسه‌ها رنگ «type» می‌گرفتند؛ کلیدواژه‌ها خودشان هر دو حالت را دارند.
  return new RegExp(parts.join('|'), 'gms');
}

const RULES: Record<CodeLanguage, { regex: RegExp }> = {
  python: {
    regex: master({
      com: '#[^\\n]*',
      str: '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|(?:[rbfuRBFU]{0,2})"(?:\\\\.|[^"\\\\\\n])*"|(?:[rbfuRBFU]{0,2})\'(?:\\\\.|[^\'\\\\\\n])*\'',
      num: '\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b',
      kw: `\\b(?:${PY_KEYWORDS})\\b`,
      type: '\\b(?:str|int|float|bool|list|dict|set|tuple|bytes|object|Exception|ValueError|TypeError|KeyError|Path|DataFrame|Series)\\b',
      fn: '\\b[A-Za-z_]\\w*(?=\\s*\\()',
      op: '->|==|!=|<=|>=|:=|[+\\-*/%=<>!&|^~:]',
    }),
  },
  typescript: {
    regex: master({
      com: '//[^\\n]*|/\\*[\\s\\S]*?\\*/',
      str: '`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'',
      num: '\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b',
      kw: `\\b(?:${JS_KEYWORDS})\\b`,
      type: '\\b(?:string|number|boolean|any|unknown|never|object|Record|Array|Promise|React|JSX|HTMLElement|Response|Request|Error)\\b|\\b[A-Z][A-Za-z0-9_]*\\b',
      fn: '\\b[A-Za-z_$][\\w$]*(?=\\s*\\()',
      op: '=>|===|!==|==|!=|<=|>=|&&|\\|\\||[+\\-*/%=<>!&|^~?:]',
    }),
  },
  javascript: {
    regex: master({
      com: '//[^\\n]*|/\\*[\\s\\S]*?\\*/',
      str: '`(?:\\\\.|[^`\\\\])*`|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'',
      num: '\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b',
      kw: `\\b(?:${JS_KEYWORDS})\\b`,
      type: '\\b[A-Z][A-Za-z0-9_]*\\b',
      fn: '\\b[A-Za-z_$][\\w$]*(?=\\s*\\()',
      op: '=>|===|!==|==|!=|<=|>=|&&|\\|\\||[+\\-*/%=<>!&|^~?:]',
    }),
  },
  json: {
    regex: master({
      str: '"(?:\\\\.|[^"\\\\])*"(?=\\s*:)',
      num: '-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b',
      kw: '\\b(?:true|false|null)\\b',
      tail: '"(?:\\\\.|[^"\\\\])*"',
    }),
  },
  markdown: {
    regex: master({
      com: '<!--[\\s\\S]*?-->',
      str: '^```[\\s\\S]*?^```',
      head: '^#{1,6} [^\\n]*',
      kw: '^\\s*(?:[-*+] |\\d+\\. )',
      tag: '\\*\\*[^*\\n]+\\*\\*|__[^_\\n]+__|`[^`\\n]+`',
      type: '\\[[^\\]\\n]+\\]\\([^)\\n]+\\)',
      op: '^> .*$|^---+$',
    }),
  },
  html: {
    regex: master({
      com: '<!--[\\s\\S]*?-->',
      str: '"[^"]*"|\'[^\']*\'',
      tag: '</?[A-Za-z][\\w:-]*|/?>',
      kw: '\\b(?:class|id|href|src|alt|style|type|name|value|placeholder|rel|target)\\b',
      num: '\\b\\d+(?:\\.\\d+)?\\b',
    }),
  },
  css: {
    regex: master({
      com: '/\\*[\\s\\S]*?\\*/',
      str: '"[^"\\n]*"|\'[^\'\\n]*\'',
      kw: '@[\\w-]+|#[0-9a-fA-F]{3,8}\\b',
      prop: '[-a-zA-Z]+(?=\\s*:)',
      num: '\\b\\d+(?:\\.\\d+)?(?:px|rem|em|%|vh|vw|s|ms|fr|deg)?\\b',
      tag: '[.#][-\\w]+',
    }),
  },
  shell: {
    regex: master({
      com: '#[^\\n]*',
      str: '"(?:\\\\.|[^"\\\\])*"|\'[^\']*\'',
      kw: `\\b(?:${SH_KEYWORDS})\\b`,
      type: '\\$\\{?\\w+\\}?',
      num: '\\b\\d+\\b',
      op: '--?[\\w-]+|[|&;<>]',
    }),
  },
  yaml: {
    regex: master({
      com: '#[^\\n]*',
      str: '"[^"\\n]*"|\'[^\'\\n]*\'',
      prop: '^\\s*[\\w.-]+(?=\\s*:)',
      kw: '\\b(?:true|false|null|yes|no|on|off)\\b',
      num: '\\b\\d+(?:\\.\\d+)?\\b',
      op: '^\\s*- |[|>&*]',
    }),
  },
  sql: {
    regex: master({
      com: '--[^\\n]*|/\\*[\\s\\S]*?\\*/',
      str: "'(?:''|[^'])*'",
      // SQL معمولاً با حروف بزرگ نوشته می‌شود؛ هر دو حالت پوشش داده می‌شود.
      kw: `\\b(?:${SQL_KEYWORDS}|${SQL_KEYWORDS.toUpperCase()})\\b`,
      num: '\\b\\d+(?:\\.\\d+)?\\b',
      fn: '\\b[A-Za-z_]\\w*(?=\\s*\\()',
      op: '[=<>!+*/%-]',
    }),
  },
  text: {
    regex: master({
      num: '\\b\\d+(?:\\.\\d+)?\\b',
      tag: 'https?://\\S+',
    }),
  },
};

const CLASS_OF: Record<string, string> = {
  com: 'tok-com',
  str: 'tok-str',
  num: 'tok-num',
  kw: 'tok-kw',
  fn: 'tok-fn',
  type: 'tok-type',
  prop: 'tok-prop',
  tag: 'tok-tag',
  head: 'tok-head',
  op: 'tok-op',
  tail: 'tok-str',
};

const cache = new Map<string, string>();

function hash(value: string): number {
  let h = 5381;
  for (let index = 0; index < value.length; index += 1) {
    h = ((h << 5) + h + value.charCodeAt(index)) | 0;
  }
  return h;
}

export function highlight(code: string, language: CodeLanguage): string {
  const cacheKey = `${language}:${code.length}:${hash(code)}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const rule = RULES[language] ?? RULES.text;
  const regex = rule.regex;
  regex.lastIndex = 0;
  let html = '';
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(code)) !== null) {
    if (match.index > lastIndex) html += escapeHtml(code.slice(lastIndex, match.index));
    const groups = match.groups ?? {};
    let className = 'tok-op';
    for (const [name, value] of Object.entries(groups)) {
      if (value !== undefined) {
        className = CLASS_OF[name] ?? 'tok-op';
        break;
      }
    }
    html += `<span class="${className}">${escapeHtml(match[0])}</span>`;
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) {
      regex.lastIndex += 1;
      lastIndex = regex.lastIndex;
    }
  }
  if (lastIndex < code.length) html += escapeHtml(code.slice(lastIndex));

  if (cache.size > 60) cache.clear();
  cache.set(cacheKey, html);
  return html;
}

/** تعداد خطوط متن؛ برای gutter. */
export function lineCount(value: string): number {
  if (!value) return 1;
  return value.split('\n').length;
}
