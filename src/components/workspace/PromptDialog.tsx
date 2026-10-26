import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, MessageSquare } from 'lucide-react';
import { BrutalModal } from '../brutalist/Modal';

interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  initialValue?: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  /** اگر false باشد ورودی متنی نشان داده نمی‌شود و دیالوگ فقط تأیید می‌گیرد. */
  withInput?: boolean;
  validate?: (value: string) => string | null;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

/**
 * PromptDialog — دیالوگ بروتالیست برای نام‌گذاری/تأیید.
 * جایگزین window.prompt و window.confirm با ظاهر خود برنامه؛ روی
 * BrutalModal سوار است تا با بقیه‌ی دیالوگ‌ها یکدست بماند.
 */
export const PromptDialog: React.FC<PromptDialogProps> = ({
  open,
  title,
  description,
  label,
  initialValue = '',
  confirmLabel = 'تأیید',
  tone = 'default',
  withInput = true,
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
    if (!withInput) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open, initialValue, withInput]);

  if (!open) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!withInput) {
      onConfirm('');
      return;
    }
    const trimmed = value.trim();
    const invalid = validate ? validate(trimmed) : trimmed ? null : 'مقدار نمی‌تواند خالی باشد.';
    if (invalid) {
      setError(invalid);
      return;
    }
    onConfirm(trimmed);
  };

  const danger = tone === 'danger';

  return (
    <BrutalModal
      title={title}
      subtitle={description}
      icon={danger ? AlertTriangle : MessageSquare}
      variant={danger ? 'ink' : 'accent'}
      size="sm"
      onClose={onCancel}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="brutal-btn brutal-btn--ghost border-[2px]">
            انصراف
          </button>
          <button
            type="submit"
            form="prompt-dialog-form"
            className={`brutal-btn ${danger ? 'bg-[#FF3B30] text-white border-black' : 'brutal-btn--primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <form id="prompt-dialog-form" onSubmit={submit} className="space-y-2.5">
        {withInput && (
          <label className="block">
            {label && <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-[#555]">{label}</span>}
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              dir="ltr"
              aria-label={label ?? title}
              className="brutal-input font-mono text-[12px] w-full"
            />
          </label>
        )}
        {error && (
          <p className="flex items-start gap-1 border-[2px] border-[#0a0a0a] bg-[#FF3B30] px-2 py-1 text-[11px] font-bold text-white">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {error}
          </p>
        )}
      </form>
    </BrutalModal>
  );
};
