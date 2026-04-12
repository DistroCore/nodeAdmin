import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIntl } from 'react-intl';

interface DialogProps {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title?: string;
}

export function Dialog({ children, onClose, open, title }: DialogProps): JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    previousActiveElement.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the first focusable element ONLY when the dialog opens
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const firstElement = dialogRef.current.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) as HTMLElement;
        firstElement?.focus();
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
      clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;

  const titleId = title ? `dialog-title-${title.replace(/\s+/g, '-').toLowerCase()}` : undefined;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-in fade-in duration-150 p-0 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      ref={overlayRef}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative h-[90vh] w-full border-border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200 sm:h-auto sm:max-w-lg sm:rounded-lg sm:border sm:slide-in-from-bottom-0 sm:zoom-in-95 overflow-y-auto"
        ref={dialogRef}
        role="dialog"
      >
        {title ? (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold" id={titleId}>
              {title}
            </h2>
            <button
              aria-label="Close dialog"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onClose}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ─── Confirm Dialog ──────────────────────────────────────────────────

interface ConfirmDialogProps {
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}

export function ConfirmDialog({ message, onClose, onConfirm, open, title }: ConfirmDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Dialog onClose={onClose} open={open} title={title}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          onClick={onClose}
          type="button"
        >
          {t({ id: 'common.cancel' })}
        </button>
        <button
          className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
          disabled={loading}
          onClick={handleConfirm}
          type="button"
        >
          {loading ? '...' : t({ id: 'common.confirm' })}
        </button>
      </div>
    </Dialog>
  );
}
