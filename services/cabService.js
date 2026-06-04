import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

export async function createCab(db, data) {
  const cabId = 'CAB' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const cabData = {
    id: cabId,
    collaboratorId: data.collaboratorId,
    vehicleModel: data.vehicleModel,
    vehicleNumber: data.vehicleNumber,
    type: data.type,
    capacity: data.capacity,
    acAvailable: data.acAvailable !== undefined ? data.acAvailable : true,
    pricePerKm: data.pricePerKm,
    driverName: data.driverName || '',
    driverPhone: data.driverPhone || '',
    status: 'pending_approval',
    city: data.city,
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
    filters: [{ field: 'collaboratorId', operator: 'eq', value: collaboratorId }],
    orderBy: { field: 'createdAt', direction: 'desc' }
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
  
  await dbUpdate('collaborator_cabs', cabId, updates);
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
