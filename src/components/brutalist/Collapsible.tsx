import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface BrutalCollapsibleProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  badge?: string | number;
  badgeVariant?: 'accent' | 'ink' | 'electric' | 'mint' | 'orange' | 'violet';
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  variant?: 'default' | 'accent' | 'ink' | 'electric';
  collapsible?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  storageKey?: string;
}

export const BrutalCollapsible: React.FC<BrutalCollapsibleProps> = ({
  title,
  subtitle,
  icon: Icon,
  badge,
  badgeVariant = 'accent',
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  variant = 'default',
  collapsible = true,
  actions,
  children,
  className = '',
  storageKey,
}) => {
  const [internalOpen, setInternalOpen] = useState(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`brutal-collapse:${storageKey}`);
        if (saved !== null) return saved === '1';
      } catch {}
    }
    return defaultOpen;
  });
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : internalOpen;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    if (storageKey) {
      try { localStorage.setItem(`brutal-collapse:${storageKey}`, next ? '1' : '0'); } catch {}
    }
    onToggle?.(next);
  };

  const headerBg =
    variant === 'accent' ? 'bg-[#FFDE03] text-[#0a0a0a]' :
    variant === 'ink' ? 'bg-[#0a0a0a] text-[#FFFBF0]' :
    variant === 'electric' ? 'bg-[#0066FF] text-white' :
    'bg-white text-[#0a0a0a]';

  const headerClass = `w-full flex items-center justify-between gap-3 px-4 py-3 border-b-[2.5px] border-[#0a0a0a] text-left transition-colors ${headerBg} ${collapsible ? 'cursor-pointer hover:brightness-[0.98]' : ''}`;

  return (
    <div className={`brutal-panel overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={collapsible ? toggle : undefined}
        className={headerClass}
        style={{ cursor: collapsible ? 'pointer' : 'default' }}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {Icon && (
            <div className={`w-8 h-8 shrink-0 border-[2px] border-[#0a0a0a] flex items-center justify-center ${variant === 'ink' ? 'bg-white text-black' : 'bg-[#0a0a0a] text-white'}`}>
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0 text-right">
            <div className="text-[12px] font-black tracking-[0.05em] uppercase leading-none truncate">{title}</div>
            {subtitle && <div className="text-[11px] font-medium opacity-70 mt-0.5 truncate normal-case tracking-normal">{subtitle}</div>}
          </div>
          {badge !== undefined && (
            <span className={`brutal-badge brutal-badge--${badgeVariant} shrink-0`}>{badge}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions && <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5">{actions}</span>}
          {collapsible && (
            <span className={`w-7 h-7 border-[2px] border-[#0a0a0a] flex items-center justify-center shrink-0 transition-transform ${open ? 'bg-[#0a0a0a] text-white' : 'bg-white text-[#0a0a0a]'}`}>
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          )}
        </div>
      </button>

      {open && (
        <div className="overflow-hidden animate-brutal-in">
          <div className="p-4 bg-white">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

// Compact header-only collapsible for dense layouts
export const BrutalSectionToggle: React.FC<{
  label: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  icon?: React.ElementType;
}> = ({ label, count, open, onToggle, icon: Icon }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 border-[2px] border-[#0a0a0a] text-[11px] font-black uppercase tracking-widest transition-all ${open ? 'bg-[#0a0a0a] text-white shadow-[2px_2px_0px_0px_#0a0a0a]' : 'bg-white text-[#0a0a0a] hover:bg-[#FFFBF0]'}`}
  >
    <span className="flex items-center gap-2">
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
      {count !== undefined && <span className={`px-1.5 py-0.5 text-[10px] font-mono border ${open ? 'bg-white text-black border-white' : 'bg-[#FFDE03] text-black border-black'}`}>{count}</span>}
    </span>
    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
  </button>
);
