import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

const VALID_CAFE_COLUMNS = [
  'id', 'collaboratorId', 'cafeName', 'address', 'city', 'state', 'capacity', 'location', 'price', 'ownerAadhaarId', 'phone', 'schedule', 'costPerSeat', 'status', 'createdAt', 'updatedAt'
];

function filterSupabaseColumns(data) {
  const filtered = {};
  for (const key of VALID_CAFE_COLUMNS) {
    if (data[key] !== undefined) {
      filtered[key] = data[key];
    }
  }
  return filtered;
}

export async function createCafe(db, data) {
  const cafeId = 'CAF' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const cafeData = {
    id: cafeId,
    collaboratorId: data.collaboratorId,
    cafeName: data.cafeName || data.name || '',
    address: data.address || '',
    city: data.city || '',
    state: data.state || '',
    capacity: Number(data.capacity || 0),
    location: data.location || '',
    price: Number(data.price || 0),
    ownerAadhaarId: data.ownerAadhaarId || '',
    phone: data.phone || '',
    schedule: data.schedule || {},
    status: 'pending_approval',
    createdAt: now,
    updatedAt: now
  };
  
  if (!isSupabaseAvailable()) {
    memoryDb.cafes.set(cafeId, cafeData);
    return { id: cafeId, ...cafeData };
  }
  
  await dbCreate('collaborator_cafes', cafeId, cafeData);
  return { id: cafeId, ...cafeData };
}

export async function getCafeById(db, cafeId) {
  if (!isSupabaseAvailable()) {
    const cafe = memoryDb.cafes.get(cafeId);
    return cafe || null;
  }
  
  const result = await dbGet('collaborator_cafes', cafeId);
  return result || null;
}

export async function getCafesByCollaborator(db, collaboratorId) {
  if (!isSupabaseAvailable()) {
    return Array.from(memoryDb.cafes.values())
      .filter(cafe => cafe.collaboratorId === collaboratorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  return dbList('collaborator_cafes', {
      filters: [{ column: 'collaboratorId', op: 'eq', value: collaboratorId }],
      orderBy: { column: 'createdAt', ascending: false }
  });
}

export async function updateCafe(db, cafeId, updates) {
  updates.updatedAt = new Date().toISOString();
  
  if (!isSupabaseAvailable()) {
    const cafe = memoryDb.cafes.get(cafeId);
    if (!cafe) return null;
    const updated = { ...cafe, ...updates };
    memoryDb.cafes.set(cafeId, updated);
    return { id: cafeId, ...updates };
  }
  
  const sanitizedUpdates = filterSupabaseColumns(updates);
  if (Object.keys(sanitizedUpdates).length > 0) {
    await dbUpdate('collaborator_cafes', cafeId, sanitizedUpdates);
  }
  return { id: cafeId, ...updates };
}

export async function deleteCafe(db, cafeId) {
  if (!isSupabaseAvailable()) {
    memoryDb.cafes.delete(cafeId);
    return { id: cafeId, deleted: true };
  }
  
  await dbRemove('collaborator_cafes', cafeId);
  return { id: cafeId, deleted: true };
}

export async function createTable(db, data) {
  const tableId = 'TBL' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const tableData = {
    id: tableId,
    cafeId: data.cafeId,
    tableNumber: data.tableNumber,
    capacity: Number(data.capacity || 2),
    status: 'available',
    createdAt: now
  };
  await dbCreate('cafe_tables', tableId, tableData);
  return { id: tableId, ...tableData };
}

export async function getTablesByCafe(db, cafeId) {
  return dbList('cafe_tables', {
      filters: [{ column: 'cafeId', op: 'eq', value: cafeId }],
      orderBy: { column: 'tableNumber', ascending: true }
  });
}

export async function updateTableStatus(db, tableId, status) {
  const updates = { status, updatedAt: new Date().toISOString() };
  await dbUpdate('cafe_tables', tableId, updates);
  return { id: tableId, ...updates };
}
