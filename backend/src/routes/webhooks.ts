import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { Server as SocketIOServer } from 'socket.io';
import { authMiddleware, AuthRequest } from '../middleware/authMiddleware';
import { evaluateRule, interpolateMessage, parseActionConfig, sendSlackMessage } from '../services/slackService';
import { cleanupExpiredPayloads, manualCleanup } from '../services/cleanupService';

const router = Router();

let io: SocketIOServer | null = null;

export function setSocketIO(ioInstance: SocketIOServer): void {
  io = ioInstance;
}

function logAudit(action: string, userId: string | undefined, details: Record<string, unknown>): void {
  console.log(`[audit] ${action}`, {
    user_id: userId,
    at: new Date().toISOString(),
    ...details
  });
}

async function findWebhook(webhookId: string) {
  const result = await pool.query('SELECT * FROM webhooks WHERE id = $1', [webhookId]);
  return result.rows[0] || null;
}

async function requireOwnedWebhook(webhookId: string, userId: string | undefined, res: Response) {
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized', status: 401 });
    return null;
  }

  const webhook = await findWebhook(webhookId);
  if (!webhook) {
    res.status(404).json({ error: 'Webhook not found', status: 404 });
    return null;
  }
  if (webhook.user_id !== userId) {
    res.status(403).json({ error: 'Unauthorized', status: 403 });
    return null;
  }
  return webhook;
}

// ROUTE 1: POST /api/webhooks/generate
router.post('/webhooks/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;

  if (!user_id) {
    return res.status(401).json({ error: 'Unauthorized', status: 401 });
  }

  try {
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    
    // First, insert with a temporary URL to get the DB-generated ID
    const initialResult = await pool.query(
      'INSERT INTO webhooks (user_id, webhook_url) VALUES ($1, $2) RETURNING id',
      [user_id, 'temp-' + uuidv4()]
    );
    
    const db_id = initialResult.rows[0].id;
    const webhook_url = `${baseUrl}/api/webhooks/receive/${db_id}`;
    
    // Update the row with the correct URL
    const result = await pool.query(
      'UPDATE webhooks SET webhook_url = $1 WHERE id = $2 RETURNING *',
      [webhook_url, db_id]
    );

    res.json({
      webhook_id: result.rows[0].id,
      webhook_url: result.rows[0].webhook_url,
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Error generating webhook:', error);
    res.status(500).json({ error: 'Failed to generate webhook', status: 500 });
  }
});

router.get('/webhooks', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;

  if (!user_id) {
    return res.status(401).json({ error: 'Unauthorized', status: 401 });
  }

  try {
    const result = await pool.query(
      'SELECT id, webhook_url, created_at, last_received FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );

    res.json({
      webhooks: result.rows.map((row) => ({
        webhook_id: row.id,
        webhook_url: row.webhook_url,
        created_at: row.created_at,
        last_received: row.last_received
      })),
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error listing webhooks:', error);
    res.status(500).json({ error: 'Failed to fetch webhooks', status: 500 });
  }
});

router.delete('/webhooks/:webhook_id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user_id = req.user?.user_id;
  const { webhook_id } = req.params;

  try {
    const webhook = await requireOwnedWebhook(webhook_id, user_id, res);
    if (!webhook) return;

    await pool.query('DELETE FROM webhooks WHERE id = $1 AND user_id = $2', [webhook_id, user_id]);
    logAudit('delete_webhook', user_id, { webhook_id });
    res.json({ status: 'deleted', webhook_id });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ error: 'Failed to delete webhook', status: 500 });
  }
});

