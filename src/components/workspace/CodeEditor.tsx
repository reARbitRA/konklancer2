import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { highlight } from './highlight';
import { languageOf, type CodeLanguage } from './fileTree';

interface CodeEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  onCursorChange?: (info: { line: number; column: number; selected: number }) => void;
  /** خطی که باید نمایش داده/انتخاب شود (برای رفتن از نتایج جست‌وجو). */
  revealLine?: number | null;
  onRevealHandled?: () => void;
  readOnly?: boolean;
}

const LINE_HEIGHT = 20;
const PAD_TOP = 12;

const LANGUAGE_COMMENT: Partial<Record<CodeLanguage, string>> = {
  python: '# ',
  shell: '# ',
  yaml: '# ',
  typescript: '// ',
  javascript: '// ',
  json: '// ',
  css: '',
  html: '',
  sql: '-- ',
  markdown: '',
  text: '',
};

function cursorInfo(value: string, position: number) {
  const before = value.slice(0, position);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines[lines.length - 1] ?? '').length + 1 };
}

/** ادیتور سبک: textarea شفاف روی لایه‌ی هایلایت، با شماره خط، تب و میان‌برهای حرفه‌ای. */
export const CodeEditor: React.FC<CodeEditorProps> = ({
  path,
  value,
  onChange,
  onSave,
  onCursorChange,
  revealLine,
  onRevealHandled,
  readOnly = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const gutterInnerRef = useRef<HTMLDivElement | null>(null);
  const [activeLine, setActiveLine] = useState(1);

  const language = useMemo(() => languageOf(path), [path]);
  const highlighted = useMemo(() => highlight(value, language), [value, language]);
  const lines = useMemo(() => {
    const count = value.split('\n').length;
    return Array.from({ length: count }, (_, index) => index + 1);
  }, [value]);

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (preRef.current) {
      preRef.current.scrollTop = textarea.scrollTop;
      preRef.current.scrollLeft = textarea.scrollLeft;
    }
    if (gutterInnerRef.current) {
      gutterInnerRef.current.style.transform = `translateY(${-textarea.scrollTop}px)`;
    }
  }, []);

  const reportCursor = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const info = cursorInfo(textarea.value, textarea.selectionStart);
    setActiveLine(info.line);
    onCursorChange?.({ ...info, selected: Math.abs(textarea.selectionEnd - textarea.selectionStart) });
  }, [onCursorChange]);

  useEffect(() => {
    reportCursor();
  }, [path, reportCursor, value.length]);

  useLayoutEffect(() => {
    if (!revealLine) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const allLines = textarea.value.split('\n');
    const target = Math.max(1, Math.min(revealLine, allLines.length));
    let position = 0;
    for (let index = 0; index < target - 1; index += 1) position += allLines[index].length + 1;
    textarea.focus();
    textarea.setSelectionRange(position, position);
    textarea.scrollTop = Math.max(0, (target - 1) * LINE_HEIGHT - textarea.clientHeight / 2 + LINE_HEIGHT);
    syncScroll();
    reportCursor();
    onRevealHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealLine]);

  const replaceSelection = (nextValue: string, caret: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.setSelectionRange(caret, caret);
      reportCursor();
    });
  };

  const indentSelection = (outdent: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) {
      if (outdent) {
        const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
        const head = textarea.value.slice(lineStart, start);
        const trimmed = head.replace(/ {2}$/, '');
        const next = textarea.value.slice(0, lineStart) + trimmed + textarea.value.slice(start);
        replaceSelection(next, start - (head.length - trimmed.length));
      } else {
        replaceSelection(value.slice(0, start) + '  ' + value.slice(end), start + 2);
      }
      return;
    }
    const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
    const block = textarea.value.slice(lineStart, end);
    const updated = outdent
      ? block.replace(/^ {1,2}/gm, '')
      : block.replace(/^/gm, '  ');
    const next = textarea.value.slice(0, lineStart) + updated + textarea.value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      textarea.setSelectionRange(lineStart, lineStart + updated.length);
      reportCursor();
    });
  };

  const toggleComment = () => {
    const prefix = LANGUAGE_COMMENT[language];
    if (!prefix) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
    const lineEndRaw = textarea.value.indexOf('\n', end);
    const lineEnd = lineEndRaw === -1 ? textarea.value.length : lineEndRaw;
    const block = textarea.value.slice(lineStart, lineEnd);
    const rows = block.split('\n');
    const allCommented = rows.filter(Boolean).every((row) => row.trimStart().startsWith(prefix.trim()));
    const updated = rows
      .map((row) => {
        if (!row.trim()) return row;
        if (allCommented) {
          const index = row.indexOf(prefix.trim());
          const cut = index >= 0 ? index + prefix.trim().length : 0;
          return (row.slice(0, index) + row.slice(cut)).replace(/^\s+/, (spaces) => spaces.slice(0, Math.max(0, spaces.length - 1)));
        }
        const leading = row.match(/^\s*/)?.[0] ?? '';
        return `${leading}${prefix}${row.slice(leading.length)}`;
      })
      .join('\n');
    onChange(textarea.value.slice(0, lineStart) + updated + textarea.value.slice(lineEnd));
    requestAnimationFrame(() => {
      textarea.setSelectionRange(lineStart, lineStart + updated.length);
      reportCursor();
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const meta = event.metaKey || event.ctrlKey;

    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      onSave?.();
      return;
    }
    if (meta && event.key === '/') {
      event.preventDefault();
      toggleComment();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      indentSelection(event.shiftKey);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = value.slice(0, start);
      const lineStart = before.lastIndexOf('\n') + 1;
      const leading = before.slice(lineStart).match(/^\s*/)?.[0] ?? '';
      const previousLine = before.slice(lineStart).trimEnd();
      const extra = /[:{[(]$/.test(previousLine) ? '  ' : '';
      const insert = `\n${leading}${extra}`;
      const next = value.slice(0, start) + insert + value.slice(end);
      replaceSelection(next, start + insert.length);
      return;
    }
    if (event.key === 'Backspace') {
      const start = textarea.selectionStart;
      if (start === textarea.selectionEnd && start > 0) {
        const before = value.slice(0, start);
        const lineStart = before.lastIndexOf('\n') + 1;
        const head = before.slice(lineStart);
        if (/^ {2}$/.test(head)) {
          event.preventDefault();
          replaceSelection(value.slice(0, lineStart) + value.slice(start), lineStart);
        }
      }
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#0a0a0a]" dir="ltr">
      <div
        ref={gutterRef}
        className="code-gutter relative w-[48px] shrink-0 select-none overflow-hidden py-3 text-right"
        aria-hidden="true"
      >
        <div ref={gutterInnerRef} className="will-change-transform">
          {lines.map((line) => (
            <div
              key={line}
              className={`pr-2.5 pl-1 tabular-nums transition-colors ${
                line === activeLine ? 'code-gutter__active' : 'text-[#6b6b6b]'
              }`}
            >
              {line}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-[2px] bg-[#FFDE03]" />
      </div>

      <div className="relative min-w-0 flex-1">
        <pre
          ref={preRef}
          aria-hidden="true"
          className="code-surface pointer-events-none absolute inset-0 m-0 overflow-hidden p-3"
        >
          <code dangerouslySetInnerHTML={{ __html: `${highlighted}\n` }} />
        </pre>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            reportCursor();
          }}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          onKeyUp={reportCursor}
          onClick={reportCursor}
          onSelect={reportCursor}
          readOnly={readOnly}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          wrap="off"
          aria-label={`ویرایش ${path}`}
          className="code-surface code-input absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-3 outline-none"
        />
      </div>
    </div>
  );
};
