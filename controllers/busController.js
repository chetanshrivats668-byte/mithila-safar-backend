import { sanitizeInput, validateBusCreation } from '../middleware/validator.js';
import * as busService from '../services/busService.js';
import * as seatService from '../services/seatService.js';
import * as auditLogService from '../services/auditLogService.js';

export async function createBus(req, res) {
  try {
    const data = sanitizeInput(req.body);
    data.collaboratorId = req.collaborator.collaboratorId;
    const errors = validateBusCreation(data);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const bus = await busService.createBus(req.app.locals.db, data);

    try {
      await auditLogService.logAction(req.app.locals.db, {
        actorId: req.collaborator.collaboratorId,
        actorRole: 'collaborator',
        action: 'create_bus',
        entityType: 'collaborator_buses',
        entityId: bus.id,
        details: {
          busName: bus.busName,
          route: Array.isArray(bus.routeCities) ? bus.routeCities.join(' → ') : ''
        }
      });
    } catch (auditError) {
      console.error('Create bus audit log error:', auditError);
    }

    res.status(201).json({ success: true, message: 'Bus created and pending approval', bus });
  } catch (e) {
    console.error('Create bus error:', e);
    res.status(500).json({ success: false, message: 'Failed to create bus' });
  }
}

export async function getBuses(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;
    const buses = await busService.getBusesByCollaborator(req.app.locals.db, collabId);
    res.json({ success: true, buses });
  } catch (e) {
    console.error('Get buses error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch buses' });
  }
}

export async function updateBus(req, res) {
  try {
    const { id } = req.params;
    const updates = sanitizeInput(req.body);
    const bus = await busService.getBusById(req.app.locals.db, id);

    if (!bus) {
      return res.status(404).json({ success: false, message: 'Bus not found' });
    }
    if (bus.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updated = await busService.updateBus(req.app.locals.db, id, updates);
    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_bus',
      entityType: 'collaborator_buses',
      entityId: id,
      details: { updates }
    });
    res.json({ success: true, message: 'Bus updated', bus: updated });
  } catch (e) {
    console.error('Update bus error:', e);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
}

export async function deleteBus(req, res) {
  try {
    const { id } = req.params;
    const bus = await busService.getBusById(req.app.locals.db, id);
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });
    if (bus.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await busService.deleteBus(req.app.locals.db, id);
    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'delete_bus',
      entityType: 'collaborator_buses',
      entityId: id,
      details: { busName: bus.busName }
    });
    res.json({ success: true, message: 'Bus deleted' });
  } catch (e) {
    console.error('Delete bus error:', e);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
}

export async function getSeatMap(req, res) {
  try {
    const { busId } = req.params;
    const { date } = req.query;
    const bus = await busService.getBusById(req.app.locals.db, busId);

    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });
    if (bus.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    let seats = await seatService.getBusSeats(req.app.locals.db, busId, date);
    if (seats.length === 0) {
      const pricePerSeat = bus.price_per_km ? Math.round(bus.price_per_km * 20) : 841;
      seats = await seatService.generateSeatMap(
        busId,
        req.collaborator.collaboratorId,
        bus.total_seats || 47,
        bus.seat_layout || '2x3',
        pricePerSeat,
        date
      );
    }
    const stats = await seatService.getSeatOccupancyStats(req.app.locals.db, busId, date);
    res.json({ success: true, seats, stats });
  } catch (e) {
    console.error('Get seat map error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch seats' });
  }
}

export async function updateSeat(req, res) {
  try {
    const { busId } = req.params;
    const { seatId, status, price } = req.body;

    const bus = await busService.getBusById(req.app.locals.db, busId);
    if (!bus || bus.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    let result;
    if (price !== undefined) {
      result = await seatService.updateSeatPrice(req.app.locals.db, seatId, price);
    } else {
      result = await seatService.updateSeatStatus(req.app.locals.db, seatId, status);
    }

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_seat',
      entityType: 'collaborator_seats',
      entityId: seatId,
      details: { busId, status, price }
    });
    res.json({ success: true, message: 'Seat updated', seat: result });
  } catch (e) {
    console.error('Update seat error:', e);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
}

export async function bulkUpdateSeats(req, res) {
  try {
    const { busId } = req.params;
    const { seatIds, action, travelDate } = req.body;

    const bus = await busService.getBusById(req.app.locals.db, busId);
    if (!bus || bus.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    let results;
    if (action === 'block') {
      results = await seatService.blockSeats(req.app.locals.db, busId, seatIds, travelDate);
    } else if (action === 'book') {
      const bookingId = req.body.bookingId;
      results = await seatService.bookSeats(req.app.locals.db, busId, seatIds, bookingId, travelDate);
    }

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'bulk_update_seats',
      entityType: 'collaborator_seats',
      entityId: busId,
      details: { action, seatCount: seatIds?.length, travelDate }
    });
    res.json({ success: true, message: 'Seats ' + action + 'ed', seats: results });
  } catch (e) {
    console.error('Bulk update seats error:', e);
    res.status(500).json({ success: false, message: 'Bulk update failed' });
  }
}

export async function addSchedule(req, res) {
  try {
    const { busId } = req.params;
    const schedule = sanitizeInput(req.body);

    const bus = await busService.getBusById(req.app.locals.db, busId);
    if (!bus || bus.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const schedules = await busService.addBusSchedule(req.app.locals.db, busId, schedule);
    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'add_bus_schedule',
      entityType: 'collaborator_buses',
      entityId: busId,
      details: { schedule }
    });
    res.json({ success: true, message: 'Schedule added', schedules });
  } catch (e) {
    console.error('Add schedule error:', e);
    res.status(500).json({ success: false, message: 'Failed to add schedule' });
  }
}

export async function updatePricing(req, res) {
  try {
    const { busId } = req.params;
    const { pricePerKm, seatPrices } = req.body;

    const bus = await busService.getBusById(req.app.locals.db, busId);
    if (!bus || bus.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updates = {};
    if (pricePerKm !== undefined) updates.pricePerKm = pricePerKm;
    if (Object.keys(updates).length > 0) {
      await busService.updateBus(req.app.locals.db, busId, updates);
    }

    if (seatPrices && Array.isArray(seatPrices)) {
      for (const sp of seatPrices) {
        await seatService.updateSeatPrice(req.app.locals.db, sp.seatId, sp.price);
      }
    }

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_pricing',
      entityType: 'collaborator_buses',
      entityId: busId,
      details: { pricePerKm, seatCount: seatPrices?.length }
    });
    res.json({ success: true, message: 'Pricing updated' });
  } catch (e) {
    console.error('Update pricing error:', e);
    res.status(500).json({ success: false, message: 'Pricing update failed' });
  }
}
