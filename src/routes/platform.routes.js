import express from 'express';
import {
  createPlatform,
  getAllPlatforms,
  getPlatformById,
  updatePlatform,
  togglePlatformStatus,
  deletePlatform,
  getPlatformUsers,
  getUserById,
  updateUserStatus,
  fixPlatformAdmins,
  createPlatformUser,
} from '../controller/platform.controller.js';
import {verifyJWT as authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';

const router = express.Router();

// Migration endpoint (one-time fix)
router.post('/fix/admins', authenticate, requireRole(['SUPER_ADMIN']), fixPlatformAdmins);

// Platform management (Super Admin only)
router.post('/', authenticate, requireRole(['SUPER_ADMIN']), createPlatform);
router.get('/', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getAllPlatforms);
router.get('/:platformId', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getPlatformById);
router.put('/:platformId', authenticate, requireRole(['SUPER_ADMIN']), updatePlatform);
router.patch('/:platformId/toggle-status', authenticate, requireRole(['SUPER_ADMIN']), togglePlatformStatus);
router.delete('/:platformId', authenticate, requireRole(['SUPER_ADMIN']), deletePlatform);

// User management (Platform Admin can manage their own users)
router.get('/:platformId/users', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getPlatformUsers);
router.get('/users/:userId', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), getUserById);
router.patch('/users/:userId/status', authenticate, requireRole(['SUPER_ADMIN', 'PLATFORM_ADMIN']), updateUserStatus);

// Create platform user (for WhatsApp test)
router.post('/create-user', createPlatformUser);

export default router;
