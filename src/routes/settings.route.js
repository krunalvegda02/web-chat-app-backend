import express from 'express';
import { getGlobalPricing, updateGlobalPricing } from '../controller/settings.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = express.Router();

router.get('/pricing', verifyJWT, requireRole(['SUPER_ADMIN']), getGlobalPricing);
router.put('/pricing', verifyJWT, requireRole(['SUPER_ADMIN']), updateGlobalPricing);

export default router;
