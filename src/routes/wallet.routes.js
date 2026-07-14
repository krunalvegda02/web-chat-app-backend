import express from 'express';
import {
  requestCredit,
  getWalletBalance,
  getWalletHistory,
  getPendingRequests,
  approveCredit,
  rejectCredit,
  addCreditsManually,
} from '../controller/wallet.controller.js';
import { verifyJWT as authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = express.Router();

// ============================================
// WALLET ROUTES
// ============================================

// Platform Admin – balance & history
router.get('/balance', authenticate, requireRole(['PLATFORM_ADMIN', 'SUPER_ADMIN']), getWalletBalance);
router.get('/history', authenticate, requireRole(['PLATFORM_ADMIN', 'SUPER_ADMIN']), getWalletHistory);

// Platform Admin – request credits
router.post('/request', authenticate, requireRole(['PLATFORM_ADMIN']), requestCredit);

// Super Admin – manage requests
router.get('/pending', authenticate, requireRole(['SUPER_ADMIN']), getPendingRequests);
router.patch('/:transactionId/approve', authenticate, requireRole(['SUPER_ADMIN']), approveCredit);
router.patch('/:transactionId/reject', authenticate, requireRole(['SUPER_ADMIN']), rejectCredit);

// Super Admin – add credits directly
router.post('/add-credits', authenticate, requireRole(['SUPER_ADMIN']), addCreditsManually);

export default router;
