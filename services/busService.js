import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

export async function createBus(db, data) {
  const busId = 'BUS' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const busData = {
    id: busId,
    collaboratorId: data.collaboratorId,
    busName: data.busName,
    busType: data.busType,
    numberPlate: data.numberPlate,
    totalSeats: data.totalSeats,
    seatLayout: data.seatLayout || '2x2',
    routeCities: data.routeCities,
    pricePerKm: data.pricePerKm,
    driverName: data.driverName || '',
    busPhotos: data.busPhotos || [],
    status: 'pending_approval',
    schedules: [],
    createdAt: now,
    updatedAt: now
  };

  if (!isSupabaseAvailable()) {
    memoryDb.buses.set(busId, busData);
    return { id: busId, ...busData };
  }

  await dbCreate('collaborator_buses', busId, busData);
  return { id: busId, ...busData };
}

export async function getBusById(db, busId) {
  if (!isSupabaseAvailable()) {
    const bus = memoryDb.buses.get(busId);
    return bus || null;
  }

  const result = await dbGet('collaborator_buses', busId);
  return result || null;
}

export async function getBusesByCollaborator(db, collaboratorId) {
  if (!isSupabaseAvailable()) {
    return Array.from(memoryDb.buses.values())
      .filter(bus => bus.collaboratorId === collaboratorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return dbList('collaborator_buses', {
    filters: [{ column: 'collaboratorId', op: 'eq', value: collaboratorId }],
    orderBy: { column: 'createdAt', ascending: false }
  });
}

export async function updateBus(db, busId, updates) {
  updates.updatedAt = new Date().toISOString();

  if (!isSupabaseAvailable()) {
    const bus = memoryDb.buses.get(busId);
    if (!bus) return null;
    const updated = { ...bus, ...updates };
    memoryDb.buses.set(busId, updated);
    return { id: busId, ...updates };
  }

  await dbUpdate('collaborator_buses', busId, updates);
  return { id: busId, ...updates };
}

export async function deleteBus(db, busId) {
  if (!isSupabaseAvailable()) {
    memoryDb.buses.delete(busId);
    return { id: busId, deleted: true };
  }

  await dbRemove('collaborator_buses', busId);
  return { id: busId, deleted: true };
}

export async function addBusSchedule(db, busId, schedule) {
  const bus = await getBusById(db, busId);
  if (!bus) return null;
  const schedules = bus.schedules || [];
  schedules.push({
    id: 'SCH' + Date.now().toString(36).toUpperCase(),
    ...schedule,
    createdAt: new Date().toISOString()
  });

  if (!isSupabaseAvailable()) {
    const updated = { ...bus, schedules, updatedAt: new Date().toISOString() };
    memoryDb.buses.set(busId, updated);
    return schedules;
  }

  await dbUpdate('collaborator_buses', busId, { schedules, updatedAt: new Date().toISOString() });
  return schedules;
}

export async function getActiveBusesByRoute(db, from, to) {
  if (!isSupabaseAvailable()) {
    return Array.from(memoryDb.buses.values())
      .filter(bus => bus.status === 'active')
      .filter(bus => {
        const routeCities = bus.routeCities || [];
        const fromIdx = routeCities.findIndex(c => c.toLowerCase() === from.toLowerCase());
        const toIdx = routeCities.findIndex(c => c.toLowerCase() === to.toLowerCase());
        return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
      });
  }

  const buses = await dbList('collaborator_buses', {
    filters: [{ column: 'status', op: 'eq', value: 'active' }]
  });
  return buses
    .filter(bus => {
      const routeCities = bus.routeCities || [];
      const fromIdx = routeCities.findIndex(c => c.toLowerCase() === from.toLowerCase());
      const toIdx = routeCities.findIndex(c => c.toLowerCase() === to.toLowerCase());
      return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
    });
}
