import { pool } from '../db';

function getTtlDays(): number {
  const parsed = parseInt(process.env.TTL_DAYS || '7', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

function getIntervalMs(): number {
  const hours = parseInt(process.env.CLEANUP_INTERVAL_HOURS || '1', 10);
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 1;
  return safeHours * 60 * 60 * 1000;
}

export async function cleanupExpiredPayloads(daysOld = getTtlDays()): Promise<number> {
  const result = await pool.query(
    `DELETE FROM payloads
     WHERE received_at < NOW() - ($1 * INTERVAL '1 day')
     RETURNING id`,
    [daysOld]
  );
  const deleted = result.rowCount ?? result.rows.length;
  console.log(`Cleanup job: deleted ${deleted} payloads`);
  return deleted;
}

export async function manualCleanup(webhookId: string, daysOld: number): Promise<number> {
  const days = Number.isFinite(daysOld) && daysOld > 0 ? daysOld : getTtlDays();
  const result = await pool.query(
    `DELETE FROM payloads
     WHERE webhook_id = $1
       AND received_at < NOW() - ($2 * INTERVAL '1 day')
     RETURNING id`,
    [webhookId, days]
  );
  const deleted = result.rowCount ?? result.rows.length;
  console.log(`Manual cleanup: deleted ${deleted} payloads for webhook ${webhookId} older than ${days} days`);
  return deleted;
}

export function startCleanupJob(): NodeJS.Timeout {
  const intervalMs = getIntervalMs();
  const ttlDays = getTtlDays();

  cleanupExpiredPayloads(ttlDays).catch((error) => {
    console.error('Initial cleanup job failed:', error);
  });

  const timer = setInterval(() => {
    cleanupExpiredPayloads(ttlDays).catch((error) => {
      console.error('Scheduled cleanup job failed:', error);
    });
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  console.log(`Cleanup job scheduled every ${intervalMs / 3600000} hour(s); TTL ${ttlDays} day(s)`);
  return timer;
}
