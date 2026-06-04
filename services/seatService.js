import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

export async function generateSeatMap(busId, collaboratorId, totalSeats, seatLayout, pricePerSeat, travelDate) {
  const seats = [];
  const isSleeper = seatLayout === 'sleeper';
  const is2x1 = seatLayout === '2x1';

  for (let i = 1; i <= totalSeats; i++) {
    let seatType = 'standard';
    let berth = null;

    if (isSleeper) {
      berth = i <= Math.ceil(totalSeats / 2) ? 'lower' : 'upper';
      seatType = berth === 'lower' ? 'sleeper_lower' : 'sleeper_upper';
    } else if (is2x1) {
      seatType = i % 3 === 0 ? 'luxury' : 'standard';
    }

    const seatId = 'SEAT_' + busId + '_' + String(i).padStart(2, '0');
    const seatData = {
      id: seatId,
      busId,
      collaboratorId,
      seatNumber: i,
      seatLabel: (isSleeper ? (berth === 'lower' ? 'L' : 'U') : '') + 'S' + i,
      seatType,
      berth,
      status: 'available',
      price: pricePerSeat,
      bookingId: null,
      travelDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (!isSupabaseAvailable()) {
      memoryDb.seats.set(seatId, seatData);
    } else {
      await dbCreate('collaborator_seats', seatId, seatData);
    }
    seats.push(seatData);
  }
  return seats;
}

export async function getBusSeats(db, busId, travelDate) {
  if (!isSupabaseAvailable()) {
    return Array.from(memoryDb.seats.values())
      .filter(seat => seat.busId === busId && seat.travelDate === travelDate);
  }
  
  return await dbList('collaborator_seats', {
    filters: [
      { column: 'busId', op: 'eq', value: busId },
      { column: 'travelDate', op: 'eq', value: travelDate }
    ]
  });
}

export async function updateSeatStatus(db, seatId, status, bookingId) {
  const updates = { status, updatedAt: new Date().toISOString() };
  if (bookingId !== undefined && bookingId !== null) updates.bookingId = bookingId;
  
  let parsedBusId = null;
  let parsedSeatNum = null;
  if (seatId.startsWith('SEAT_')) {
    const parts = seatId.split('_');
    if (parts.length >= 3) {
      parsedBusId = parts.slice(1, -1).join('_');
      parsedSeatNum = parseInt(parts[parts.length - 1], 10);
    }
  }

  if (!isSupabaseAvailable()) {
    let seat = memoryDb.seats.get(seatId);
    if (!seat) {
      seat = {
        id: seatId,
        busId: parsedBusId || 'unknown',
        seatNumber: parsedSeatNum || 1,
        seatLabel: 'S' + (parsedSeatNum || 1),
        status: 'available',
        price: 841,
        bookingId: null,
        travelDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      };
    }
    const updated = { ...seat, ...updates };
    memoryDb.seats.set(seatId, updated);
    return { id: seatId, ...updates };
  }
  
  try {
    const existing = await dbGet('collaborator_seats', seatId);
    if (!existing) {
      const newSeat = {
        id: seatId,
        busId: parsedBusId || 'unknown',
        seatNumber: parsedSeatNum || 1,
        seatLabel: 'S' + (parsedSeatNum || 1),
        status: 'available',
        price: 841,
        bookingId: null,
        travelDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        ...updates
      };
      await dbCreate('collaborator_seats', seatId, newSeat);
    } else {
      await dbUpdate('collaborator_seats', seatId, updates);
    }
  } catch (e) {
    await dbUpdate('collaborator_seats', seatId, updates);
  }
  return { id: seatId, ...updates };
}

export async function updateSeatPrice(db, seatId, price) {
  const updates = { price, updatedAt: new Date().toISOString() };
  
  if (!isSupabaseAvailable()) {
    const seat = memoryDb.seats.get(seatId);
    if (!seat) return null;
    const updated = { ...seat, ...updates };
    memoryDb.seats.set(seatId, updated);
    return { id: seatId, price };
  }
  
  await dbUpdate('collaborator_seats', seatId, updates);
  return { id: seatId, price };
}

export async function blockSeats(db, busId, seatIds, travelDate) {
  const results = [];
  for (const seatId of seatIds) {
    const result = await updateSeatStatus(db, seatId, 'blocked');
    results.push(result);
  }
  return results;
}

export async function bookSeats(db, busId, seatIds, bookingId, travelDate) {
  const results = [];
  for (const seatId of seatIds) {
    const result = await updateSeatStatus(db, seatId, 'booked', bookingId);
    results.push(result);
  }
  return results;
}

export async function getSeatOccupancyStats(db, busId, travelDate) {
  const seats = await getBusSeats(db, busId, travelDate);
  const total = seats.length;
  const booked = seats.filter(s => s.status === 'booked' || s.status === 'booked_male' || s.status === 'booked_female').length;
  const available = seats.filter(s => s.status === 'available').length;
  const blocked = seats.filter(s => s.status === 'blocked').length;
  const reserved = seats.filter(s => s.status === 'reserved').length;
  return { 
    total, 
    booked, 
    available, 
    blocked, 
    reserved, 
    occupancyRate: total > 0 ? Math.round((booked / total) * 100) : 0 
  };
}
