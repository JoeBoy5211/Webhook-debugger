import { useState, useEffect } from 'react';
import { LogOut, Menu, Plus, X, Inbox } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { WebhookCard } from './WebhookCard';
import { PayloadViewer } from './PayloadViewer';
import { AutomationBuilder } from './AutomationBuilder';
import { Spinner } from './Spinner';
import { CardSkeleton } from './Skeleton';
import { api, getErrorMessage } from '../lib/api';

interface Webhook {
  webhook_id: string;
  webhook_url: string;
  created_at: string;
  last_received: string | null;
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const { success, error: toastError } = useToast();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [selectedWebhook, setSelectedWebhook] = useState<string | null>(null);
  const [automationWebhook, setAutomationWebhook] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const fetchWebhooks = async () => {
    setListLoading(true);
    try {
      const response = await api.get('/webhooks');
      setWebhooks(response.data.webhooks || []);
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    } finally {
      setListLoading(false);
    }
  };

  const generateWebhook = async () => {
    setCreating(true);
    try {
      const response = await api.post('/webhooks/generate', {});
      const newWebhook: Webhook = {
        webhook_id: response.data.webhook_id,
        webhook_url: response.data.webhook_url,
        created_at: response.data.created_at,
        last_received: null
      };
      setWebhooks((current) => [newWebhook, ...current]);
      success(`Webhook created! Copy URL: ${response.data.webhook_url}`);
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  if (selectedWebhook) {
    return <PayloadViewer webhook_id={selectedWebhook} onClose={() => setSelectedWebhook(null)} />;
  }

  if (automationWebhook) {
    return <AutomationBuilder webhook_id={automationWebhook} onClose={() => setAutomationWebhook(null)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-700 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 p-4">
          <h1 className="text-xl font-bold sm:text-2xl">Webhook Debugger</h1>
          <button
            type="button"
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg bg-slate-800 md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="hidden items-center gap-4 md:flex">
            <span className="text-slate-400">{user?.email}</span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-slate-800 px-3 transition-colors hover:bg-slate-700"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="space-y-3 border-t border-slate-700 px-4 py-3 md:hidden">
            <p className="text-sm text-slate-400">{user?.email}</p>
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 transition-colors hover:bg-slate-700"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold sm:text-xl">Your Webhooks</h2>
          <button
            type="button"
            onClick={generateWebhook}
            disabled={creating}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-medium text-white transition-colors hover:bg-blue-500 disabled:bg-blue-800"
          >
            {creating ? <Spinner label="Creating webhook..." /> : <><Plus size={20} /> Generate Webhook</>}
          </button>
        </div>

        {listLoading ? (
          <div className="grid gap-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-900 py-12 text-center">
            <Inbox className="mx-auto mb-3 text-slate-500" size={40} />
            <p className="mb-4 text-slate-400">No webhooks yet</p>
            <button
              type="button"
              onClick={generateWebhook}
              disabled={creating}
              className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-blue-600 px-4 font-medium text-white transition-colors hover:bg-blue-500 disabled:bg-blue-800"
            >
              {creating ? <Spinner label="Creating webhook..." /> : <><Plus size={18} /> Create your first webhook</>}
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {webhooks.map((webhook) => (
              <WebhookCard
                key={webhook.webhook_id}
                webhook_id={webhook.webhook_id}
                webhook_url={webhook.webhook_url}
                last_received={webhook.last_received}
                onViewPayloads={setSelectedWebhook}
                onManageAutomations={setAutomationWebhook}
                onDeleted={(id) => setWebhooks((current) => current.filter((item) => item.webhook_id !== id))}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
