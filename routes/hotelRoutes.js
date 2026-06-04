import { Router } from 'express';
import { requireCollaborator, requireModuleAccess } from '../middleware/auth.js';
import * as hotelController from '../controllers/hotelController.js';

const router = Router();

router.post('/create-hotel', requireCollaborator, requireModuleAccess('hotel'), hotelController.createHotel);
router.get('/hotels', requireCollaborator, requireModuleAccess('hotel'), hotelController.getHotels);
router.get('/hotel/:id', requireCollaborator, requireModuleAccess('hotel'), hotelController.getHotel);
router.put('/hotel/:id', requireCollaborator, requireModuleAccess('hotel'), hotelController.updateHotel);
router.delete('/hotel/:id', requireCollaborator, requireModuleAccess('hotel'), hotelController.deleteHotel);
router.post('/create-room', requireCollaborator, requireModuleAccess('hotel'), hotelController.createRoom);
router.get('/rooms/:hotelId', requireCollaborator, requireModuleAccess('hotel'), hotelController.getRooms);
router.put('/room-status/:roomId', requireCollaborator, requireModuleAccess('hotel'), hotelController.updateRoomStatus);

export default router;
