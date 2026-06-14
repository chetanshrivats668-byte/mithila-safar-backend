import { Router } from 'express';
import { requireCollaborator, requireModuleAccess } from '../middleware/auth.js';
import * as cabController from '../controllers/cabController.js';

const router = Router();

router.post('/', requireCollaborator, requireModuleAccess('cab'), cabController.createCab);
router.post('/create-cab', requireCollaborator, requireModuleAccess('cab'), cabController.createCab);

router.get('/', requireCollaborator, requireModuleAccess('cab'), cabController.getCabs);
router.get('/cabs', requireCollaborator, requireModuleAccess('cab'), cabController.getCabs);

router.get('/:id', requireCollaborator, requireModuleAccess('cab'), cabController.getCab);
router.get('/cab/:id', requireCollaborator, requireModuleAccess('cab'), cabController.getCab);

router.put('/:id', requireCollaborator, requireModuleAccess('cab'), cabController.updateCab);
router.put('/cab/:id', requireCollaborator, requireModuleAccess('cab'), cabController.updateCab);

router.delete('/:id', requireCollaborator, requireModuleAccess('cab'), cabController.deleteCab);
router.delete('/cab/:id', requireCollaborator, requireModuleAccess('cab'), cabController.deleteCab);

export default router;
