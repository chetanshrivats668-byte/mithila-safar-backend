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

    // --- Simulating a real platform like redBus ---
    // Generate some random statuses for realism
    let status = 'available';
    
    // Make the randomness consistent based on the seat number and bus so it doesn't flicker on refresh
    // We use a simple pseudo-random hash logic
    const hashStr = busId + travelDate + i;
    let hash = 0;
    for (let k = 0; k < hashStr.length; k++) {
      hash = ((hash << 5) - hash) + hashStr.charCodeAt(k);
      hash |= 0;
    }
    const rand = Math.abs(hash) % 100;

    // ~30% seats are booked, 5% blocked
    if (rand < 30) {
      status = 'booked';
    } else if (rand >= 30 && rand < 35) {
      status = 'blocked';
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
      status,
      price: pricePerSeat,
      bookingId: status.startsWith('booked') ? 'BKG_DEMO_' + hash : null,
      travelDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Always store in memoryDb for runtime access (demo buses and real buses alike)
    memoryDb.seats.set(seatId, seatData);
    
    if (isSupabaseAvailable() && collaboratorId && !collaboratorId.startsWith('DEMO_')) {
      // Only persist to Supabase for real (non-demo) buses
      // Only insert columns that exist in Supabase schema:
      // id, busId, seatNumber, travelDate, status, price, bookedBy, collaboratorId, createdAt
      const seatDataForDb = {
        id: seatData.id,
        busId: seatData.busId,
        seatNumber: String(seatData.seatNumber),
        travelDate: seatData.travelDate,
        status: seatData.status,
        price: seatData.price,
        bookedBy: seatData.bookingId || null,
        collaboratorId: seatData.collaboratorId,
        createdAt: seatData.createdAt
      };
      await dbCreate('collaborator_seats', seatId, seatDataForDb);
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
