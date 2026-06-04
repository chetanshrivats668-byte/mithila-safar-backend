import { Router } from 'express';
import { requireCollaborator } from '../middleware/auth.js';
import * as cabController from '../controllers/cabController.js';

const router = Router();

router.post('/create-cab', requireCollaborator, cabController.createCab);
router.get('/cabs', requireCollaborator, cabController.getCabs);
router.get('/cab/:id', requireCollaborator, cabController.getCab);
router.put('/cab/:id', requireCollaborator, cabController.updateCab);
router.delete('/cab/:id', requireCollaborator, cabController.deleteCab);

export default router;
