import React, { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { highlight } from './highlight';
import { languageOf } from './fileTree';

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
        <code key={key} className="border-[2px] border-[#0a0a0a] bg-[#0a0a0a] px-1 py-0.5 font-mono text-[11px] text-[#00E599]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <strong key={key} className="font-black text-[#0a0a0a]">
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
          className="font-bold text-[#0066FF] underline decoration-[2px] underline-offset-2 hover:bg-[#FFDE03]"
        >
          {linkMatch?.[1] ?? token}
        </a>,
      );
    } else {
      nodes.push(
        <em key={key} className="text-[#333333]">
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
    <div className="group my-3 overflow-hidden border-[2.5px] border-[#0a0a0a] shadow-[4px_4px_0px_0px_#0a0a0a]">
      <div className="flex items-center justify-between border-b-[2px] border-[#0a0a0a] bg-[#FFDE03] px-3 py-1.5" dir="ltr">
        <span className="font-mono text-[10px] font-black uppercase tracking-wide text-[#0a0a0a]">{language || 'code'}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
          className="flex items-center gap-1 border-[2px] border-[#0a0a0a] bg-white px-1.5 py-0.5 text-[10px] font-black text-[#0a0a0a] hover:bg-[#0a0a0a] hover:text-[#FFDE03]"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'کپی شد' : 'کپی'}
        </button>
      </div>
      <pre className="code-surface overflow-x-auto p-3" dir="ltr">
        <code dangerouslySetInnerHTML={{ __html: highlight(code, languageOf(`x.${language || 'txt'}`)) }} />
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
          1: 'mt-2 mb-3 text-[22px] font-black uppercase tracking-tight text-[#0a0a0a]',
          2: 'mt-5 mb-2.5 text-lg font-black text-[#0a0a0a] border-b-[3px] border-[#0a0a0a] pb-2',
          3: 'mt-4 mb-2 text-sm font-black text-[#00875A]',
          4: 'mt-3 mb-1.5 text-[13px] font-bold text-[#0a0a0a]',
          5: 'mt-3 mb-1 text-xs font-bold text-[#333333]',
          6: 'mt-2 mb-1 text-[11px] font-bold uppercase tracking-wide text-[#555555]',
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
        nodes.push(<hr key={`hr-${key++}`} className="my-4 border-t-[3px] border-[#0a0a0a]" />);
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
            className="my-3 border-s-[6px] border-[#0066FF] bg-[#F6F0E0] px-3 py-2 text-[12px] leading-relaxed text-[#0a0a0a]"
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
              className: `my-2 space-y-1 ps-5 text-[12px] leading-relaxed text-[#0a0a0a] ${
                ordered ? 'list-decimal' : 'list-disc'
              } marker:text-[#FF4D00]`,
            },
            items.map((item, itemIndex) => {
              const checkbox = item.match(/^\[( |x|X)\]\s+(.*)$/);
              if (checkbox) {
                return (
                  <li key={itemIndex} className="list-none ps-0">
                    <span className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center border-[2px] border-[#0a0a0a] ${
                          checkbox[1].toLowerCase() === 'x' ? 'bg-[#00E599] text-[#0a0a0a]' : 'bg-white'
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
        <p key={`p-${key++}`} className="my-2 text-[12px] leading-7 text-[#222222]">
          {renderInline(paragraph.join(' '))}
        </p>,
      );
    }
    return nodes;
  }, [content]);

  if (!content.trim()) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-xs font-bold text-[#555555]">
        {emptyHint ?? 'محتوایی برای نمایش وجود ندارد.'}
      </div>
    );
  }

  return <div className="mx-auto w-full max-w-[820px] px-5 py-4">{blocks}</div>;
};
