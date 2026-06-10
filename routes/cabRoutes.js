import { Router } from 'express';
import { requireCollaborator } from '../middleware/auth.js';
import * as cabController from '../controllers/cabController.js';

const router = Router();

router.post('/', requireCollaborator, cabController.createCab);
router.post('/create-cab', requireCollaborator, cabController.createCab);

router.get('/', requireCollaborator, cabController.getCabs);
router.get('/cabs', requireCollaborator, cabController.getCabs);

router.get('/:id', requireCollaborator, cabController.getCab);
router.get('/cab/:id', requireCollaborator, cabController.getCab);

router.put('/:id', requireCollaborator, cabController.updateCab);
router.put('/cab/:id', requireCollaborator, cabController.updateCab);

router.delete('/:id', requireCollaborator, cabController.deleteCab);
router.delete('/cab/:id', requireCollaborator, cabController.deleteCab);

export default router;
