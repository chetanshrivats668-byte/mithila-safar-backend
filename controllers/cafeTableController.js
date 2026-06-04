import * as cafeTableService from '../services/cafeTableService.js';
import * as auditLogService from '../services/auditLogService.js';

export async function generateTableLayout(req, res) {
  try {
    const { cafeId, totalTables } = req.body;
    if (!cafeId || !totalTables || totalTables < 1) {
      return res.status(400).json({ success: false, message: 'Valid cafeId and totalTables are required' });
    }

    const tables = await cafeTableService.generateTableLayout(cafeId, req.collaborator.collaboratorId, totalTables);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'generate_table_layout',
      entityType: 'cafe_table_layout',
      entityId: cafeId,
      details: { totalTables }
    });

    res.status(201).json({ success: true, message: 'Table layout generated', tables });
  } catch (e) {
    console.error('Generate table layout error:', e);
    res.status(500).json({ success: false, message: 'Failed to generate table layout' });
  }
}

export async function getTables(req, res) {
  try {
    const { cafeId } = req.params;
    const tables = await cafeTableService.getCafeTables(req.app.locals.db, cafeId);
    res.json({ success: true, tables });
  } catch (e) {
    console.error('Get tables error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch tables' });
  }
}

export async function updateTable(req, res) {
  try {
    const { tableId } = req.params;
    const table = await cafeTableService.getTableById(req.app.locals.db, tableId);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    if (table.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updates = req.body;
    const updated = await cafeTableService.updateTable(req.app.locals.db, tableId, updates);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_table',
      entityType: 'cafe_table_layout',
      entityId: tableId,
      details: updates
    });

    res.json({ success: true, message: 'Table updated', table: updated });
  } catch (e) {
    console.error('Update table error:', e);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
}

export async function updateTableStatus(req, res) {
  try {
    const { tableId } = req.params;
    const { status } = req.body;
    const validStatuses = ['available', 'reserved', 'occupied', 'cleaning', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const table = await cafeTableService.getTableById(req.app.locals.db, tableId);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    if (table.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updated = await cafeTableService.updateTableStatus(req.app.locals.db, tableId, status);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_table_status',
      entityType: 'cafe_table_layout',
      entityId: tableId,
      details: { status }
    });

    res.json({ success: true, message: 'Table status updated', table: updated });
  } catch (e) {
    console.error('Update table status error:', e);
    res.status(500).json({ success: false, message: 'Failed to update table status' });
  }
}

export async function deleteTable(req, res) {
  try {
    const { tableId } = req.params;
    const table = await cafeTableService.getTableById(req.app.locals.db, tableId);
    if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
    if (table.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await cafeTableService.deleteTable(req.app.locals.db, tableId);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'delete_table',
      entityType: 'cafe_table_layout',
      entityId: tableId
    });

    res.json({ success: true, message: 'Table deleted' });
  } catch (e) {
    console.error('Delete table error:', e);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
}

export async function syncTableCount(req, res) {
  try {
    const { cafeId, totalTables } = req.body;
    if (!cafeId || !totalTables || totalTables < 1) {
      return res.status(400).json({ success: false, message: 'Valid cafeId and totalTables are required' });
    }

    const firstTableId = 'TABLE_' + cafeId + '_01';
    const table = await cafeTableService.getTableById(req.app.locals.db, firstTableId);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Table layout not found. Please generate layout first.' });
    }
    if (table.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const result = await cafeTableService.syncTableCount(req.app.locals.db, cafeId, req.collaborator.collaboratorId, totalTables);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'sync_table_count',
      entityType: 'cafe_table_layout',
      entityId: cafeId,
      details: { totalTables, action: result.action }
    });

    res.json({ success: true, message: `Table count synced: ${result.action}`, result });
  } catch (e) {
    console.error('Sync table count error:', e);
    res.status(500).json({ success: false, message: 'Failed to sync table count' });
  }
}

export async function getTableStats(req, res) {
  try {
    const { cafeId } = req.params;
    const stats = await cafeTableService.getTableOccupancyStats(req.app.locals.db, cafeId);
    res.json({ success: true, stats });
  } catch (e) {
    console.error('Get table stats error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch table stats' });
  }
}
