import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Inbox, Radio, Search, Trash2, X } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../hooks/useToast';
import { Spinner } from './Spinner';
import { CardSkeleton } from './Skeleton';
import { ConfirmDialog } from './ConfirmDialog';
import { api, getErrorMessage } from '../lib/api';

interface PayloadViewerProps {
  webhook_id: string;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PayloadViewer({ webhook_id, onClose }: PayloadViewerProps) {
  const {
    payloads,
    isConnected,
    loading,
    error,
    connect,
    disconnect,
    getPayloadHistory,
    clearPayloads,
    setPayloads,
    removePayload
  } = useWebSocket();
  const listEndRef = useRef<HTMLDivElement>(null);
  const historyLoaded = useRef(false);
  const previousCount = useRef(0);
  const { success, error: toastError } = useToast();
  const [incoming, setIncoming] = useState(false);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [sizeBytes, setSizeBytes] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmPayloadId, setConfirmPayloadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStats = async () => {
    try {
      const response = await api.get(`/webhooks/${webhook_id}/stats`);
      setTotal(response.data.total_payloads || 0);
      setSizeBytes(response.data.total_size_bytes || 0);
    } catch {
      // keep last known stats
    }
  };

  useEffect(() => {
    connect(webhook_id);
    getPayloadHistory(webhook_id, 50);
    loadStats();

    return () => {
      disconnect(webhook_id);
      clearPayloads();
    };
  }, [webhook_id]);

  useEffect(() => {
    if (error) {
      toastError(error);
    }
  }, [error, toastError]);

  useEffect(() => {
    if (!loading) {
      historyLoaded.current = true;
    }
  }, [loading]);

  useEffect(() => {
    if (historyLoaded.current && previousCount.current > 0 && payloads.length > previousCount.current) {
      setIncoming(true);
      const timer = window.setTimeout(() => setIncoming(false), 1200);
      previousCount.current = payloads.length;
      loadStats();
      return () => window.clearTimeout(timer);
    }
    previousCount.current = payloads.length;
  }, [payloads.length]);

  useEffect(() => {
    if (listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [payloads]);

  const searchReady = useRef(false);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!searchReady.current) {
        searchReady.current = true;
        return;
      }
      try {
        const response = await api.post(`/webhooks/${webhook_id}/payloads/filter`, {
          search,
          limit: 50,
          offset: 0
        });
        setPayloads(response.data.payloads || []);
        setTotal(response.data.total ?? response.data.payloads?.length ?? 0);
      } catch (err: unknown) {
        toastError(getErrorMessage(err));
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [search, webhook_id]);

  const copyJson = async (json: string) => {
    try {
      await navigator.clipboard.writeText(json);
      success('Copied to clipboard!');
    } catch {
      toastError('Could not copy payload');
    }
  };

  const downloadJson = async () => {
    setBusy(true);
    try {
      const response = await api.get(`/webhooks/${webhook_id}/payloads/export`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'payloads.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      success('Downloaded payloads.json');
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleClearHistory = async () => {
    setBusy(true);
    try {
      const response = await api.delete(`/webhooks/${webhook_id}/payloads`);
      clearPayloads();
      setTotal(0);
      setSizeBytes(0);
      success(`Cleared ${response.data.deleted_count} payloads`);
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    } finally {
      setBusy(false);
      setConfirmClear(false);
    }
  };

  const handleDeletePayload = async () => {
    if (!confirmPayloadId) return;
    setBusy(true);
    try {
      await api.delete(`/webhooks/${webhook_id}/payloads/${confirmPayloadId}`);
      removePayload(confirmPayloadId);
      await loadStats();
      success('Payload deleted');
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    } finally {
      setBusy(false);
      setConfirmPayloadId(null);
    }
  };

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex flex-col gap-3 border-b border-slate-700 bg-slate-900 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Payload Viewer</h2>
          <p className="text-sm text-slate-400">Webhook ID: {webhook_id}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-slate-400">
              {isConnected ? 'Listening for new payloads...' : 'Disconnected'}
            </span>
            {incoming && <Spinner size={14} label="New payload..." />}
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-200">
              Loaded {payloads.length} of {total} payloads · {formatBytes(sizeBytes)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadJson}
            disabled={busy}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-slate-800 px-3 text-sm transition-colors hover:bg-slate-700"
          >
            <Download size={16} />
            Download as JSON
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={busy}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-red-900/40 px-3 text-sm text-red-200 transition-colors hover:bg-red-800/60"
          >
            <Trash2 size={16} />
            Clear History
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg transition-colors hover:bg-slate-800"
            aria-label="Close payload viewer"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="border-b border-slate-700 bg-slate-950 p-4">
        <label htmlFor="payload-search" className="sr-only">
          Search payloads
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            id="payload-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payload content..."
            className="input-field pl-10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && payloads.length === 0 && (
          <div className="space-y-4">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
              <Spinner label="Loading..." />
            </div>
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {payloads.length === 0 && !loading && (
          <div className="mt-12 text-center">
            <Inbox className="mx-auto mb-3 text-slate-500" size={40} />
            <h3 className="mb-2 text-lg font-semibold">No payloads yet</h3>
            <p className="mx-auto max-w-md text-sm text-slate-400">
              Send a POST request to this webhook URL. Incoming JSON will appear here in real time.
            </p>
            {isConnected && (
              <p className="mt-3 inline-flex items-center gap-2 text-sm text-green-400">
                <Radio size={16} />
                Listening for new payloads...
              </p>
            )}
          </div>
        )}

        <div className="space-y-4">
          {payloads.map((payload) => (
            <article key={payload.payload_id} className="rounded-lg border border-slate-700 bg-slate-900 p-4 transition-colors hover:border-slate-600">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="text-sm text-slate-400">{formatDate(payload.received_at)}</div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => copyJson(JSON.stringify(payload.payload_data, null, 2))}
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg transition-colors hover:bg-slate-800"
                    title="Copy JSON"
                    aria-label="Copy payload JSON"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmPayloadId(payload.payload_id)}
                    className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-slate-800"
                    title="Delete payload"
                    aria-label="Delete payload"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <pre className="overflow-x-auto rounded bg-slate-950 p-3 text-sm text-green-300">
                {JSON.stringify(payload.payload_data, null, 2)}
              </pre>
            </article>
          ))}
          <div ref={listEndRef} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear history?"
        message="Delete all payloads for this webhook?"
        confirmLabel="Clear history"
        loading={busy}
        onCancel={() => setConfirmClear(false)}
        onConfirm={handleClearHistory}
      />
      <ConfirmDialog
        open={Boolean(confirmPayloadId)}
        title="Delete payload?"
        message="This payload will be permanently deleted."
        confirmLabel="Delete payload"
        loading={busy}
        onCancel={() => setConfirmPayloadId(null)}
        onConfirm={handleDeletePayload}
      />
    </div>
  );
}
