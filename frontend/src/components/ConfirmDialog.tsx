import { useEffect, useState } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  dangerous?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  loading,
  dangerous = false
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) {
      setTyped('');
    }
  }, [open]);

  if (!open) return null;

  const canConfirm = !dangerous || typed === 'DELETE';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <h2 id="confirm-title" className="mb-2 text-xl font-semibold text-slate-100">
          {title}
        </h2>
        <p className="mb-4 text-slate-300">{message}</p>
        {dangerous && (
          <label className="mb-4 block text-sm text-slate-300">
            Type DELETE to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input-field mt-2"
              placeholder="DELETE"
              autoComplete="off"
            />
          </label>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-12 rounded-lg bg-slate-800 px-4 py-2 text-slate-100 transition-colors hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !canConfirm}
            className="min-h-12 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900 disabled:text-red-200"
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
