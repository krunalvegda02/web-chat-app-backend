import Tenant from "../models/tenant.model.js";
import User from "../models/user.model.js";
import crypto from "crypto";
import MESSAGE from "../constants/message.js";
import { successResponse, errorResponse } from "../utils/response.js";

/* ============================================
   CREATE TENANT WITH ADMIN (SUPER ADMIN)
============================================ */
const createTenant = async (req, res, next) => {
  try {
    const { name, email, password = 'Admin@123' } = req.body;

    if (!name || !email) {
      return errorResponse(res, MESSAGE.REQUIRED_FIELDS, 400);
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, MESSAGE.EMAIL_ALREADY_REGISTERED, 400);
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    
    // Check if tenant slug already exists
    const existingTenant = await Tenant.findOne({ slug });
    if (existingTenant) {
      return errorResponse(res, 'Workspace name already exists', 400);
    }

    // Create admin user
    const adminUser = new User({
      name: `${name} Admin`,
      email,
      password,
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    await adminUser.save();

    // Create tenant
    const tenant = new Tenant({
      name,
      slug,
      adminId: adminUser._id,
      description: `${name} workspace`,
    });

    await tenant.save();

    // Update admin user with tenantId
    adminUser.tenantId = tenant._id;
    await adminUser.save();

    // Populate admin data for response
    await tenant.populate('adminId', 'name email');

    return successResponse(res, { tenant }, MESSAGE.TENANT_CREATED, 201);
  } catch (error) {
    next(error);
  }
};

/* ============================================
   GET ALL TENANTS (SUPER ADMIN)
============================================ */
const getAllTenants = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const tenants = await Tenant.find()
      .populate("adminId", "name email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Get user count for each tenant
    const tenantsWithUserCount = await Promise.all(
      tenants.map(async (tenant) => {
        const userCount = await User.countDocuments({ tenantId: tenant._id });
        return {
          ...tenant.toObject(),
          admin: tenant.adminId,
          userCount,
        };
      })
    );

    const total = await Tenant.countDocuments();

    return successResponse(res, tenantsWithUserCount, MESSAGE.SUCCESS);
  } catch (error) {
    next(error);
  }
};

/* ============================================
   GET TENANT BY SLUG
============================================ */
const getTenantBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const tenant = await Tenant.findOne({ slug })
      .populate("adminId", "name email")
      .populate("members", "name email avatar role");

    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    return successResponse(res, { tenant });
  } catch (error) {
    next(error);
  }
};

/* ============================================
   GET TENANT DETAILS (ADMIN OR SUPER ADMIN)
============================================ */
const getTenantDetails = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenant.findById(tenantId)
      .populate("adminId", "name email")
      .populate("members", "name email avatar role");

    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    if (
      req.user.role !== "SUPER_ADMIN" &&
      req.user._id.toString() !== tenant.adminId._id.toString()
    ) {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    return successResponse(res, { tenant });
  } catch (error) {
    next(error);
  }
};

/* ============================================
   UPDATE TENANT THEME (ADMIN ONLY)
============================================ */
const updateTheme = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const theme = req.body.theme || req.body;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    if (req.user._id.toString() !== tenant.adminId.toString()) {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    tenant.theme = { ...tenant.theme, ...theme };
    tenant.updatedAt = new Date();
    await tenant.save();

    return successResponse(res, { theme: tenant.theme }, MESSAGE.THEME_UPDATED);
  } catch (error) {
    next(error);
  }
};

/* ============================================
   GENERATE INVITE LINK
============================================ */
const generateInviteLink = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    if (req.user._id.toString() !== tenant.adminId.toString()) {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    tenant.inviteToken = { token, expiresAt };
    await tenant.save();

    const inviteUrl = `${process.env.FRONTEND_URL}/join/${tenant.slug}?token=${token}`;

    return successResponse(res, { inviteUrl, expiresAt });
  } catch (error) {
    next(error);
  }
};

/* ============================================
   GET TENANT USERS (ADMIN OR SUPER ADMIN)
============================================ */
const getTenantUsers = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    if (
      req.user.role !== "SUPER_ADMIN" &&
      req.user._id.toString() !== tenant.adminId.toString()
    ) {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    const users = await User.find({ tenantId })
      .select("-password")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments({ tenantId });

    return successResponse(res, {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/* ============================================
   DELETE TENANT (SUPER ADMIN ONLY)
============================================ */
const deleteTenant = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    await Tenant.findByIdAndDelete(tenantId);

    return successResponse(res, null, MESSAGE.TENANT_DELETED);
  } catch (error) {
    next(error);
  }
};



export default {
  createTenant,
  getAllTenants,
  getTenantBySlug,
  getTenantDetails,
  updateTheme,
  generateInviteLink,
  getTenantUsers,
  deleteTenant,
};
