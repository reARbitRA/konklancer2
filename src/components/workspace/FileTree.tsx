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
  py: { icon: FileCode2, className: 'text-[#0066FF]' },
  ts: { icon: FileType2, className: 'text-[#0066FF]' },
  js: { icon: FileType2, className: 'text-[#7a5c00]' },
  json: { icon: FileJson2, className: 'text-[#7a5c00]' },
  md: { icon: FileText, className: 'text-[#333333]' },
  html: { icon: Hash, className: 'text-[#FF4D00]' },
  css: { icon: Hash, className: 'text-[#8B5CF6]' },
  sh: { icon: FileCode2, className: 'text-[#00875A]' },
  yaml: { icon: FileText, className: 'text-[#8B5CF6]' },
  txt: { icon: FileText, className: 'text-[#555555]' },
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
        className={`group flex h-[26px] items-center gap-1 border-[2px] pe-1 text-[12px] transition-colors ${
          isActive
            ? 'border-[#0a0a0a] bg-[#FFDE03] font-bold text-[#0a0a0a]'
            : 'border-transparent text-[#0a0a0a] hover:border-[#0a0a0a] hover:bg-[#F6F0E0]'
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
              <Chevron className="h-3 w-3 shrink-0 text-[#0a0a0a]" />
              {isOpen ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#7a5c00]" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-[#7a5c00]" />
              )}
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              <FileIcon className={`h-3.5 w-3.5 shrink-0 ${style.className}`} />
            </>
          )}
          <span className={`truncate ${dirty ? 'italic underline decoration-[#FF4D00] decoration-2 underline-offset-2' : ''}`}>{node.name}</span>
          {isFolder && (
            <span className="ms-1 text-[10px] font-bold tabular-nums text-[#555555] group-hover:text-[#0a0a0a]">
              {node.children.length}
            </span>
          )}
          {dirty && <span className="h-2 w-2 shrink-0 border-2 border-[#0a0a0a] bg-[#FF4D00]" aria-label="ویرایش‌شده در این نشست" />}
        </button>

        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          {isFolder ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onNewFile(node.path);
              }}
              className="border-[2px] border-transparent p-0.5 text-[#555555] hover:border-[#0a0a0a] hover:bg-[#00E599] hover:text-[#0a0a0a]"
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
                className="border-[2px] border-transparent p-0.5 text-[#555555] hover:border-[#0a0a0a] hover:bg-[#0066FF] hover:text-white"
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
                className="border-[2px] border-transparent p-0.5 text-[#555555] hover:border-[#0a0a0a] hover:bg-[#FF3B30] hover:text-white"
                title="حذف فایل"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </span>

        {!isFolder && node.size !== undefined && (
          <span className="shrink-0 font-mono text-[9px] font-bold text-[#777777] group-hover:hidden">
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
      <div className="px-3 py-6 text-center text-[11px] leading-relaxed font-bold text-[#555555]">
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
