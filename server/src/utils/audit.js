import pool from '../db/connection.js';

/**
 * Log an audit action into audit_logs table
 */
export async function logAudit({
  userId = null,
  username = 'system',
  action,
  entityType,
  entityId = null,
  details = {},
  req = null,
  client = null
}) {
  const runner = client || pool;
  const ipAddress = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';

  try {
    await runner.query(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      userId,
      username,
      action,
      entityType,
      entityId ? String(entityId) : null,
      JSON.stringify(details),
      ipAddress
    ]);
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}
