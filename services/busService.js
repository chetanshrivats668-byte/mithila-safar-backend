import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

function normalizeBusRecord(record) {
  if (!record) return null;

  const routeCities = Array.isArray(record.routeCities)
    ? record.routeCities
    : typeof record.route === 'string'
      ? record.route.split('→').map(city => city.trim()).filter(Boolean)
      : [];

  return {
    ...record,
    busName: record.busName ?? record.name ?? '',
    busType: record.busType ?? record.type ?? '',
    numberPlate: record.numberPlate ?? record.number_plate ?? record.busNumber ?? '',
    totalSeats: record.totalSeats ?? record.total_seats ?? 0,
    seatLayout: record.seatLayout ?? record.seat_layout ?? '2x2',
    routeCities,
    pricePerKm: record.pricePerKm ?? record.price_per_km ?? record.fare ?? 0,
    driverName: record.driverName ?? record.driver_name ?? '',
    busPhotos: record.busPhotos ?? [],
    schedules: record.schedules ?? (record.schedule ? [record.schedule] : []),
    source: record.source ?? routeCities[0] ?? '',
    destination: record.destination ?? routeCities[routeCities.length - 1] ?? ''
  };
}

function toDbBusPayload(data, busId) {
  const routeCities = Array.isArray(data.routeCities)
    ? data.routeCities.map(city => String(city).trim()).filter(Boolean)
    : [];

  return {
    id: busId,
    collaboratorId: data.collaboratorId,
    busName: data.busName,
    busNumber: data.numberPlate,
    route: routeCities.join(' → '),
    source: routeCities[0] || '',
    destination: routeCities[routeCities.length - 1] || '',
    departureTime: data.departureTime || '',
    arrivalTime: data.arrivalTime || '',
    totalSeats: data.totalSeats,
    fare: data.pricePerKm,
    amenities: data.busPhotos || [],
    schedule: {
      seatLayout: data.seatLayout || '2x2',
      driverName: data.driverName || '',
      routeCities,
      schedules: data.schedules || []
    },
    status: 'pending_approval'
  };
}

function toDbBusUpdates(updates) {
  const dbUpdates = { updatedAt: new Date().toISOString() };

  if (updates.busName !== undefined) dbUpdates.busName = updates.busName;
  if (updates.numberPlate !== undefined) dbUpdates.busNumber = updates.numberPlate;
  if (updates.totalSeats !== undefined) dbUpdates.totalSeats = updates.totalSeats;
  if (updates.pricePerKm !== undefined) dbUpdates.fare = updates.pricePerKm;
  if (updates.departureTime !== undefined) dbUpdates.departureTime = updates.departureTime;
  if (updates.arrivalTime !== undefined) dbUpdates.arrivalTime = updates.arrivalTime;
  if (updates.busPhotos !== undefined) dbUpdates.amenities = updates.busPhotos;

  if (Array.isArray(updates.routeCities)) {
    const routeCities = updates.routeCities.map(city => String(city).trim()).filter(Boolean);
    dbUpdates.route = routeCities.join(' → ');
    dbUpdates.source = routeCities[0] || '';
    dbUpdates.destination = routeCities[routeCities.length - 1] || '';
  }

  if (
    updates.busType !== undefined ||
    updates.seatLayout !== undefined ||
    updates.driverName !== undefined ||
    updates.schedules !== undefined ||
    Array.isArray(updates.routeCities)
  ) {
    const routeCities = Array.isArray(updates.routeCities)
      ? updates.routeCities.map(city => String(city).trim()).filter(Boolean)
      : undefined;

    dbUpdates.schedule = {};
    if (updates.busType !== undefined) dbUpdates.schedule.busType = updates.busType;
    if (updates.seatLayout !== undefined) dbUpdates.schedule.seatLayout = updates.seatLayout;
    if (updates.driverName !== undefined) dbUpdates.schedule.driverName = updates.driverName;
    if (updates.schedules !== undefined) dbUpdates.schedule.schedules = updates.schedules;
    if (routeCities !== undefined) dbUpdates.schedule.routeCities = routeCities;
  }

  return dbUpdates;
}

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

  await dbCreate('collaborator_buses', busId, {
    ...toDbBusPayload(busData, busId),
    createdAt: now,
    updatedAt: now
  });
  return { id: busId, ...busData };
}

export async function getBusById(db, busId) {
  if (!isSupabaseAvailable()) {
    const bus = memoryDb.buses.get(busId);
    return bus || null;
  }

  const result = await dbGet('collaborator_buses', busId);
  return normalizeBusRecord(result);
}

export async function getBusesByCollaborator(db, collaboratorId) {
  if (!isSupabaseAvailable()) {
    return Array.from(memoryDb.buses.values())
      .filter(bus => bus.collaboratorId === collaboratorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const buses = await dbList('collaborator_buses', {
    filters: [{ column: 'collaboratorId', op: 'eq', value: collaboratorId }],
    orderBy: { column: 'createdAt', ascending: false }
  });
  return buses.map(normalizeBusRecord);
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

  await dbUpdate('collaborator_buses', busId, toDbBusUpdates(updates));
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

  await dbUpdate('collaborator_buses', busId, toDbBusUpdates({ schedules }));
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
    .map(normalizeBusRecord)
    .filter(bus => {
      const routeCities = bus.routeCities || [];
      const fromIdx = routeCities.findIndex(c => c.toLowerCase() === from.toLowerCase());
      const toIdx = routeCities.findIndex(c => c.toLowerCase() === to.toLowerCase());
      return fromIdx !== -1 && toIdx !== -1 && toIdx > fromIdx;
    });
}
