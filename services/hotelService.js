import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

export async function createHotel(db, data) {
  const hotelId = 'HTL' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const hotelData = {
    id: hotelId,
    collaboratorId: data.collaboratorId,
    hotelName: data.hotelName || data.name || '',
    address: data.address || '',
    city: data.city || '',
    amenities: Array.isArray(data.amenities) ? data.amenities : [],
    status: 'pending_approval',
    createdAt: now,
    updatedAt: now
  };
  
  if (!isSupabaseAvailable()) {
    memoryDb.hotels.set(hotelId, hotelData);
    return { id: hotelId, ...hotelData };
  }
  
  return await dbCreate('collaborator_hotels', hotelId, hotelData);
}

export async function getHotelById(db, hotelId) {
  if (!isSupabaseAvailable()) {
    const hotel = memoryDb.hotels.get(hotelId);
    return hotel || null;
  }
  
  return await dbGet('collaborator_hotels', hotelId);
}

export async function getHotelsByCollaborator(db, collaboratorId) {
  if (!isSupabaseAvailable()) {
    return Array.from(memoryDb.hotels.values())
      .filter(hotel => hotel.collaboratorId === collaboratorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  return await dbList('collaborator_hotels', {
    filters: [{ column: 'collaboratorId', op: 'eq', value: collaboratorId }],
    orderBy: { column: 'createdAt', ascending: false }
  });
}

export async function updateHotel(db, hotelId, updates) {
  updates.updatedAt = new Date().toISOString();
  
  if (!isSupabaseAvailable()) {
    const hotel = memoryDb.hotels.get(hotelId);
    if (!hotel) return null;
    const updated = { ...hotel, ...updates };
    memoryDb.hotels.set(hotelId, updated);
    return { id: hotelId, ...updates };
  }
  
  return await dbUpdate('collaborator_hotels', hotelId, updates);
}

export async function deleteHotel(db, hotelId) {
  if (!isSupabaseAvailable()) {
    memoryDb.hotels.delete(hotelId);
    return { id: hotelId, deleted: true };
  }
  
  await dbRemove('collaborator_hotels', hotelId);
  return { id: hotelId, deleted: true };
}

export async function createRoom(db, data) {
  const roomId = 'ROM' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const totalRooms = Number(data.totalRooms || 0);
  const roomData = {
    id: roomId,
    hotelId: data.hotelId,
    roomType: data.roomType || data.type || '',
    price: Number(data.price || 0),
    totalRooms,
    availableRooms: data.availableRooms !== undefined ? Number(data.availableRooms) : totalRooms,
    amenities: Array.isArray(data.amenities) ? data.amenities : [],
    createdAt: now
  };
  return await dbCreate('hotel_rooms', roomId, roomData);
}

export async function getRoomsByHotel(db, hotelId) {
  return await dbList('hotel_rooms', {
    filters: [{ column: 'hotelId', op: 'eq', value: hotelId }],
    orderBy: { column: 'roomType', ascending: true }
  });
}

export async function updateRoomStatus(db, roomId, status) {
  const updates = { status, updatedAt: new Date().toISOString() };
  return await dbUpdate('hotel_rooms', roomId, updates);
}
