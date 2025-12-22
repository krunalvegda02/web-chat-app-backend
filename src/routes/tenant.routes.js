import express from 'express';
import tenantController from '../controller/tenant.controller.js';
import { verifyJWT, requireRole } from '../middlewares/auth.middleware.js';
import { API } from '../constants/endpoints.js';
import Tenant from '../models/tenant.model.js';

const router = express.Router();

// Super admin routes
router.post(
    API.TENANT.CREATE,
    verifyJWT,
    requireRole('SUPER_ADMIN'),
    tenantController.createTenant
);

router.get(
    API.TENANT.GET_ALL,
    verifyJWT,
    requireRole('SUPER_ADMIN'),
    tenantController.getAllTenants
);

router.put(
    API.TENANT.UPDATE,
    verifyJWT,
    requireRole('SUPER_ADMIN'),
    tenantController.updateTenant
);

router.patch(
    API.TENANT.TOGGLE_STATUS,
    verifyJWT,
    requireRole('SUPER_ADMIN'),
    tenantController.toggleTenantStatus
);

router.delete(
    API.TENANT.DELETE,
    verifyJWT,
    requireRole('SUPER_ADMIN'),
    tenantController.deleteTenant
);

// Admin/User routes - SPECIFIC ROUTES FIRST
router.get(API.TENANT.BY_SLUG, verifyJWT, tenantController.getTenantBySlug);

// Admin: Get admin's users (MUST be before /:tenantId routes)
router.get(API.TENANT.ADMIN_USERS, verifyJWT, requireRole('ADMIN'), tenantController.getAdminUsers);

// User: Get tenant members for chat
router.get(API.TENANT.TENANT_MEMBERS, verifyJWT, requireRole('ADMIN','SUPER_ADMIN','USER') ,tenantController.getTenantMembers);

router.get(API.TENANT.DETAILS, verifyJWT, tenantController.getTenantDetails);

// Get theme endpoint (accessible to all users)
router.get(API.TENANT.GET_THEME, verifyJWT, tenantController.getTenantTheme);

// Update theme endpoint (admin only)
router.put(API.TENANT.UPDATE_THEME, verifyJWT, requireRole('ADMIN'), tenantController.updateTheme);

router.post(API.TENANT.INVITE_LINK, verifyJWT, tenantController.generateInviteLink);

router.get(API.TENANT.USERS, verifyJWT, tenantController.getTenantUsers);





// Admin: Generate invite
router.post(API.TENANT.INVITE_LINK, verifyJWT, requireRole('ADMIN'), tenantController.generateInviteLink);

// Admin: Resend invite
router.post(API.TENANT.RESEND_INVITE, verifyJWT, requireRole('ADMIN'), tenantController.resendInvite);

// Admin: Get invite history
router.get(API.TENANT.INVITE_HISTORY,
    verifyJWT,
    requireRole('ADMIN'),
    async (req, res, next) => {
        try {
            const { tenantId } = req.params;
            const tenant = await Tenant.findById(tenantId).select('inviteHistory');

            if (!tenant) return errorResponse(res, 'Tenant not found', 404);

            return successResponse(res, {
                invites: tenant.inviteHistory || []
            });
        } catch (error) {
            next(error);
        }
    }
);


export default router;