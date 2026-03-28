import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      ref={overlayRef}
    >
      <div
        className="relative w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg animate-in zoom-in-95 fade-in duration-150"
        role="dialog"
      >
        {title ? (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={onClose}
              type="button"
            >
              <svg
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
    document.body
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

export function ConfirmDialog({
  message,
  onClose,
  onConfirm,
  open,
  title,
}: ConfirmDialogProps): JSX.Element {
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
