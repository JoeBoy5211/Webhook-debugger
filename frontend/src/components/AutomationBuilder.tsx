import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Pencil, Trash2, FlaskConical, Inbox, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { CreateRuleData, RuleType, useAutomations } from '../hooks/useAutomations';
import { useToast } from '../hooks/useToast';
import { getErrorMessage } from '../lib/api';
import { Spinner } from './Spinner';
import { CardSkeleton } from './Skeleton';
import { ConfirmDialog } from './ConfirmDialog';

interface AutomationBuilderProps {
  webhook_id: string;
  onClose: () => void;
}

const EMPTY_FORM: CreateRuleData = {
  name: '',
  rule_type: 'contains',
  field_path: '',
  match_value: '',
  action_type: 'slack',
  action_config: {
    slackWebhookUrl: '',
    message: ''
  }
};

const SAMPLE_PAYLOAD = `{
  "event": "payment.success",
  "amount": 99.99,
  "user_id": "123"
}`;

function isValidRegex(value: string): boolean {
  try {
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
}

function isSlackUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname === 'hooks.slack.com';
  } catch {
    return false;
  }
}

function generateMatchingPayload(fieldPath: string, matchValue: string): string {
  if (!fieldPath || !fieldPath.trim()) {
    return JSON.stringify({ event: 'payment.success', amount: 99.99, user_id: '123' }, null, 2);
  }
  const valToUse = matchValue || 'sample_value';
  const normalized = fieldPath.replace(/\[(\d+)\]/g, '.$1');
  const segments = normalized.split('.').filter(Boolean);
  if (segments.length === 0) {
    return JSON.stringify({ event: 'payment.success', amount: 99.99, user_id: '123' }, null, 2);
  }

  let typedVal: unknown = valToUse;
  if (!isNaN(Number(valToUse)) && valToUse.trim() !== '') {
    typedVal = Number(valToUse);
  } else if (valToUse.toLowerCase() === 'true') {
    typedVal = true;
  } else if (valToUse.toLowerCase() === 'false') {
    typedVal = false;
  }

  const root: Record<string, unknown> = {};
  let curr: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    curr[key] = {};
    curr = curr[key] as Record<string, unknown>;
  }
  curr[segments[segments.length - 1]] = typedVal;

  return JSON.stringify(root, null, 2);
}

