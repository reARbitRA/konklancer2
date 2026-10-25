import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  initialValue?: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  validate?: (value: string) => string | null;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

/** دیالوگ سبک برای نام‌گذاری/تأیید — جایگزین window.prompt با ظاهر خود برنامه. */
export const PromptDialog: React.FC<PromptDialogProps> = ({
  open,
  title,
  description,
  label,
  initialValue = '',
  confirmLabel = 'تأیید',
  tone = 'default',
  validate,
  onCancel,
  onConfirm,
}) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setError(null);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    const invalid = validate ? validate(trimmed) : trimmed ? null : 'مقدار نمی‌تواند خالی باشد.';
    if (invalid) {
      setError(invalid);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onMouseDown={onCancel}
    >
      <form
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        className="animate-scale-in w-full max-w-sm overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
          <h3 className={`text-xs font-bold ${tone === 'danger' ? 'text-red-300' : 'text-white'}`}>{title}</h3>
          <button type="button" onClick={onCancel} className="icon-btn" aria-label="بستن">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-2.5 px-4 py-3">
          {description && <p className="text-[11px] leading-6 text-slate-400">{description}</p>}
          <label className="block">
            {label && <span className="mb-1 block text-[10px] text-slate-400">{label}</span>}
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              className="field font-mono text-[12px]"
              dir="ltr"
            />
          </label>
          {error && (
            <p className="flex items-start gap-1 text-[10px] text-red-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/40 px-4 py-2.5">
          <button type="button" onClick={onCancel} className="btn">
            انصراف
          </button>
          <button
            type="submit"
            className={`btn ${tone === 'danger' ? 'border-red-500/40 bg-red-500/15 text-red-200' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};