// ROUTE 2: POST /api/webhooks/receive/:webhook_id
router.post('/webhooks/receive/:webhook_id', async (req: Request, res: Response) => {
  const { webhook_id } = req.params;
  let payload_data = req.body;

  if (typeof payload_data === 'string') {
    try {
      payload_data = JSON.parse(payload_data);
    } catch {
      // payload_data remains a string
    }
  }

  try {
    // Check if webhook exists
    const webhookCheck = await pool.query(
      'SELECT id FROM webhooks WHERE id = $1',
      [webhook_id]
    );

    if (webhookCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found', status: 404 });
    }

    // Validate JSON payload
    if (!payload_data || (typeof payload_data !== 'object' && typeof payload_data !== 'string')) {
      return res.status(400).json({ error: 'Invalid JSON payload', status: 400 });
    }

    const received_at = new Date().toISOString();

    // Insert payload
    const payloadResult = await pool.query(
      'INSERT INTO payloads (webhook_id, payload_data, received_at) VALUES ($1, $2, $3) RETURNING id, received_at',
      [webhook_id, typeof payload_data === 'string' ? payload_data : JSON.stringify(payload_data), received_at]
    );

    // Update last_received timestamp
    await pool.query(
      'UPDATE webhooks SET last_received = NOW() WHERE id = $1',
      [webhook_id]
    );

    console.log(`Received webhook for ${webhook_id}`);

    try {
      const rules = await pool.query(
        'SELECT * FROM automation_rules WHERE webhook_id = $1 AND enabled = true',
        [webhook_id]
      );

      for (const rule of rules.rows) {
        try {
          const matched = evaluateRule(rule, payload_data);
          if (matched && rule.action_type === 'slack') {
            const config = parseActionConfig(rule.action_config);
            if (config.slackWebhookUrl) {
              const interpolatedMsg = interpolateMessage(config.message || '', payload_data);
              const sent = await sendSlackMessage(
                config.slackWebhookUrl,
                interpolatedMsg,
                payload_data
              );
              console.log(`Automation rule "${rule.name}" (${rule.id}): matched=${matched}, slackSent=${sent}`);
            } else {
              console.warn(`Automation rule "${rule.name}" (${rule.id}): matched but missing Slack Webhook URL`);
            }
          }
        } catch (ruleError) {
          console.error(`Automation rule ${rule.id} failed:`, ruleError);
        }
      }
    } catch (automationError) {
      console.error('Failed to execute automation rules:', automationError);
    }

    // Broadcast to WebSocket clients subscribed to this webhook
    if (io) {
      io.to(`webhook:${webhook_id}`).emit('new_payload', {
        payload_id: payloadResult.rows[0].id,
        payload_data: payload_data,
        received_at: payloadResult.rows[0].received_at,
        webhook_id: webhook_id
      });
    }

    res.json({
      status: 'received',
      payload_id: payloadResult.rows[0].id,
      received_at: payloadResult.rows[0].received_at,
      webhook_id
    });
  } catch (error) {
    console.error('Error receiving webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook', status: 500 });
  }
});

