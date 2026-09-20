import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface ModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}

/**
 * Accessible dialog: focus moves into the panel, Escape closes it, and the
 * backdrop click closes it too. Body scroll is locked while open.
 */
export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn(
          'relative z-10 w-full max-w-md rounded-xl border border-ink-200 bg-white shadow-xl',
          className
        )}
      >
        <div className="px-5 pt-5">
          <h2 id="modal-title" className="text-base font-semibold text-ink-900">
            {title}
          </h2>
          {description ? <div className="mt-1.5 text-sm text-ink-600">{description}</div> : null}
        </div>
        {children ? <div className="px-5 pt-4">{children}</div> : null}
        <div className="mt-5 flex justify-end gap-2 border-t border-ink-200 px-5 py-3">
          {footer}
        </div>
      </div>
    </div>
  );
}
