import * as hotelRoomService from '../services/hotelRoomService.js';
import * as auditLogService from '../services/auditLogService.js';

export async function generateRoomLayout(req, res) {
  try {
    const { hotelId, totalRooms } = req.body;
    if (!hotelId || !totalRooms || totalRooms < 1) {
      return res.status(400).json({ success: false, message: 'Valid hotelId and totalRooms are required' });
    }

    const hotel = await hotelRoomService.getRoomById(req.app.locals.db, 'ROOM_' + hotelId + '_01');
    const ownerCollaboratorId = hotel ? hotel.collaboratorId : null;

    const rooms = await hotelRoomService.generateRoomLayout(hotelId, req.collaborator.collaboratorId, totalRooms);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'generate_room_layout',
      entityType: 'hotel_room_layout',
      entityId: hotelId,
      details: { totalRooms }
    });

    res.status(201).json({ success: true, message: 'Room layout generated', rooms });
  } catch (e) {
    console.error('Generate room layout error:', e);
    res.status(500).json({ success: false, message: 'Failed to generate room layout' });
  }
}

export async function getRooms(req, res) {
  try {
    const { hotelId } = req.params;
    const rooms = await hotelRoomService.getHotelRooms(req.app.locals.db, hotelId);
    res.json({ success: true, rooms });
  } catch (e) {
    console.error('Get rooms error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch rooms' });
  }
}

export async function updateRoom(req, res) {
  try {
    const { roomId } = req.params;
    const room = await hotelRoomService.getRoomById(req.app.locals.db, roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updates = req.body;
    const updated = await hotelRoomService.updateRoom(req.app.locals.db, roomId, updates);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_room',
      entityType: 'hotel_room_layout',
      entityId: roomId,
      details: updates
    });

    res.json({ success: true, message: 'Room updated', room: updated });
  } catch (e) {
    console.error('Update room error:', e);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
}

export async function updateRoomStatus(req, res) {
  try {
    const { roomId } = req.params;
    const { status } = req.body;
    const validStatuses = ['available', 'booked', 'reserved', 'cleaning', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const room = await hotelRoomService.getRoomById(req.app.locals.db, roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updated = await hotelRoomService.updateRoomStatus(req.app.locals.db, roomId, status);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_room_status',
      entityType: 'hotel_room_layout',
      entityId: roomId,
      details: { status }
    });

    res.json({ success: true, message: 'Room status updated', room: updated });
  } catch (e) {
    console.error('Update room status error:', e);
    res.status(500).json({ success: false, message: 'Failed to update room status' });
  }
}

export async function deleteRoom(req, res) {
  try {
    const { roomId } = req.params;
    const room = await hotelRoomService.getRoomById(req.app.locals.db, roomId);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await hotelRoomService.deleteRoom(req.app.locals.db, roomId);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'delete_room',
      entityType: 'hotel_room_layout',
      entityId: roomId
    });

    res.json({ success: true, message: 'Room deleted' });
  } catch (e) {
    console.error('Delete room error:', e);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
}

export async function syncRoomCount(req, res) {
  try {
    const { hotelId, totalRooms } = req.body;
    if (!hotelId || !totalRooms || totalRooms < 1) {
      return res.status(400).json({ success: false, message: 'Valid hotelId and totalRooms are required' });
    }

    const firstRoomId = 'ROOM_' + hotelId + '_01';
    const room = await hotelRoomService.getRoomById(req.app.locals.db, firstRoomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Hotel layout not found. Please generate layout first.' });
    }
    if (room.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const result = await hotelRoomService.syncRoomCount(req.app.locals.db, hotelId, req.collaborator.collaboratorId, totalRooms);

    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'sync_room_count',
      entityType: 'hotel_room_layout',
      entityId: hotelId,
      details: { totalRooms, action: result.action }
    });

    res.json({ success: true, message: `Room count synced: ${result.action}`, result });
  } catch (e) {
    console.error('Sync room count error:', e);
    res.status(500).json({ success: false, message: 'Failed to sync room count' });
  }
}

export async function getRoomStats(req, res) {
  try {
    const { hotelId } = req.params;
    const stats = await hotelRoomService.getRoomOccupancyStats(req.app.locals.db, hotelId);
    res.json({ success: true, stats });
  } catch (e) {
    console.error('Get room stats error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch room stats' });
  }
}
