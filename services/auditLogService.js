import { get as dbGet, list as dbList, update as dbUpdate, remove as dbRemove, create as dbCreate, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

const AUDIT_LOG_KEY = 'audit_logs';

export async function logAction(db, data) {
  const logId = 'LOG_' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  // audit_logs table uses unquoted snake_case columns (migration-0006)
  const logEntry = {
    id: logId,
    action: data.action,
    entity_type: data.entityType,
    entity_id: data.entityId || null,
    collaborator_id: data.actorId || null,
    admin_id: data.actorRole === 'admin' ? (data.actorId || 'admin') : null,
    details: data.details || {},
    ip_address: data.ipAddress || null,
    created_at: now
  };

  if (!isSupabaseAvailable()) {
    if (!memoryDb[AUDIT_LOG_KEY]) {
      memoryDb[AUDIT_LOG_KEY] = new Map();
    }
    memoryDb[AUDIT_LOG_KEY].set(logId, logEntry);
    return { id: logId, ...logEntry };
  }

  await dbCreate('audit_logs', logId, logEntry);
  return { id: logId, ...logEntry };
}

export async function getAuditLogs(db, opts = {}) {
  const { limit = 100, entityType, actorId, action } = opts;

  if (!isSupabaseAvailable()) {
    let logs = Array.from((memoryDb[AUDIT_LOG_KEY] || new Map()).values());
    if (entityType) logs = logs.filter(l => l.entity_type === entityType);
    if (actorId) logs = logs.filter(l => l.collaborator_id === actorId);
    if (action) logs = logs.filter(l => l.action === action);
    logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return logs.slice(0, limit);
  }

  let query = dbList('audit_logs', {
    orderBy: { column: 'created_at', ascending: false },
    limit
  });

  if (entityType) {
    query = dbList('audit_logs', {
      filters: [{ column: 'entity_type', op: 'eq', value: entityType }],
      orderBy: { column: 'created_at', ascending: false },
      limit
    });
  }

  return query;
}

export async function getServiceAuditLogs(db, serviceType, serviceId) {
  if (!isSupabaseAvailable()) {
    const logs = Array.from((memoryDb[AUDIT_LOG_KEY] || new Map()).values());
    return logs
      .filter(l => l.entity_type === serviceType && l.entity_id === serviceId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  return dbList('audit_logs', {
    filters: [
      { column: 'entity_type', op: 'eq', value: serviceType },
      { column: 'entity_id', op: 'eq', value: serviceId }
    ],
    orderBy: { column: 'created_at', ascending: false }
  });
}
