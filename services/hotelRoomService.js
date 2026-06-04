import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

export async function generateRoomLayout(hotelId, collaboratorId, totalRooms) {
  const rooms = [];
  for (let i = 1; i <= totalRooms; i++) {
    const roomId = 'ROOM_' + hotelId + '_' + String(i).padStart(2, '0');
    const roomData = {
      id: roomId,
      hotelId,
      collaboratorId,
      roomNumber: String(i),
      roomType: 'Standard',
      capacity: 2,
      price: 0,
      status: 'available',
      images: [],
      description: '',
      amenities: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!isSupabaseAvailable()) {
      memoryDb.room_layouts.set(roomId, roomData);
    } else {
      await dbCreate('hotel_room_layouts', roomId, roomData);
    }
    rooms.push(roomData);
  }
  return rooms;
}

export async function getHotelRooms(db, hotelId) {
  if (!isSupabaseAvailable()) {
    return Array.from(memoryDb.room_layouts.values())
      .filter(r => r.hotelId === hotelId)
      .sort((a, b) => parseInt(a.roomNumber || 0) - parseInt(b.roomNumber || 0));
  }

  return await dbList('hotel_room_layouts', {
    filters: [{ column: 'hotelId', op: 'eq', value: hotelId }],
    orderBy: { column: 'roomNumber', ascending: true }
  });
}

export async function getRoomById(db, roomId) {
  if (!isSupabaseAvailable()) {
    return memoryDb.room_layouts.get(roomId) || null;
  }
  return await dbGet('hotel_room_layouts', roomId);
}

export async function updateRoom(db, roomId, updates) {
  updates.updatedAt = new Date().toISOString();

  if (!isSupabaseAvailable()) {
    const room = memoryDb.room_layouts.get(roomId);
    if (!room) return null;
    const updated = { ...room, ...updates };
    memoryDb.room_layouts.set(roomId, updated);
    return { id: roomId, ...updates };
  }

  await dbUpdate('hotel_room_layouts', roomId, updates);
  return { id: roomId, ...updates };
}

export async function deleteRoom(db, roomId) {
  if (!isSupabaseAvailable()) {
    memoryDb.room_layouts.delete(roomId);
    return { id: roomId, deleted: true };
  }

  await dbRemove('hotel_room_layouts', roomId);
  return { id: roomId, deleted: true };
}

export async function updateRoomStatus(db, roomId, status) {
  const updates = { status, updatedAt: new Date().toISOString() };
  return updateRoom(db, roomId, updates);
}

export async function getRoomOccupancyStats(db, hotelId) {
  const rooms = await getHotelRooms(db, hotelId);
  const total = rooms.length;
  const available = rooms.filter(r => r.status === 'available').length;
  const occupied = rooms.filter(r => r.status === 'booked' || r.status === 'occupied').length;
  const reserved = rooms.filter(r => r.status === 'reserved').length;
  const maintenance = rooms.filter(r => r.status === 'maintenance' || r.status === 'cleaning').length;

  return {
    total,
    available,
    occupied,
    reserved,
    maintenance,
    occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0
  };
}

export async function syncRoomCount(db, hotelId, collaboratorId, newTotal) {
  const existing = await getHotelRooms(db, hotelId);
  const currentTotal = existing.length;

  if (newTotal > currentTotal) {
    const toAdd = [];
    for (let i = currentTotal + 1; i <= newTotal; i++) {
      const roomId = 'ROOM_' + hotelId + '_' + String(i).padStart(2, '0');
      const roomData = {
        id: roomId,
        hotelId,
        collaboratorId,
        roomNumber: String(i),
        roomType: 'Standard',
        capacity: 2,
        price: 0,
        status: 'available',
        images: [],
        description: '',
        amenities: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (!isSupabaseAvailable()) {
        memoryDb.room_layouts.set(roomId, roomData);
      } else {
        await dbCreate('hotel_room_layouts', roomId, roomData);
      }
      toAdd.push(roomData);
    }
    return { action: 'added', rooms: toAdd };
  }

  if (newTotal < currentTotal) {
    const toRemove = existing.filter(r => parseInt(r.roomNumber || 0) > newTotal);
    for (const room of toRemove) {
      if (!isSupabaseAvailable()) {
        memoryDb.room_layouts.delete(room.id);
      } else {
        await dbRemove('hotel_room_layouts', room.id);
      }
    }
    return { action: 'removed', rooms: toRemove };
  }

  return { action: 'unchanged', rooms: [] };
}
