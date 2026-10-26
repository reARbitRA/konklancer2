import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * BrutalModal — the single modal shell used by every dialog in the app.
 * Keeps the neo-brutalist language consistent: hard 3px ink border, offset
 * shadow, ink header bar, paper footer, no rounded corners.
 */
export interface BrutalModalProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  /** Right-hand side of the header (badges, counters…) */
  meta?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Header bar colour */
  variant?: 'ink' | 'accent' | 'electric';
  bodyClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
}

const SIZE_CLASS: Record<NonNullable<BrutalModalProps['size']>, string> = {
  sm: 'max-w-[520px]',
  md: 'max-w-[760px]',
  lg: 'max-w-[1040px]',
  xl: 'max-w-[1280px]',
};

const HEADER_CLASS: Record<NonNullable<BrutalModalProps['variant']>, string> = {
  ink: 'bg-[#0a0a0a] text-[#FFFBF0]',
  accent: 'bg-[#FFDE03] text-[#0a0a0a]',
  electric: 'bg-[#0066FF] text-white',
};

export const BrutalModal: React.FC<BrutalModalProps> = ({
  title,
  subtitle,
  icon: Icon,
  meta,
  onClose,
  children,
  footer,
  size = 'md',
  variant = 'ink',
  bodyClassName = 'p-4 sm:p-5',
  closeOnBackdrop = true,
  closeOnEsc = true,
}) => {
  useEffect(() => {
    if (!closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOnEsc, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${SIZE_CLASS[size]} bg-white border-[3px] border-[#0a0a0a] shadow-[8px_8px_0px_0px_#000] overflow-hidden my-4 sm:my-8 animate-brutal-in flex flex-col max-h-[calc(100vh-2rem)]`}
      >
        {/* Header */}
        <div className={`shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b-[3px] border-[#0a0a0a] ${HEADER_CLASS[variant]}`}>
          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <span className="w-7 h-7 shrink-0 border-[2px] border-current flex items-center justify-center">
                <Icon className="w-4 h-4" />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-[13px] font-black tracking-wide uppercase leading-5 truncate">{title}</h2>
              {subtitle && <p className="text-[11px] font-mono opacity-70 truncate leading-4">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {meta}
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن"
              className="w-8 h-8 bg-white text-[#0a0a0a] border-[2px] border-[#0a0a0a] flex items-center justify-center hover:bg-[#FFDE03] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={`flex-1 min-h-0 overflow-y-auto brutal-scroll bg-white ${bodyClassName}`}>{children}</div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t-[3px] border-[#0a0a0a] bg-[#FFFBF0]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
