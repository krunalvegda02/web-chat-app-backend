import express from 'express';
import tenantController from '../controller/tenant.controller.js';
import { verifyJWT, requireRole } from '../middlewares/auth.middleware.js';
import { API } from '../constants/endpoints.js';

const router = express.Router();

// Super admin routes
router.post(API.TENANT.CREATE, verifyJWT, requireRole('SUPER_ADMIN'), tenantController.createTenant);
router.get(API.TENANT.GET_ALL, verifyJWT, requireRole('SUPER_ADMIN'), tenantController.getAllTenants);
router.delete(API.TENANT.DELETE, verifyJWT, requireRole('SUPER_ADMIN'), tenantController.deleteTenant);

// Admin/User routes
router.get(API.TENANT.BY_SLUG, verifyJWT, tenantController.getTenantBySlug);
router.get(API.TENANT.DETAILS, verifyJWT, tenantController.getTenantDetails);
router.put(API.TENANT.UPDATE_THEME, verifyJWT, tenantController.updateTheme);
router.post(API.TENANT.INVITE_LINK, verifyJWT, tenantController.generateInviteLink);
router.get(API.TENANT.USERS, verifyJWT, tenantController.getTenantUsers);

export default router;