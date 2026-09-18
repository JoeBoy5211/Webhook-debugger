import { BarChart3, Copy, Eraser, Send, Trash2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { api, getErrorMessage } from '../lib/api';
import { useToast } from '../hooks/useToast';
import { ConfirmDialog } from './ConfirmDialog';
import { Spinner } from './Spinner';

interface WebhookCardProps {
  webhook_id: string;
  webhook_url: string;
  last_received: string | null;
  onViewPayloads: (webhookId: string) => void;
  onManageAutomations: (webhookId: string) => void;
  onDeleted: (webhookId: string) => void;
}

interface WebhookStats {
  webhook_id: string;
  total_payloads: number;
  total_size_bytes: number;
  last_received: string | null;
  automation_rules_count: number;
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string | null) {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleString();
}

export function WebhookCard({
  webhook_id,
  webhook_url,
  last_received,
  onViewPayloads,
  onManageAutomations,
  onDeleted
}: WebhookCardProps) {
  const { success, error } = useToast();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const handleSendTestPayload = async () => {
    setSendingTest(true);
    try {
      await axios.post(webhook_url, {
        ref: 'refs/heads/main',
        event: 'push',
        pusher: 'webhook_debugger_user',
        timestamp: new Date().toISOString()
      });
      success('Test payload sent to webhook! Automation rules executed.');
      await loadStats();
    } catch (err: unknown) {
      error(`Failed to send test payload: ${getErrorMessage(err)}`);
    } finally {
      setSendingTest(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get(`/webhooks/${webhook_id}/stats`);
      setStats(response.data);
    } catch {
      setStats(null);
    }
  };

  useEffect(() => {
    loadStats();
  }, [webhook_id]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(webhook_url);
      setCopied(true);
      success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      error('Could not copy URL');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/webhooks/${webhook_id}`);
      success('Webhook deleted');
      onDeleted(webhook_id);
    } catch (err: unknown) {
      error(getErrorMessage(err));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      const response = await api.delete(`/webhooks/${webhook_id}/payloads`);
      success(`Cleared ${response.data.deleted_count} payloads`);
      await loadStats();
    } catch (err: unknown) {
      error(getErrorMessage(err));
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  return (
    <article className="rounded-lg border border-slate-700 border-l-4 border-l-blue-500 bg-slate-900 p-4 transition-all hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-lg">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="mb-2 text-lg font-semibold text-slate-100">Webhook URL</h3>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded bg-slate-950 px-2 py-2 text-sm text-blue-300">
              {webhook_url}
            </code>
            <button
              type="button"
              onClick={copyToClipboard}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg bg-slate-800 transition-colors hover:bg-slate-700"
              title="Copy URL"
              aria-label="Copy webhook URL"
            >
              <Copy size={16} />
            </button>
          </div>
          {copied && <span className="mt-1 block text-xs text-green-400">Copied to clipboard!</span>}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowStats((open) => !open)}
        className="mb-4 grid w-full grid-cols-2 gap-2 rounded-lg border border-slate-700 bg-slate-950 p-3 text-left text-sm text-slate-300 transition-colors hover:border-slate-600 sm:grid-cols-4"
      >
        <span>
          <span className="block text-xs text-slate-500">Payloads</span>
          {stats?.total_payloads ?? 0}
        </span>
        <span>
          <span className="block text-xs text-slate-500">Last received</span>
          {formatDate(stats?.last_received || last_received)}
        </span>
        <span>
          <span className="block text-xs text-slate-500">Size</span>
          {formatBytes(stats?.total_size_bytes || 0)}
        </span>
        <span className="inline-flex items-center gap-1">
          <BarChart3 size={14} />
          {showStats ? 'Hide stats' : 'More stats'}
        </span>
      </button>

      {showStats && stats && (
        <div className="mb-4 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
          <p>Created: {formatDate(stats.created_at)}</p>
          <p>Automation rules: {stats.automation_rules_count}</p>
          <p>Storage: {formatBytes(stats.total_size_bytes)} ({stats.total_size_bytes} bytes)</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-400">Last received: {formatDate(last_received)}</p>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => onManageAutomations(webhook_id)}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 text-sm text-slate-100 transition-colors hover:bg-slate-700"
          >
            <Zap size={14} />
            Automation Rules
            <span className="rounded-full bg-slate-950 px-2 py-0.5 text-xs text-slate-200">
              {stats?.automation_rules_count ?? 0}
            </span>
          </button>
          <button
            type="button"
            onClick={handleSendTestPayload}
            disabled={sendingTest}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
            title="Send a live test webhook payload to trigger automation rules"
          >
            {sendingTest ? <Spinner size={16} /> : <Send size={14} />}
            Send Test Event
          </button>
          <button
            type="button"
            onClick={() => onViewPayloads(webhook_id)}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            View Payloads
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={clearing}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 text-sm text-slate-100 transition-colors hover:bg-slate-700"
          >
            {clearing ? <Spinner size={16} /> : <Eraser size={16} />}
            Clear Payloads
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg bg-red-900/40 px-3 text-sm text-red-200 transition-colors hover:bg-red-800/60 disabled:opacity-60"
            aria-label="Delete webhook"
          >
            {deleting ? <Spinner size={16} /> : <Trash2 size={16} />}
            Delete Webhook
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Are you sure?"
        message="Are you sure? This deletes all payloads and rules. This action cannot be undone."
        confirmLabel="Delete webhook"
        dangerous
        loading={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={confirmClear}
        title="Delete all payloads?"
        message="Delete all payloads for this webhook? Rules will be kept."
        confirmLabel="Clear payloads"
        loading={clearing}
        onCancel={() => setConfirmClear(false)}
        onConfirm={handleClear}
      />
    </article>
  );
}
