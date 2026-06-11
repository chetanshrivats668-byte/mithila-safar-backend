import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

const VALID_CAB_COLUMNS = [
  'id', 'collaboratorId', 'cabName', 'cabNumber', 'driverName', 'driverPhone',
  'cabType', 'fare', 'route', 'status', 'createdAt', 'updatedAt'
];

function filterSupabaseColumns(data) {
  const filtered = {};
  for (const key of VALID_CAB_COLUMNS) {
    if (data[key] !== undefined) {
      filtered[key] = data[key];
    }
  }
  return filtered;
}

export async function createCab(db, data) {
  const cabId = 'CAB' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const cabData = {
    id: cabId,
    collaboratorId: data.collaboratorId,
    cabName: data.cabName || data.vehicleModel || '',
    cabNumber: data.cabNumber || data.vehicleNumber || '',
    driverName: data.driverName || '',
    driverPhone: data.driverPhone || '',
    cabType: data.cabType || data.type || '',
    fare: Number(data.fare ?? data.pricePerKm ?? 0),
    route: data.route || data.city || '',
    status: 'pending_approval',
    createdAt: now,
    updatedAt: now
  };
  
  if (!isSupabaseAvailable()) {
    memoryDb.cabs.set(cabId, cabData);
    return { id: cabId, ...cabData };
  }
  
  await dbCreate('collaborator_cabs', cabId, cabData);
  return { id: cabId, ...cabData };
}

export async function getCabById(db, cabId) {
  if (!isSupabaseAvailable()) {
    const cab = memoryDb.cabs.get(cabId);
    return cab || null;
  }
  
  const result = await dbGet('collaborator_cabs', cabId);
  return result || null;
}

export async function getCabsByCollaborator(db, collaboratorId) {
  if (!isSupabaseAvailable()) {
    return Array.from(memoryDb.cabs.values())
      .filter(cab => cab.collaboratorId === collaboratorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  return dbList('collaborator_cabs', {
    filters: [{ column: 'collaboratorId', op: 'eq', value: collaboratorId }],
    orderBy: { column: 'createdAt', ascending: false }
  });
}

export async function updateCab(db, cabId, updates) {
  updates.updatedAt = new Date().toISOString();
  
  if (!isSupabaseAvailable()) {
    const cab = memoryDb.cabs.get(cabId);
    if (!cab) return null;
    const updated = { ...cab, ...updates };
    memoryDb.cabs.set(cabId, updated);
    return { id: cabId, ...updates };
  }
  
  const sanitizedUpdates = filterSupabaseColumns(updates);
  if (Object.keys(sanitizedUpdates).length > 0) {
    await dbUpdate('collaborator_cabs', cabId, sanitizedUpdates);
  }
  return { id: cabId, ...updates };
}

export async function deleteCab(db, cabId) {
  if (!isSupabaseAvailable()) {
    memoryDb.cabs.delete(cabId);
    return { id: cabId, deleted: true };
  }
  
  await dbRemove('collaborator_cabs', cabId);
  return { id: cabId, deleted: true };
}
