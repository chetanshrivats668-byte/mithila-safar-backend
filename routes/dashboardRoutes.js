import { Router } from 'express';
import { requireCollaborator } from '../middleware/auth.js';
import * as dashboardController from '../controllers/dashboardController.js';

const router = Router();

router.get('/overview', requireCollaborator, dashboardController.getDashboardOverview);
router.get('/bookings', requireCollaborator, dashboardController.getBookings);
router.get('/earnings', requireCollaborator, dashboardController.getEarnings);

export default router;
