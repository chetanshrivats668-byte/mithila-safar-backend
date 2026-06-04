import { Router } from 'express';
import { requireCollaborator, requireModuleAccess } from '../middleware/auth.js';
import * as cafeTableController from '../controllers/cafeTableController.js';

const router = Router();

router.post('/generate-table-layout', requireCollaborator, requireModuleAccess('cafe'), cafeTableController.generateTableLayout);
router.get('/tables/:cafeId', requireCollaborator, requireModuleAccess('cafe'), cafeTableController.getTables);
router.put('/table/:tableId', requireCollaborator, requireModuleAccess('cafe'), cafeTableController.updateTable);
router.put('/table/:tableId/status', requireCollaborator, requireModuleAccess('cafe'), cafeTableController.updateTableStatus);
router.delete('/table/:tableId', requireCollaborator, requireModuleAccess('cafe'), cafeTableController.deleteTable);
router.post('/sync-table-count', requireCollaborator, requireModuleAccess('cafe'), cafeTableController.syncTableCount);
router.get('/table-stats/:cafeId', requireCollaborator, requireModuleAccess('cafe'), cafeTableController.getTableStats);

export default router;
