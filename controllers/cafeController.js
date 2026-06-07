import * as cafeService from '../services/cafeService.js';
import * as auditLogService from '../services/auditLogService.js';

export async function createCafe(req, res) {
  try {
    const data = req.body;
    data.collaboratorId = req.collaborator.collaboratorId;
    const cafe = await cafeService.createCafe(req.app.locals.db, data);
    try {
      await auditLogService.logAction(req.app.locals.db, {
        actorId: req.collaborator.collaboratorId,
        actorRole: 'collaborator',
        action: 'create_cafe',
        entityType: 'collaborator_cafes',
        entityId: cafe.id,
        details: { cafeName: cafe.cafeName }
      });
    } catch (auditError) {
      console.error('Create cafe audit log error:', auditError);
    }
    res.status(201).json({ success: true, message: 'Cafe created and pending approval', cafe });
  } catch (e) {
    console.error('Create cafe error:', e);
    res.status(500).json({ success: false, message: 'Failed to create cafe' });
  }
}

export async function getCafes(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;
    const cafes = await cafeService.getCafesByCollaborator(req.app.locals.db, collabId);
    res.json({ success: true, cafes });
  } catch (e) {
    console.error('Get cafes error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch cafes' });
  }
}

export async function getCafe(req, res) {
  try {
    const { id } = req.params;
    const cafe = await cafeService.getCafeById(req.app.locals.db, id);
    if (!cafe) {
      return res.status(404).json({ success: false, message: 'Cafe not found' });
    }
    if (cafe.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    res.json({ success: true, cafe });
  } catch (e) {
    console.error('Get cafe error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch cafe' });
  }
}

export async function updateCafe(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const cafe = await cafeService.getCafeById(req.app.locals.db, id);
    if (!cafe) {
      return res.status(404).json({ success: false, message: 'Cafe not found' });
    }
    if (cafe.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const updated = await cafeService.updateCafe(req.app.locals.db, id, updates);
    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_cafe',
      entityType: 'collaborator_cafes',
      entityId: id,
      details: { updates }
    });
    res.json({ success: true, message: 'Cafe updated', cafe: updated });
  } catch (e) {
    console.error('Update cafe error:', e);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
}

export async function deleteCafe(req, res) {
  try {
    const { id } = req.params;
    const cafe = await cafeService.getCafeById(req.app.locals.db, id);
    if (!cafe) return res.status(404).json({ success: false, message: 'Cafe not found' });
    if (cafe.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await cafeService.deleteCafe(req.app.locals.db, id);
    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'delete_cafe',
      entityType: 'collaborator_cafes',
      entityId: id,
      details: { cafeName: cafe.cafeName }
    });
    res.json({ success: true, message: 'Cafe deleted' });
  } catch (e) {
    console.error('Delete cafe error:', e);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
}

export async function createTable(req, res) {
  try {
    const data = req.body;
    const cafe = await cafeService.getCafeById(req.app.locals.db, data.cafeId);
    if (!cafe) return res.status(404).json({ success: false, message: 'Cafe not found' });
    if (cafe.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const table = await cafeService.createTable(req.app.locals.db, data);
    try {
      await auditLogService.logAction(req.app.locals.db, {
        actorId: req.collaborator.collaboratorId,
        actorRole: 'collaborator',
        action: 'create_table',
        entityType: 'cafe_tables',
        entityId: table.id,
        details: { cafeId: data.cafeId, tableNumber: table.tableNumber }
      });
    } catch (auditError) {
      console.error('Create table audit log error:', auditError);
    }
    res.status(201).json({ success: true, message: 'Table created', table });
  } catch (e) {
    console.error('Create table error:', e);
    res.status(500).json({ success: false, message: 'Failed to create table' });
  }
}

export async function getTables(req, res) {
  try {
    const { cafeId } = req.params;
    const cafe = await cafeService.getCafeById(req.app.locals.db, cafeId);
    if (!cafe) return res.status(404).json({ success: false, message: 'Cafe not found' });
    if (cafe.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const tables = await cafeService.getTablesByCafe(req.app.locals.db, cafeId);
    res.json({ success: true, tables });
  } catch (e) {
    console.error('Get tables error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch tables' });
  }
}

export async function updateTableStatus(req, res) {
  try {
    const { tableId } = req.params;
    const { status } = req.body;
    const validStatuses = ['available', 'reserved', 'occupied', 'cleaning'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const updated = await cafeService.updateTableStatus(req.app.locals.db, tableId, status);
    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_table_status',
      entityType: 'cafe_tables',
      entityId: tableId,
      details: { tableId, status }
    });
    res.json({ success: true, message: 'Table status updated', table: updated });
  } catch (e) {
    console.error('Update table status error:', e);
    res.status(500).json({ success: false, message: 'Failed to update table status' });
  }
}
