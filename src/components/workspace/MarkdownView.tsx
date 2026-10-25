import React, { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** رندر سبک مارک‌داون برای README و مستندات پروژه — بدون وابستگی خارجی. */

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|\[[^\]\n]+\]\([^)\n]+\))/g;

export function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(INLINE.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${match.index}-${token.slice(0, 8)}`;
    if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded border border-slate-700/70 bg-slate-950/80 px-1 py-0.5 font-mono text-[11px] text-emerald-200">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      nodes.push(
        <a
          key={key}
          href={linkMatch?.[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-300 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-200"
        >
          {linkMatch?.[1] ?? token}
        </a>,
      );
    } else {
      nodes.push(
        <em key={key} className="text-slate-300">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group my-3 overflow-hidden rounded-lg border border-slate-800 bg-[#070d18]">
      <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{language || 'code'}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
          className="flex items-center gap-1 text-[10px] text-slate-500 transition-colors hover:text-slate-200"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'کپی شد' : 'کپی'}
        </button>
      </div>
      <pre className="code-surface overflow-x-auto p-3 text-slate-200" dir="ltr">
        <code>{code}</code>
      </pre>
    </div>
  );
};

interface MarkdownViewProps {
  content: string;
  emptyHint?: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, emptyHint }) => {
  const blocks = useMemo(() => {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const nodes: React.ReactNode[] = [];
    let index = 0;
    let key = 0;

    while (index < lines.length) {
      const line = lines[index];

      if (/^```/.test(line.trim())) {
        const language = line.trim().replace(/^```/, '').trim();
        const buffer: string[] = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          buffer.push(lines[index]);
          index += 1;
        }
        index += 1;
        nodes.push(<CodeBlock key={`code-${key++}`} code={buffer.join('\n')} language={language} />);
        continue;
      }

      if (!line.trim()) {
        index += 1;
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        const level = heading[1].length;
        const text = heading[2];
        const sizes: Record<number, string> = {
          1: 'mt-2 mb-3 text-xl font-bold text-white',
          2: 'mt-5 mb-2.5 text-lg font-bold text-white border-b border-slate-800 pb-2',
          3: 'mt-4 mb-2 text-sm font-bold text-emerald-200',
          4: 'mt-3 mb-1.5 text-[13px] font-semibold text-slate-200',
          5: 'mt-3 mb-1 text-xs font-semibold text-slate-300',
          6: 'mt-2 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400',
        };
        nodes.push(
          React.createElement(
            `h${Math.min(6, level)}`,
            { key: `h-${key++}`, className: sizes[level] ?? sizes[4] },
            renderInline(text),
          ),
        );
        index += 1;
        continue;
      }

      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
        nodes.push(<hr key={`hr-${key++}`} className="my-4 border-slate-800" />);
        index += 1;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const buffer: string[] = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) {
          buffer.push(lines[index].replace(/^>\s?/, ''));
          index += 1;
        }
        nodes.push(
          <blockquote
            key={`quote-${key++}`}
            className="my-3 rounded-e-md border-e-2 border-emerald-500/50 bg-emerald-500/5 px-3 py-2 text-[12px] leading-relaxed text-slate-300"
          >
            {renderInline(buffer.join(' '))}
          </blockquote>,
        );
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        const ordered = /^\s*\d+\.\s+/.test(line);
        const items: string[] = [];
        while (index < lines.length && (/^\s*[-*+]\s+/.test(lines[index]) || /^\s*\d+\.\s+/.test(lines[index]))) {
          items.push(lines[index].replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''));
          index += 1;
        }
        nodes.push(
          React.createElement(
            ordered ? 'ol' : 'ul',
            {
              key: `list-${key++}`,
              className: `my-2 space-y-1 ps-5 text-[12px] leading-relaxed text-slate-300 ${
                ordered ? 'list-decimal' : 'list-disc'
              } marker:text-emerald-500/70`,
            },
            items.map((item, itemIndex) => {
              const checkbox = item.match(/^\[( |x|X)\]\s+(.*)$/);
              if (checkbox) {
                return (
                  <li key={itemIndex} className="list-none ps-0">
                    <span className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                          checkbox[1].toLowerCase() === 'x'
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                            : 'border-slate-600'
                        }`}
                      >
                        {checkbox[1].toLowerCase() === 'x' ? <Check className="h-2.5 w-2.5" /> : null}
                      </span>
                      <span>{renderInline(checkbox[2])}</span>
                    </span>
                  </li>
                );
              }
              return <li key={itemIndex}>{renderInline(item)}</li>;
            }),
          ),
        );
        continue;
      }

      const paragraph: string[] = [];
      while (
        index < lines.length &&
        lines[index].trim() &&
        !/^(#{1,6}\s|```|>\s?|\s*[-*+]\s+|\s*\d+\.\s+|\s*(---|\*\*\*|___)\s*$)/.test(lines[index])
      ) {
        paragraph.push(lines[index]);
        index += 1;
      }
      nodes.push(
        <p key={`p-${key++}`} className="my-2 text-[12px] leading-7 text-slate-300">
          {renderInline(paragraph.join(' '))}
        </p>,
      );
    }
    return nodes;
  }, [content]);

  if (!content.trim()) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-xs text-slate-500">
        {emptyHint ?? 'محتوایی برای نمایش وجود ندارد.'}
      </div>
    );
  }

  return <div className="mx-auto w-full max-w-[820px] px-5 py-4">{blocks}</div>;
};