export function AutomationBuilder({ webhook_id, onClose }: AutomationBuilderProps) {
  const { rules, loading, error, createRule, getRules, updateRule, deleteRule, testRule } = useAutomations();
  const { success, error: toastError, warning } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateRuleData>(EMPTY_FORM);
  const [testPayload, setTestPayload] = useState(SAMPLE_PAYLOAD);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showSlackUrl, setShowSlackUrl] = useState(false);

  const loadRules = async () => {
    try {
      await getRules(webhook_id);
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    } finally {
      setInitialLoad(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [webhook_id]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Rule name is required';
    if (!form.field_path.trim()) errors.field_path = 'Field path is required';
    if (!form.match_value.trim()) errors.match_value = 'Match value is required';
    if (form.rule_type === 'regex' && form.match_value && !isValidRegex(form.match_value)) {
      errors.match_value = 'Invalid regex pattern';
    }
    if (!form.action_config.message.trim()) errors.message = 'Message template is required';
    const url = form.action_config.slackWebhookUrl.trim();
    if (!editingId || (url && !url.includes('***'))) {
      if (!url) errors.slackWebhookUrl = 'Slack webhook URL is required';
      else if (!isSlackUrl(url)) errors.slackWebhookUrl = 'Enter a valid https://hooks.slack.com URL';
    }
    return errors;
  }, [form, editingId]);

  const isValid = Object.keys(fieldErrors).length === 0;

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setTestResult(null);
    setTouched({});
  };

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setTestResult(null);
    setTouched({});
  };

  const startEdit = (ruleId: string) => {
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) return;
    setForm({
      name: rule.name,
      rule_type: rule.rule_type,
      field_path: rule.field_path,
      match_value: rule.match_value,
      action_type: 'slack',
      action_config: {
        slackWebhookUrl: rule.action_config.slackWebhookUrl || '',
        message: rule.action_config.message || ''
      }
    });
    setEditingId(rule.id);
    setShowForm(true);
    setTestResult(null);
    setTouched({});
    setTestPayload(generateMatchingPayload(rule.field_path, rule.match_value));
  };

  const handleSubmit = async () => {
    setTouched({
      name: true,
      field_path: true,
      match_value: true,
      message: true,
      slackWebhookUrl: true
    });
    if (!isValid) return;

    try {
      if (editingId) {
        await updateRule(editingId, form);
        success('Automation rule updated!');
      } else {
        await createRule(webhook_id, form);
        success('Automation rule created!');
      }
      await loadRules();
      resetForm();
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!confirmId) return;
    try {
      await deleteRule(confirmId);
      success('Rule deleted');
      if (editingId === confirmId) resetForm();
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    } finally {
      setConfirmId(null);
    }
  };

  const handleToggle = async (ruleId: string, enabled: boolean) => {
    try {
      await updateRule(ruleId, { enabled });
      await loadRules();
      success(enabled ? 'Rule enabled' : 'Rule disabled');
    } catch (err: unknown) {
      toastError(getErrorMessage(err));
    }
  };

  const handleTest = async (ruleId: string, fromForm = false) => {
    setTestingRuleId(ruleId);
    setTestResult(null);
    try {
      if (fromForm && editingId === ruleId && isValid) {
        await updateRule(ruleId, form);
        await loadRules();
      }
      const payload = JSON.parse(testPayload);
      const result = await testRule(ruleId, payload);
      setTestResult(result.message);
      if (result.matched) {
        if (result.message.includes('successfully')) {
          success(result.message);
        } else {
          warning(result.message);
        }
      } else {
        warning(result.message);
      }
    } catch (err: unknown) {
      if (err instanceof SyntaxError) {
        setTestResult('Invalid JSON in sample payload');
        toastError('Invalid JSON in sample payload');
      } else {
        const message = getErrorMessage(err);
        setTestResult(message);
        toastError(message);
      }
    } finally {
      setTestingRuleId(null);
    }
  };

  const ruleSummary = (fieldPath: string, ruleType: RuleType, matchValue: string) =>
    `Rule will send to Slack when ${fieldPath || 'field'} ${ruleType} ${matchValue || 'value'}`;

  const showError = (field: string) => Boolean(touched[field] && fieldErrors[field]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <div className="flex items-start justify-between gap-3 border-b border-slate-700 bg-slate-900 p-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Automation Rules</h2>
          <p className="text-sm text-slate-400">Webhook ID: {webhook_id}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg transition-colors hover:bg-slate-800"
          aria-label="Close automation builder"
        >
          <X size={24} />
        </button>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        {error && (
          <div className="rounded-lg border border-red-500 bg-red-900/40 px-4 py-2 text-red-200" role="alert">
            <span className="inline-flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </span>
          </div>
        )}

        {testResult && !showForm && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-slate-200">{testResult}</div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold">Existing rules</h3>
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 font-medium text-white transition-colors hover:bg-blue-500"
          >
            <Plus size={18} />
            Create new rule
          </button>
        </div>

        {initialLoad ? (
          <div className="space-y-3">
            <Spinner label="Loading..." />
            <CardSkeleton />
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-8 text-center">
            <Inbox className="mx-auto mb-3 text-slate-500" size={40} />
            <p className="mb-4 text-slate-400">No automation rules yet</p>
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-blue-600 px-4 font-medium text-white transition-colors hover:bg-blue-500"
            >
              <Plus size={18} />
              Create your first rule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <article key={rule.id} className="rounded-lg border border-slate-700 bg-slate-900 p-4 transition-colors hover:bg-slate-800">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-100">{rule.name}</h4>
                    <p className="mt-1 text-sm text-slate-400">
                      {rule.rule_type} · {rule.action_type}
                    </p>
                    <p className="mt-2 text-sm text-slate-300">
                      {ruleSummary(rule.field_path, rule.rule_type, rule.match_value)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex min-h-12 items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => handleToggle(rule.id, e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setTestPayload(generateMatchingPayload(rule.field_path, rule.match_value));
                        handleTest(rule.id);
                      }}
                      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg transition-colors hover:bg-slate-700"
                      title="Test with matching sample payload"
                      aria-label="Test rule"
                    >
                      {testingRuleId === rule.id ? <Spinner size={16} /> : <FlaskConical size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(rule.id)}
                      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg transition-colors hover:bg-slate-700"
                      title="Edit"
                      aria-label="Edit rule"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(rule.id)}
                      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-slate-700"
                      title="Delete"
                      aria-label="Delete rule"
                    >
                      {loading && confirmId === rule.id ? <Spinner size={16} /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {showForm && (
          <form
            className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            noValidate
          >
            <h3 className="text-lg font-semibold">{editingId ? 'Edit rule' : 'Create rule'}</h3>

            <div>
              <label htmlFor="rule-name" className="mb-1 block text-sm text-slate-300">
                Rule name
              </label>
              <input
                id="rule-name"
                value={form.name}
                onBlur={() => setTouched((current) => ({ ...current, name: true }))}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Stripe payment received"
                className="input-field"
              />
              {showError('name') && <p className="mt-1 text-sm text-red-400">{fieldErrors.name}</p>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="rule-type" className="mb-1 block text-sm text-slate-300">
                  Rule type
                </label>
                <select
                  id="rule-type"
                  value={form.rule_type}
                  onChange={(e) => setForm({ ...form, rule_type: e.target.value as RuleType })}
                  className="input-field"
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="regex">regex</option>
                </select>
              </div>
              <div>
                <label htmlFor="action-type" className="mb-1 block text-sm text-slate-300">
                  Action type
                </label>
                <select id="action-type" value={form.action_type} className="input-field" disabled>
                  <option value="slack">slack</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="field-path" className="mb-1 block text-sm text-slate-300">
                  Field path
                </label>
                <input
                  id="field-path"
                  value={form.field_path}
                  onBlur={() => setTouched((current) => ({ ...current, field_path: true }))}
                  onChange={(e) => setForm({ ...form, field_path: e.target.value })}
                  placeholder="user_id, event"
                  className="input-field"
                />
                {showError('field_path') && <p className="mt-1 text-sm text-red-400">{fieldErrors.field_path}</p>}
              </div>
              <div>
                <label htmlFor="match-value" className="mb-1 block text-sm text-slate-300">
                  Match value
                </label>
                <input
                  id="match-value"
                  value={form.match_value}
                  onBlur={() => setTouched((current) => ({ ...current, match_value: true }))}
                  onChange={(e) => setForm({ ...form, match_value: e.target.value })}
                  placeholder="signup, user_.*"
                  className="input-field"
                />
                {showError('match_value') && <p className="mt-1 text-sm text-red-400">{fieldErrors.match_value}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="slack-url" className="mb-1 block text-sm text-slate-300">
                Slack webhook URL
              </label>
              <div className="relative">
                <input
                  id="slack-url"
                  type={showSlackUrl ? 'text' : 'password'}
                  value={form.action_config.slackWebhookUrl}
                  onBlur={() => setTouched((current) => ({ ...current, slackWebhookUrl: true }))}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      action_config: { ...form.action_config, slackWebhookUrl: e.target.value }
                    })
                  }
                  placeholder="https://hooks.slack.com/services/..."
                  className="input-field pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSlackUrl(!showSlackUrl)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  aria-label={showSlackUrl ? 'Hide webhook URL' : 'Show webhook URL'}
                >
                  {showSlackUrl ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {showError('slackWebhookUrl') && (
                <p className="mt-1 text-sm text-red-400">{fieldErrors.slackWebhookUrl}</p>
              )}
              {form.action_config.slackWebhookUrl.includes('***') && (
                <p className="mt-1 text-xs text-amber-400">
                  URL is obfuscated. Paste your full Slack webhook URL (https://hooks.slack.com/services/...) and click Save changes to update.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="message-template" className="mb-1 block text-sm text-slate-300">
                Message template
              </label>
              <input
                id="message-template"
                value={form.action_config.message}
                onBlur={() => setTouched((current) => ({ ...current, message: true }))}
                onChange={(e) =>
                  setForm({
                    ...form,
                    action_config: { ...form.action_config, message: e.target.value }
                  })
                }
                placeholder="New signup from {{user_id}}"
                className="input-field"
              />
              {showError('message') && <p className="mt-1 text-sm text-red-400">{fieldErrors.message}</p>}
            </div>

            <p className="text-sm text-blue-300">
              {ruleSummary(form.field_path, form.rule_type, form.match_value)}
            </p>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="sample-payload" className="block text-sm text-slate-300">
                  Sample payload
                </label>
                <button
                  type="button"
                  onClick={() => setTestPayload(generateMatchingPayload(form.field_path, form.match_value))}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Auto-generate matching payload
                </button>
              </div>
              <textarea
                id="sample-payload"
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={7}
                className="input-field font-mono text-sm"
              />
            </div>

            {testResult && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm font-medium ${
                  testResult.includes('successfully')
                    ? 'border-green-600/50 bg-green-950/40 text-green-200'
                    : testResult.includes('matched')
                    ? 'border-amber-600/50 bg-amber-950/40 text-amber-200'
                    : 'border-slate-700 bg-slate-900 text-slate-200'
                }`}
              >
                {testResult}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={loading || !isValid}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-4 font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {loading ? (
                  <Spinner label={editingId ? 'Saving...' : 'Creating rule...'} />
                ) : editingId ? (
                  'Save changes'
                ) : (
                  'Create Rule'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!editingId) {
                    setTestResult('Create the rule first, then test it with a sample payload.');
                    warning('Create the rule first, then test it.');
                    return;
                  }
                  handleTest(editingId, true);
                }}
                disabled={loading || Boolean(testingRuleId)}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 transition-colors hover:bg-slate-700"
              >
                {testingRuleId ? <Spinner size={16} /> : <FlaskConical size={16} />}
                Test with sample payload
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="min-h-12 px-4 text-slate-300 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmId)}
        title="Are you sure?"
        message="This automation rule will be permanently deleted."
        confirmLabel="Delete rule"
        dangerous
        loading={loading}
        onCancel={() => setConfirmId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
