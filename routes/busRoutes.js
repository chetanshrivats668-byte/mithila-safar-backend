import { Router } from 'express';
import { requireCollaborator, requireModuleAccess } from '../middleware/auth.js';
import * as busController from '../controllers/busController.js';

const router = Router();

router.post('/', requireCollaborator, requireModuleAccess('bus'), busController.createBus);
router.get('/', requireCollaborator, requireModuleAccess('bus'), busController.getBuses);
router.put('/:id', requireCollaborator, requireModuleAccess('bus'), busController.updateBus);
router.delete('/:id', requireCollaborator, requireModuleAccess('bus'), busController.deleteBus);
router.get('/:busId/seats', requireCollaborator, requireModuleAccess('bus'), busController.getSeatMap);
router.put('/:busId/seats', requireCollaborator, requireModuleAccess('bus'), busController.updateSeat);
router.post('/:busId/seats/bulk', requireCollaborator, requireModuleAccess('bus'), busController.bulkUpdateSeats);
router.post('/:busId/schedule', requireCollaborator, requireModuleAccess('bus'), busController.addSchedule);
router.put('/:busId/pricing', requireCollaborator, requireModuleAccess('bus'), busController.updatePricing);

export default router;
