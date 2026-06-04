import { Router } from 'express';
import { requireCollaborator, requireModuleAccess } from '../middleware/auth.js';
import * as hotelRoomController from '../controllers/hotelRoomController.js';

const router = Router();

router.post('/generate-room-layout', requireCollaborator, requireModuleAccess('hotel'), hotelRoomController.generateRoomLayout);
router.get('/rooms/:hotelId', requireCollaborator, requireModuleAccess('hotel'), hotelRoomController.getRooms);
router.put('/room/:roomId', requireCollaborator, requireModuleAccess('hotel'), hotelRoomController.updateRoom);
router.put('/room/:roomId/status', requireCollaborator, requireModuleAccess('hotel'), hotelRoomController.updateRoomStatus);
router.delete('/room/:roomId', requireCollaborator, requireModuleAccess('hotel'), hotelRoomController.deleteRoom);
router.post('/sync-room-count', requireCollaborator, requireModuleAccess('hotel'), hotelRoomController.syncRoomCount);
router.get('/room-stats/:hotelId', requireCollaborator, requireModuleAccess('hotel'), hotelRoomController.getRoomStats);

export default router;
