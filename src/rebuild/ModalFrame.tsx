import React, { useEffect, useRef, useState } from 'react';

/** Dialog focus containment and restoration for keyboard users. */
export default function ModalFrame({children, onClose, label}:{children:React.ReactNode; onClose:()=>void; label:string}) {
  const ref = useRef<HTMLDivElement>(null);
  const [previous] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const root = ref.current;
    const focusable = () => Array.from(root?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') || []);
    (focusable()[0] || root)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); root?.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !root?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); if (previous?.isConnected) previous.focus(); };
  }, [previous]);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="dialog-frame" ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onMouseDown={e=>e.stopPropagation()}>{children}</div></div>;
}
