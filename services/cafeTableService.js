import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

export async function generateTableLayout(cafeId, collaboratorId, totalTables) {
  const tables = [];
  for (let i = 1; i <= totalTables; i++) {
    const tableId = 'TABLE_' + cafeId + '_' + String(i).padStart(2, '0');
    const tableData = {
      id: tableId,
      cafeId,
      collaboratorId,
      tableNumber: 'T' + i,
      seatingCapacity: 4,
      status: 'available',
      position: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!isSupabaseAvailable()) {
      memoryDb.table_layouts.set(tableId, tableData);
    } else {
      await dbCreate('cafe_table_layouts', tableId, tableData);
    }
    tables.push(tableData);
  }
  return tables;
}

export async function getCafeTables(db, cafeId) {
  if (!isSupabaseAvailable()) {
    return Array.from(memoryDb.table_layouts.values())
      .filter(t => t.cafeId === cafeId)
      .sort((a, b) => {
        const numA = parseInt((a.tableNumber || 'T0').replace('T', ''));
        const numB = parseInt((b.tableNumber || 'T0').replace('T', ''));
        return numA - numB;
      });
  }

  return await dbList('cafe_table_layouts', {
    filters: [{ column: 'cafeId', op: 'eq', value: cafeId }],
    orderBy: { column: 'tableNumber', ascending: true }
  });
}

export async function getTableById(db, tableId) {
  if (!isSupabaseAvailable()) {
    return memoryDb.table_layouts.get(tableId) || null;
  }
  return await dbGet('cafe_table_layouts', tableId);
}

export async function updateTable(db, tableId, updates) {
  updates.updatedAt = new Date().toISOString();

  if (!isSupabaseAvailable()) {
    const table = memoryDb.table_layouts.get(tableId);
    if (!table) return null;
    const updated = { ...table, ...updates };
    memoryDb.table_layouts.set(tableId, updated);
    return { id: tableId, ...updates };
  }

  await dbUpdate('cafe_table_layouts', tableId, updates);
  return { id: tableId, ...updates };
}

export async function deleteTable(db, tableId) {
  if (!isSupabaseAvailable()) {
    memoryDb.table_layouts.delete(tableId);
    return { id: tableId, deleted: true };
  }

  await dbRemove('cafe_table_layouts', tableId);
  return { id: tableId, deleted: true };
}

export async function updateTableStatus(db, tableId, status) {
  const updates = { status, updatedAt: new Date().toISOString() };
  return updateTable(db, tableId, updates);
}

export async function getTableOccupancyStats(db, cafeId) {
  const tables = await getCafeTables(db, cafeId);
  const total = tables.length;
  const available = tables.filter(t => t.status === 'available').length;
  const reserved = tables.filter(t => t.status === 'reserved').length;
  const occupied = tables.filter(t => t.status === 'occupied').length;
  const maintenance = tables.filter(t => t.status === 'cleaning' || t.status === 'maintenance').length;

  return {
    total,
    available,
    reserved,
    occupied,
    maintenance,
    occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0
  };
}

export async function syncTableCount(db, cafeId, collaboratorId, newTotal) {
  const existing = await getCafeTables(db, cafeId);
  const currentTotal = existing.length;

  if (newTotal > currentTotal) {
    const toAdd = [];
    for (let i = currentTotal + 1; i <= newTotal; i++) {
      const tableId = 'TABLE_' + cafeId + '_' + String(i).padStart(2, '0');
      const tableData = {
        id: tableId,
        cafeId,
        collaboratorId,
        tableNumber: 'T' + i,
        seatingCapacity: 4,
        status: 'available',
        position: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (!isSupabaseAvailable()) {
        memoryDb.table_layouts.set(tableId, tableData);
      } else {
        await dbCreate('cafe_table_layouts', tableId, tableData);
      }
      toAdd.push(tableData);
    }
    return { action: 'added', tables: toAdd };
  }

  if (newTotal < currentTotal) {
    const toRemove = existing.filter(t => parseInt((t.tableNumber || 'T0').replace('T', '')) > newTotal);
    for (const table of toRemove) {
      if (!isSupabaseAvailable()) {
        memoryDb.table_layouts.delete(table.id);
      } else {
        await dbRemove('cafe_table_layouts', table.id);
      }
    }
    return { action: 'removed', tables: toRemove };
  }

  return { action: 'unchanged', tables: [] };
}
