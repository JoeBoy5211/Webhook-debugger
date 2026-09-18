import axios from 'axios';

export interface AutomationRule {
  id?: string;
  webhook_id?: string;
  user_id?: string;
  name?: string;
  rule_type: string;
  field_path: string;
  match_value: string;
  action_type?: string;
  action_config?: {
    slackWebhookUrl?: string;
    message?: string;
  };
  enabled?: boolean;
}

export function parseActionConfig(config: unknown): { slackWebhookUrl?: string; message?: string } {
  if (!config) return {};
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  }
  if (typeof config === 'object') {
    return config as { slackWebhookUrl?: string; message?: string };
  }
  return {};
}

export function getValueByPath(payload: unknown, fieldPath: string): unknown {
  if (!fieldPath || payload === null || payload === undefined) {
    return undefined;
  }

  const normalizedPath = fieldPath.replace(/\[(\d+)\]/g, '.$1');
  const segments = normalizedPath.split('.').filter(Boolean);
  let current: unknown = payload;

  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function valueToString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export function interpolateMessage(template: string, payload?: unknown): string {
  if (!template) {
    return '';
  }

  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, path: string) => {
    const value = getValueByPath(payload, path.trim());
    if (value === undefined || value === null) {
      return '';
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

export function evaluateRule(rule: AutomationRule, payload: unknown): boolean {
  try {
    if (!rule || !rule.rule_type || !rule.field_path) {
      return false;
    }

    const fieldValue = getValueByPath(payload, rule.field_path);
    if (fieldValue === undefined) {
      console.warn(`Rule evaluation skipped: field path "${rule.field_path}" not found in payload`);
      return false;
    }

    const fieldString = valueToString(fieldValue);
    if (fieldString === undefined) {
      return false;
    }

    const matchValue = rule.match_value ?? '';

    switch (rule.rule_type) {
      case 'contains':
        return fieldString.includes(matchValue);
      case 'equals':
        return fieldString === matchValue;
      case 'regex': {
        try {
          const regex = new RegExp(matchValue);
          return regex.test(fieldString);
        } catch (error) {
          console.error(`Invalid regex pattern "${matchValue}":`, error);
          return false;
        }
      }
      default:
        console.warn(`Unknown rule_type: ${rule.rule_type}`);
        return false;
    }
  } catch (error) {
    console.error('Rule evaluation error:', error);
    return false;
  }
}

export async function sendSlackMessage(
  webhookUrl: string,
  message: string,
  payload?: unknown
): Promise<boolean> {
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.trim() || webhookUrl.includes('***')) {
    console.error('Slack notification failed: missing or obfuscated webhook URL');
    return false;
  }

  const textMessage = message && message.trim() ? message : 'Webhook notification triggered';

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: textMessage }
    }
  ];

  if (payload !== undefined) {
    let serialized = '';
    try {
      serialized = JSON.stringify(payload, null, 2);
    } catch (error) {
      console.error('Failed to serialize payload for Slack:', error);
      serialized = String(payload);
    }

    if (serialized.length > 2500) {
      serialized = serialized.substring(0, 2500) + '\n... (truncated due to Slack limits)';
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '```\n' + serialized + '\n```'
      }
    });
  }

  try {
    await axios.post(
      webhookUrl,
      {
        text: textMessage,
        blocks
      },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    console.log('Slack notification sent successfully');
    return true;
  } catch (primaryError) {
    console.warn('Slack message with blocks failed, attempting fallback plain text post:', primaryError);
    try {
      let plainTextPayload = textMessage;
      if (payload !== undefined) {
        let serialized = '';
        try {
          serialized = JSON.stringify(payload, null, 2);
        } catch {
          serialized = String(payload);
        }
        if (serialized.length > 2500) {
          serialized = serialized.substring(0, 2500) + '\n... (truncated)';
        }
        plainTextPayload += '\n```\n' + serialized + '\n```';
      }
      await axios.post(
        webhookUrl,
        { text: plainTextPayload },
        { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
      );
      console.log('Slack fallback notification sent successfully');
      return true;
    } catch (fallbackError) {
      if (axios.isAxiosError(fallbackError)) {
        console.error(
          'Slack notification failed:',
          fallbackError.response?.status,
          fallbackError.response?.data || fallbackError.message
        );
      } else {
        console.error('Slack notification failed:', fallbackError);
      }
      return false;
    }
  }
}

