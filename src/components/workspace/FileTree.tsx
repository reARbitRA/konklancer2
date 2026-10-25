import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson2,
  Folder,
  FolderOpen,
  FileText,
  FileType2,
  Hash,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { allFolderPaths, fileKind, formatBytes, type FileTreeNode } from './fileTree';

interface FileTreeProps {
  nodes: FileTreeNode[];
  activePath: string | null;
  dirtyPaths?: Set<string>;
  onOpen: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onNewFile: (folder: string) => void;
  /** وقتی جست‌وجو فعال است، همه‌ی شاخه‌ها باز می‌مانند. */
  forceExpanded?: boolean;
}

const KIND_STYLE: Record<string, { icon: React.ElementType; className: string }> = {
  py: { icon: FileCode2, className: 'text-sky-400' },
  ts: { icon: FileType2, className: 'text-blue-400' },
  js: { icon: FileType2, className: 'text-amber-300' },
  json: { icon: FileJson2, className: 'text-yellow-300' },
  md: { icon: FileText, className: 'text-slate-300' },
  html: { icon: Hash, className: 'text-orange-400' },
  css: { icon: Hash, className: 'text-pink-400' },
  sh: { icon: FileCode2, className: 'text-emerald-400' },
  yaml: { icon: FileText, className: 'text-violet-300' },
  txt: { icon: FileText, className: 'text-slate-400' },
};

interface RowProps {
  node: FileTreeNode;
  depth: number;
  activePath: string | null;
  dirtyPaths?: Set<string>;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onOpen: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
  onNewFile: (folder: string) => void;
  forceExpanded?: boolean;
}

const Row: React.FC<RowProps> = ({
  node,
  depth,
  activePath,
  dirtyPaths,
  expanded,
  toggle,
  onOpen,
  onRename,
  onDelete,
  onNewFile,
  forceExpanded,
}) => {
  const isFolder = node.type === 'folder';
  const isOpen = forceExpanded || expanded.has(node.path);
  const isActive = !isFolder && activePath === node.path;
  const dirty = dirtyPaths?.has(node.path);
  const style = KIND_STYLE[fileKind(node.path)] ?? KIND_STYLE.txt;
  const FileIcon = style.icon;
  const Chevron = isOpen ? ChevronDown : ChevronRight;

  return (
    <div>
      <div
        className={`group flex h-[26px] items-center gap-1 rounded-md pe-1 text-[12px] transition-colors ${
          isActive
            ? 'bg-emerald-500/12 text-emerald-100 shadow-[inset_2px_0_0_0_rgba(52,211,153,0.75)]'
            : 'text-slate-300 hover:bg-slate-800/50'
        }`}
        style={{ paddingInlineStart: `${6 + depth * 12}px` }}
        dir="ltr"
      >
        <button
          type="button"
          onClick={() => (isFolder ? toggle(node.path) : onOpen(node.path))}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title={node.path}
        >
          {isFolder ? (
            <>
              <Chevron className="h-3 w-3 shrink-0 text-slate-500" />
              {isOpen ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-amber-300/70" />
              )}
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              <FileIcon className={`h-3.5 w-3.5 shrink-0 ${style.className}`} />
            </>
          )}
          <span className={`truncate ${dirty ? 'italic text-amber-200' : ''}`}>{node.name}</span>
          {isFolder && (
            <span className="ms-1 text-[10px] tabular-nums text-slate-600 group-hover:text-slate-500">
              {node.children.length}
            </span>
          )}
          {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-label="تغییر ذخیره‌نشده" />}
        </button>

        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          {isFolder ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onNewFile(node.path);
              }}
              className="rounded p-0.5 text-slate-500 hover:bg-slate-700/60 hover:text-emerald-300"
              title="فایل جدید در این پوشه"
            >
              <Plus className="h-3 w-3" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRename(node.path);
                }}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-700/60 hover:text-sky-300"
                title="تغییر نام"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(node.path);
                }}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-700/60 hover:text-red-300"
                title="حذف فایل"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </span>

        {!isFolder && node.size !== undefined && (
          <span className="shrink-0 font-mono text-[9px] text-slate-600 group-hover:hidden">
            {formatBytes(node.size)}
          </span>
        )}
      </div>

      {isFolder && isOpen && (
        <div>
          {node.children.map((child) => (
            <Row
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              dirtyPaths={dirtyPaths}
              expanded={expanded}
              toggle={toggle}
              onOpen={onOpen}
              onRename={onRename}
              onDelete={onDelete}
              onNewFile={onNewFile}
              forceExpanded={forceExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  activePath,
  dirtyPaths,
  onOpen,
  onRename,
  onDelete,
  onNewFile,
  forceExpanded = false,
}) => {
  const folders = useMemo(() => allFolderPaths(nodes), [nodes]);
  const knownRef = useRef<Set<string>>(new Set(folders));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(folders));

  // فقط پوشه‌های تازه باز می‌شوند؛ پوشه‌هایی که کاربر بسته است بسته می‌مانند (مثل VS Code).
  useEffect(() => {
    const fresh = folders.filter((folder) => !knownRef.current.has(folder));
    if (fresh.length === 0) return;
    fresh.forEach((folder) => knownRef.current.add(folder));
    setExpanded((current) => {
      const next = new Set(current);
      fresh.forEach((folder) => next.add(folder));
      return next;
    });
  }, [folders]);

  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  if (nodes.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[11px] leading-relaxed text-slate-500">
        هنوز فایلی تولید نشده است.
        <br />
        از دکمه‌ی «تولید سورس» شروع کنید یا فایل جدید بسازید.
      </div>
    );
  }

  return (
    <div className="py-1" dir="ltr">
      {nodes.map((node) => (
        <Row
          key={node.path}
          node={node}
          depth={0}
          activePath={activePath}
          dirtyPaths={dirtyPaths}
          expanded={expanded}
          toggle={toggle}
          onOpen={onOpen}
          onRename={onRename}
          onDelete={onDelete}
          onNewFile={onNewFile}
          forceExpanded={forceExpanded}
        />
      ))}
    </div>
  );
};
