import * as hotelService from '../services/hotelService.js';
import * as auditLogService from '../services/auditLogService.js';

export async function createHotel(req, res) {
  try {
    const data = req.body;
    data.collaboratorId = req.collaborator.collaboratorId;
    const hotel = await hotelService.createHotel(req.app.locals.db, data);
    try {
      await auditLogService.logAction(req.app.locals.db, {
        actorId: req.collaborator.collaboratorId,
        actorRole: 'collaborator',
        action: 'create_hotel',
        entityType: 'collaborator_hotels',
        entityId: hotel.id,
        details: { hotelName: hotel.hotelName }
      });
    } catch (auditError) {
      console.error('Create hotel audit log error:', auditError);
    }
    res.status(201).json({ success: true, message: 'Hotel created and pending approval', hotel });
  } catch (e) {
    console.error('Create hotel error:', e);
    res.status(500).json({ success: false, message: 'Failed to create hotel' });
  }
}

export async function getHotels(req, res) {
  try {
    const collabId = req.collaborator.collaboratorId;
    const hotels = await hotelService.getHotelsByCollaborator(req.app.locals.db, collabId);
    res.json({ success: true, hotels });
  } catch (e) {
    console.error('Get hotels error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch hotels' });
  }
}

export async function getHotel(req, res) {
  try {
    const { id } = req.params;
    const hotel = await hotelService.getHotelById(req.app.locals.db, id);
    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Hotel not found' });
    }
    if (hotel.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    res.json({ success: true, hotel });
  } catch (e) {
    console.error('Get hotel error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch hotel' });
  }
}

export async function updateHotel(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const hotel = await hotelService.getHotelById(req.app.locals.db, id);
    if (!hotel) {
      return res.status(404).json({ success: false, message: 'Hotel not found' });
    }
    if (hotel.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const updated = await hotelService.updateHotel(req.app.locals.db, id, updates);
    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_hotel',
      entityType: 'collaborator_hotels',
      entityId: id,
      details: { updates }
    });
    res.json({ success: true, message: 'Hotel updated', hotel: updated });
  } catch (e) {
    console.error('Update hotel error:', e);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
}

export async function deleteHotel(req, res) {
  try {
    const { id } = req.params;
    const hotel = await hotelService.getHotelById(req.app.locals.db, id);
    if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
    if (hotel.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await hotelService.deleteHotel(req.app.locals.db, id);
    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'delete_hotel',
      entityType: 'collaborator_hotels',
      entityId: id,
      details: { hotelName: hotel.hotelName }
    });
    res.json({ success: true, message: 'Hotel deleted' });
  } catch (e) {
    console.error('Delete hotel error:', e);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
}

export async function createRoom(req, res) {
  try {
    const data = req.body;
    const hotel = await hotelService.getHotelById(req.app.locals.db, data.hotelId);
    if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
    if (hotel.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const room = await hotelService.createRoom(req.app.locals.db, data);
    try {
      await auditLogService.logAction(req.app.locals.db, {
        actorId: req.collaborator.collaboratorId,
        actorRole: 'collaborator',
        action: 'create_room',
        entityType: 'hotel_rooms',
        entityId: room.id,
        details: { hotelId: data.hotelId, roomType: room.roomType }
      });
    } catch (auditError) {
      console.error('Create room audit log error:', auditError);
    }
    res.status(201).json({ success: true, message: 'Room created', room });
  } catch (e) {
    console.error('Create room error:', e);
    res.status(500).json({ success: false, message: 'Failed to create room' });
  }
}

export async function getRooms(req, res) {
  try {
    const { hotelId } = req.params;
    const hotel = await hotelService.getHotelById(req.app.locals.db, hotelId);
    if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
    if (hotel.collaboratorId !== req.collaborator.collaboratorId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const rooms = await hotelService.getRoomsByHotel(req.app.locals.db, hotelId);
    res.json({ success: true, rooms });
  } catch (e) {
    console.error('Get rooms error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch rooms' });
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
    const updated = await hotelService.updateRoomStatus(req.app.locals.db, roomId, status);
    await auditLogService.logAction(req.app.locals.db, {
      actorId: req.collaborator.collaboratorId,
      actorRole: 'collaborator',
      action: 'update_room_status',
      entityType: 'hotel_rooms',
      entityId: roomId,
      details: { roomId, status }
    });
    res.json({ success: true, message: 'Room status updated', room: updated });
  } catch (e) {
    console.error('Update room status error:', e);
    res.status(500).json({ success: false, message: 'Failed to update room status' });
  }
}
