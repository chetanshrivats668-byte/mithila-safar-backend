import { Router } from 'express';
import { requireCollaborator, requireModuleAccess } from '../middleware/auth.js';
import * as cafeController from '../controllers/cafeController.js';

const router = Router();

router.post('/create-cafe', requireCollaborator, requireModuleAccess('cafe'), cafeController.createCafe);
router.get('/cafes', requireCollaborator, requireModuleAccess('cafe'), cafeController.getCafes);
router.get('/cafe/:id', requireCollaborator, requireModuleAccess('cafe'), cafeController.getCafe);
router.put('/cafe/:id', requireCollaborator, requireModuleAccess('cafe'), cafeController.updateCafe);
router.delete('/cafe/:id', requireCollaborator, requireModuleAccess('cafe'), cafeController.deleteCafe);
router.post('/create-table', requireCollaborator, requireModuleAccess('cafe'), cafeController.createTable);
router.get('/tables/:cafeId', requireCollaborator, requireModuleAccess('cafe'), cafeController.getTables);
router.put('/table-status/:tableId', requireCollaborator, requireModuleAccess('cafe'), cafeController.updateTableStatus);

export default router;
