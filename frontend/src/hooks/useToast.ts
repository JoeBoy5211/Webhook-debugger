import {
  createContext,
  createElement,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState
} from 'react';
import { Toast, ToastType } from '../components/Toast';

interface QueuedToast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const enqueue = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, type, message }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      success: (message: string) => enqueue('success', message),
      error: (message: string) => enqueue('error', message),
      warning: (message: string) => enqueue('warning', message)
    }),
    [enqueue]
  );

  const stack = createElement(
    'div',
    {
      className: 'fixed top-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2',
      role: 'region',
      'aria-live': 'polite',
      'aria-label': 'Notifications'
    },
    toasts.map((toast) =>
      createElement(Toast, {
        key: toast.id,
        message: toast.message,
        type: toast.type,
        stacked: true,
        onClose: () => dismiss(toast.id)
      })
    )
  );

  return createElement(ToastContext.Provider, { value }, children, stack);
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
