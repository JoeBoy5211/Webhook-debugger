import { Router, Response } from 'express';
import { pool } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { evaluateRule, interpolateMessage, sendSlackMessage } from '../services/slackService';

const router = Router();

const VALID_RULE_TYPES = ['contains', 'equals', 'regex'] as const;
const VALID_ACTION_TYPES = ['slack'] as const;

router.use(authMiddleware);

function isValidSlackWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'hooks.slack.com';
  } catch {
    return false;
  }
}

function obfuscateSlackUrl(url: string | undefined): string {
  if (!url) {
    return '';
  }
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() || '';
    const suffix = lastSegment.slice(-4);
    return `${parsed.origin}/***...${suffix}`;
  } catch {
    return '***';
  }
}

function looksObfuscated(url: string | undefined): boolean {
  return !url || url.includes('***');
}

function sanitizeRule(row: Record<string, unknown>) {
  const actionConfig = (row.action_config || {}) as { slackWebhookUrl?: string; message?: string };
  return {
    id: row.id,
    webhook_id: row.webhook_id,
    user_id: row.user_id,
    name: row.name,
    rule_type: row.rule_type,
    field_path: row.field_path,
    match_value: row.match_value,
    action_type: row.action_type,
    action_config: {
      slackWebhookUrl: obfuscateSlackUrl(actionConfig.slackWebhookUrl),
      message: actionConfig.message || ''
    },
    enabled: row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function getOwnedRule(ruleId: string, userId: string) {
  const result = await pool.query(
    'SELECT * FROM automation_rules WHERE id = $1 AND user_id = $2',
    [ruleId, userId]
  );
  return result.rows[0] || null;
}

// ROUTE 1: POST /api/automations
router.post('/automations', async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const { webhook_id, name, rule_type, field_path, match_value, action_type, action_config } = req.body || {};

  if (!user_id) {
    return res.status(401).json({ error: 'Unauthorized', status: 401 });
  }

  if (!webhook_id || !name || !rule_type || !field_path || match_value === undefined || match_value === null || !action_type || !action_config) {
    return res.status(400).json({ error: 'Missing required fields', status: 400 });
  }

  if (!(VALID_RULE_TYPES as readonly string[]).includes(rule_type)) {
    return res.status(400).json({ error: 'Invalid rule_type. Must be contains, equals, or regex', status: 400 });
  }

  if (!(VALID_ACTION_TYPES as readonly string[]).includes(action_type)) {
    return res.status(400).json({ error: 'Invalid action_type. Must be slack', status: 400 });
  }

  const slackWebhookUrl = action_config.slackWebhookUrl;
  const message = action_config.message;

  if (!slackWebhookUrl || !message) {
    return res.status(400).json({ error: 'action_config must include slackWebhookUrl and message', status: 400 });
  }

  if (!isValidSlackWebhookUrl(slackWebhookUrl)) {
    return res.status(400).json({ error: 'Invalid Slack webhook URL', status: 400 });
  }

  if (rule_type === 'regex') {
    try {
      new RegExp(match_value);
    } catch {
      return res.status(400).json({ error: 'Invalid regex pattern', status: 400 });
    }
  }

  try {
    const webhookCheck = await pool.query(
      'SELECT id FROM webhooks WHERE id = $1 AND user_id = $2',
      [webhook_id, user_id]
    );

    if (webhookCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized', status: 403 });
    }

    const result = await pool.query(
      `INSERT INTO automation_rules
        (webhook_id, user_id, name, rule_type, field_path, match_value, action_type, action_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, rule_type, created_at`,
      [
        webhook_id,
        user_id,
        name,
        rule_type,
        field_path,
        String(match_value),
        action_type,
        JSON.stringify({ slackWebhookUrl, message })
      ]
    );

    const rule = result.rows[0];
    res.status(201).json({
      id: rule.id,
      name: rule.name,
      rule_type: rule.rule_type,
      created_at: rule.created_at
    });
  } catch (error) {
    console.error('Error creating automation rule:', error);
    res.status(500).json({ error: 'Failed to create automation rule', status: 500 });
  }
});

// ROUTE 2: GET /api/automations/webhook/:webhook_id
router.get('/automations/webhook/:webhook_id', async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const { webhook_id } = req.params;

  if (!user_id) {
    return res.status(401).json({ error: 'Unauthorized', status: 401 });
  }

  try {
    const webhookCheck = await pool.query(
      'SELECT id FROM webhooks WHERE id = $1 AND user_id = $2',
      [webhook_id, user_id]
    );

    if (webhookCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized', status: 403 });
    }

    const result = await pool.query(
      'SELECT * FROM automation_rules WHERE webhook_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [webhook_id, user_id]
    );

    res.json({
      automations: result.rows.map(sanitizeRule),
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching automation rules:', error);
    res.status(500).json({ error: 'Failed to fetch automation rules', status: 500 });
  }
});

// ROUTE 3: PUT /api/automations/:rule_id
router.put('/automations/:rule_id', async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const { rule_id } = req.params;
  const { name, rule_type, field_path, match_value, action_config, enabled } = req.body || {};

  if (!user_id) {
    return res.status(401).json({ error: 'Unauthorized', status: 401 });
  }

  try {
    const existing = await getOwnedRule(rule_id, user_id);
    if (!existing) {
      return res.status(403).json({ error: 'Unauthorized', status: 403 });
    }

    if (rule_type !== undefined && !(VALID_RULE_TYPES as readonly string[]).includes(rule_type)) {
      return res.status(400).json({ error: 'Invalid rule_type. Must be contains, equals, or regex', status: 400 });
    }

    const nextRuleType = rule_type ?? existing.rule_type;
    const nextMatchValue = match_value !== undefined ? String(match_value) : existing.match_value;

    if (nextRuleType === 'regex') {
      try {
        new RegExp(nextMatchValue);
      } catch {
        return res.status(400).json({ error: 'Invalid regex pattern', status: 400 });
      }
    }

    const existingConfig = existing.action_config || {};
    let nextConfig = existingConfig;

    if (action_config) {
      const nextUrl = looksObfuscated(action_config.slackWebhookUrl)
        ? existingConfig.slackWebhookUrl
        : action_config.slackWebhookUrl;

      if (nextUrl && !isValidSlackWebhookUrl(nextUrl)) {
        return res.status(400).json({ error: 'Invalid Slack webhook URL', status: 400 });
      }

      nextConfig = {
        slackWebhookUrl: nextUrl || existingConfig.slackWebhookUrl,
        message: action_config.message !== undefined ? action_config.message : existingConfig.message
      };
    }

    const result = await pool.query(
      `UPDATE automation_rules SET
        name = COALESCE($1, name),
        rule_type = COALESCE($2, rule_type),
        field_path = COALESCE($3, field_path),
        match_value = COALESCE($4, match_value),
        action_config = COALESCE($5, action_config),
        enabled = COALESCE($6, enabled),
        updated_at = NOW()
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [
        name ?? null,
        rule_type ?? null,
        field_path ?? null,
        match_value !== undefined ? String(match_value) : null,
        action_config ? JSON.stringify(nextConfig) : null,
        typeof enabled === 'boolean' ? enabled : null,
        rule_id,
        user_id
      ]
    );

    const updated = sanitizeRule(result.rows[0]);
    res.json({
      id: updated.id,
      name: updated.name,
      updated_at: updated.updated_at,
      rule_type: updated.rule_type,
      field_path: updated.field_path,
      match_value: updated.match_value,
      action_config: updated.action_config,
      enabled: updated.enabled
    });
  } catch (error) {
    console.error('Error updating automation rule:', error);
    res.status(500).json({ error: 'Failed to update automation rule', status: 500 });
  }
});

// ROUTE 4: DELETE /api/automations/:rule_id
router.delete('/automations/:rule_id', async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const { rule_id } = req.params;

  if (!user_id) {
    return res.status(401).json({ error: 'Unauthorized', status: 401 });
  }

  try {
    const existing = await getOwnedRule(rule_id, user_id);
    if (!existing) {
      return res.status(403).json({ error: 'Unauthorized', status: 403 });
    }

    await pool.query('DELETE FROM automation_rules WHERE id = $1 AND user_id = $2', [rule_id, user_id]);

    res.json({ status: 'deleted', rule_id });
  } catch (error) {
    console.error('Error deleting automation rule:', error);
    res.status(500).json({ error: 'Failed to delete automation rule', status: 500 });
  }
});

// ROUTE 5: POST /api/automations/:rule_id/test
router.post('/automations/:rule_id/test', async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const { rule_id } = req.params;
  const { test_payload } = req.body || {};

  if (!user_id) {
    return res.status(401).json({ error: 'Unauthorized', status: 401 });
  }

  if (!test_payload || typeof test_payload !== 'object') {
    return res.status(400).json({ error: 'test_payload is required', status: 400 });
  }

  try {
    const rule = await getOwnedRule(rule_id, user_id);
    if (!rule) {
      return res.status(403).json({ error: 'Unauthorized', status: 403 });
    }

    const matched = evaluateRule(rule, test_payload);

    if (matched && rule.action_type === 'slack') {
      const config = rule.action_config || {};
      const message = interpolateMessage(config.message || '', test_payload);
      await sendSlackMessage(config.slackWebhookUrl, message, test_payload);
      return res.json({
        matched: true,
        message: 'Rule matched! Slack message would be sent.'
      });
    }

    res.json({
      matched,
      message: matched ? 'Rule matched' : 'Rule did not match'
    });
  } catch (error) {
    console.error('Error testing automation rule:', error);
    res.status(500).json({ error: 'Failed to test automation rule', status: 500 });
  }
});

export default router;
