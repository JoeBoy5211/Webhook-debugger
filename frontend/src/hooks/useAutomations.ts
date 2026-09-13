import { useState } from 'react';
import { api, getErrorMessage } from '../lib/api';

export type RuleType = 'contains' | 'equals' | 'regex';
export type ActionType = 'slack';

export interface ActionConfig {
  slackWebhookUrl: string;
  message: string;
}

export interface AutomationRule {
  id: string;
  webhook_id: string;
  user_id?: string;
  name: string;
  rule_type: RuleType;
  field_path: string;
  match_value: string;
  action_type: ActionType;
  action_config: ActionConfig;
  enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreateRuleData {
  name: string;
  rule_type: RuleType;
  field_path: string;
  match_value: string;
  action_type: ActionType;
  action_config: ActionConfig;
}

export function useAutomations() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRule = async (webhookId: string, ruleData: CreateRuleData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/automations', { webhook_id: webhookId, ...ruleData });
      return response.data;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getRules = async (webhookId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/automations/webhook/${webhookId}`);
      const automations = response.data.automations || [];
      setRules(automations);
      return { automations, total: response.data.total ?? automations.length };
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateRule = async (ruleId: string, updates: Partial<CreateRuleData> & { enabled?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.put(`/automations/${ruleId}`, updates);
      setRules((current) =>
        current.map((rule) => (rule.id === ruleId ? { ...rule, ...response.data } : rule))
      );
      return response.data;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteRule = async (ruleId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.delete(`/automations/${ruleId}`);
      setRules((current) => current.filter((rule) => rule.id !== ruleId));
      return response.data;
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const testRule = async (ruleId: string, testPayload: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.post(`/automations/${ruleId}/test`, { test_payload: testPayload });
      return response.data as { matched: boolean; message: string };
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    rules,
    loading,
    error,
    createRule,
    getRules,
    updateRule,
    deleteRule,
    testRule
  };
}
