import { create } from 'zustand';

export interface ToastMessage {
  description?: string;
  id: string;
  title: string;
  variant?: 'default' | 'destructive' | 'success';
}

interface ToastState {
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  toasts: ToastMessage[];
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  addToast: (toast) => {
    const id = `toast-${++toastCounter}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  toasts: [],
}));

export function useToast(): {
  error: (title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  toast: (title: string, description?: string) => void;
} {
  const addToast = useToastStore((s) => s.addToast);
  return {
    error: (title, description) => addToast({ description, title, variant: 'destructive' }),
    success: (title, description) => addToast({ description, title, variant: 'success' }),
    toast: (title, description) => addToast({ description, title }),
  };
}

export function ToastContainer(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return <></>;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all animate-in slide-in-from-right ${
            toast.variant === 'destructive'
              ? 'border-destructive/50 bg-destructive text-destructive-foreground'
              : toast.variant === 'success'
                ? 'border-green-500/50 bg-green-600 text-white'
                : 'border-border bg-card text-card-foreground'
          }`}
          key={toast.id}
          role="alert"
        >
          {/* Icon */}
          <div className="mt-0.5 shrink-0">
            {toast.variant === 'destructive' ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
              </svg>
            ) : toast.variant === 'success' ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{toast.title}</p>
            {toast.description ? <p className="mt-1 text-xs opacity-90">{toast.description}</p> : null}
          </div>
          <button
            className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100"
            onClick={() => removeToast(toast.id)}
            type="button"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
