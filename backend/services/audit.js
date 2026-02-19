const pool = require('../config/database');

const logAudit = async ({
  actorUserId,
  scopeUserId,
  action,
  entityType,
  entityId = null,
  oldValues = null,
  newValues = null,
  reason = null,
}) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (
        actor_user_id,
        scope_user_id,
        action,
        entity_type,
        entity_id,
        old_values,
        new_values,
        reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actorUserId,
        scopeUserId,
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        reason,
      ]
    );
  } catch (error) {
    console.error('Audit log failure:', error);
  }
};

module.exports = { logAudit };
