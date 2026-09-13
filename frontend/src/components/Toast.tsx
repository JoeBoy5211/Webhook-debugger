import { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, X } from 'lucide-react';
import clsx from 'clsx';

export type ToastType = 'success' | 'error' | 'warning';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  stacked?: boolean;
}

const typeStyles: Record<ToastType, string> = {
  success: 'bg-green-600 border-green-500 text-white',
  error: 'bg-red-600 border-red-500 text-white',
  warning: 'bg-yellow-500 border-yellow-400 text-slate-900'
};

const typeIcons: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle
};

export function Toast({ message, type, onClose, stacked = false }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  const Icon = typeIcons[type];

  return (
    <div
      role="status"
      className={clsx(
        'flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg',
        typeStyles[type],
        stacked ? 'relative' : 'fixed top-4 right-4 z-[100]'
      )}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-sm leading-5">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md hover:bg-black/20"
        aria-label="Close notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