router.get('/webhooks/:webhook_id/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { webhook_id } = req.params;
  const user_id = req.user?.user_id;

  try {
    const webhook = await requireOwnedWebhook(webhook_id, user_id, res);
    if (!webhook) return;

    const [payloadStats, rulesCount] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_payloads,
           COALESCE(SUM(octet_length(payload_data::text)), 0)::bigint AS total_size_bytes
         FROM payloads
         WHERE webhook_id = $1`,
        [webhook_id]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS count FROM automation_rules WHERE webhook_id = $1',
        [webhook_id]
      )
    ]);

    res.json({
      webhook_id,
      total_payloads: payloadStats.rows[0].total_payloads,
      total_size_bytes: Number(payloadStats.rows[0].total_size_bytes),
      last_received: webhook.last_received,
      automation_rules_count: rulesCount.rows[0].count,
      created_at: webhook.created_at
    });
  } catch (error) {
    console.error('Error fetching webhook stats:', error);
    res.status(500).json({ error: 'Failed to fetch webhook stats', status: 500 });
  }
});

router.get('/webhooks/:webhook_id/payloads/export', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { webhook_id } = req.params;
  const user_id = req.user?.user_id;

  try {
    const webhook = await requireOwnedWebhook(webhook_id, user_id, res);
    if (!webhook) return;

    const result = await pool.query(
      'SELECT id, webhook_id, payload_data, received_at, created_at FROM payloads WHERE webhook_id = $1 ORDER BY received_at ASC',
      [webhook_id]
    );

    logAudit('export_payloads', user_id, { webhook_id, count: result.rows.length });
    res.header('Content-Disposition', 'attachment; filename="payloads.json"');
    res.json(
      result.rows.map((row) => ({
        payload_id: row.id,
        webhook_id: row.webhook_id,
        payload_data: row.payload_data,
        received_at: row.received_at,
        created_at: row.created_at
      }))
    );
  } catch (error) {
    console.error('Error exporting payloads:', error);
    res.status(500).json({ error: 'Failed to export payloads', status: 500 });
  }
});

router.post('/webhooks/:webhook_id/payloads/filter', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { webhook_id } = req.params;
  const user_id = req.user?.user_id;
  const search = typeof req.body?.search === 'string' ? req.body.search : '';
  const rule_id = typeof req.body?.rule_id === 'string' ? req.body.rule_id : undefined;
  const limit = Math.min(parseInt(req.body?.limit, 10) || 50, 200);
  const offset = parseInt(req.body?.offset, 10) || 0;

  try {
    const webhook = await requireOwnedWebhook(webhook_id, user_id, res);
    if (!webhook) return;

    const like = `%${search}%`;
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM payloads WHERE webhook_id = $1 AND payload_data::text ILIKE $2',
      [webhook_id, like]
    );

    const result = await pool.query(
      `SELECT * FROM payloads
       WHERE webhook_id = $1 AND payload_data::text ILIKE $2
       ORDER BY received_at DESC
       LIMIT $3 OFFSET $4`,
      [webhook_id, like, limit, offset]
    );

    let rows = result.rows;
    let total = parseInt(countResult.rows[0].count, 10);

    if (rule_id) {
      const ruleResult = await pool.query(
        'SELECT * FROM automation_rules WHERE id = $1 AND webhook_id = $2 AND user_id = $3',
        [rule_id, webhook_id, user_id]
      );
      if (ruleResult.rows.length === 0) {
        return res.status(404).json({ error: 'Automation rule not found', status: 404 });
      }
      const rule = ruleResult.rows[0];
      rows = rows.filter((row) => evaluateRule(rule, row.payload_data));
      total = rows.length;
    }

    res.json({
      payloads: rows.map((row) => ({
        payload_id: row.id,
        payload_data: row.payload_data,
        received_at: row.received_at,
        webhook_id: row.webhook_id
      })),
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error filtering payloads:', error);
    res.status(500).json({ error: 'Failed to filter payloads', status: 500 });
  }
});

router.delete('/webhooks/:webhook_id/payloads', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { webhook_id } = req.params;
  const user_id = req.user?.user_id;

  try {
    const webhook = await requireOwnedWebhook(webhook_id, user_id, res);
    if (!webhook) return;

    const result = await pool.query(
      'DELETE FROM payloads WHERE webhook_id = $1 RETURNING id',
      [webhook_id]
    );
    const deleted_count = result.rowCount ?? result.rows.length;
    logAudit('clear_payloads', user_id, { webhook_id, deleted_count });
    res.json({ status: 'cleared', deleted_count });
  } catch (error) {
    console.error('Error clearing payloads:', error);
    res.status(500).json({ error: 'Failed to clear payloads', status: 500 });
  }
});

router.post('/webhooks/:webhook_id/cleanup', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { webhook_id } = req.params;
  const user_id = req.user?.user_id;
  const daysOld = parseInt(req.body?.daysOld, 10) || 7;

  try {
    const webhook = await requireOwnedWebhook(webhook_id, user_id, res);
    if (!webhook) return;

    const deleted_count = await manualCleanup(webhook_id, daysOld);
    logAudit('manual_cleanup', user_id, { webhook_id, daysOld, deleted_count });
    res.json({ status: 'cleaned', deleted_count, daysOld });
  } catch (error) {
    console.error('Error running manual cleanup:', error);
    res.status(500).json({ error: 'Failed to clean up payloads', status: 500 });
  }
});

// ROUTE 3: GET /api/webhooks/:webhook_id/payloads
router.get('/webhooks/:webhook_id/payloads', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { webhook_id } = req.params;
  const user_id = req.user?.user_id;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    // Check if webhook exists and belongs to user
    const webhookCheck = await pool.query(
      'SELECT id FROM webhooks WHERE id = $1 AND user_id = $2',
      [webhook_id, user_id]
    );

    if (webhookCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized', status: 403 });
    }

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM payloads WHERE webhook_id = $1',
      [webhook_id]
    );
    const total = parseInt(countResult.rows[0].count);

    // Get payloads
    const result = await pool.query(
      'SELECT * FROM payloads WHERE webhook_id = $1 ORDER BY received_at DESC LIMIT $2 OFFSET $3',
      [webhook_id, limit, offset]
    );

    res.json({
      webhooks: result.rows,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching payloads:', error);
    res.status(500).json({ error: 'Failed to fetch payloads', status: 500 });
  }
});

router.delete('/webhooks/:webhook_id/payloads/:payload_id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { webhook_id, payload_id } = req.params;
  const user_id = req.user?.user_id;

  try {
    const webhook = await requireOwnedWebhook(webhook_id, user_id, res);
    if (!webhook) return;

    const result = await pool.query(
      'DELETE FROM payloads WHERE id = $1 AND webhook_id = $2 RETURNING id',
      [payload_id, webhook_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payload not found', status: 404 });
    }

    logAudit('delete_payload', user_id, { webhook_id, payload_id });
    res.json({ status: 'deleted', payload_id });
  } catch (error) {
    console.error('Error deleting payload:', error);
    res.status(500).json({ error: 'Failed to delete payload', status: 500 });
  }
});

// ROUTE 4: GET /api/webhooks/:webhook_id/payloads/:payload_id
router.get('/webhooks/:webhook_id/payloads/:payload_id', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { webhook_id, payload_id } = req.params;
  const user_id = req.user?.user_id;

  try {
    // Verify webhook belongs to user
    const webhookCheck = await pool.query(
      'SELECT id FROM webhooks WHERE id = $1 AND user_id = $2',
      [webhook_id, user_id]
    );

    if (webhookCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Unauthorized', status: 403 });
    }

    const result = await pool.query(
      'SELECT * FROM payloads WHERE id = $1 AND webhook_id = $2',
      [payload_id, webhook_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payload not found', status: 404 });
    }

    const payload = result.rows[0];
    res.json({
      payload_id: payload.id,
      payload_data: payload.payload_data,
      received_at: payload.received_at,
      webhook_id: payload.webhook_id
    });
  } catch (error) {
    console.error('Error fetching payload:', error);
    res.status(500).json({ error: 'Failed to fetch payload', status: 500 });
  }
});

export default router;
