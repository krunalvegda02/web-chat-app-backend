import Tenant from '../models/tenant.model.js';
import User from '../models/user.model.js';
import crypto from 'crypto';
import MESSAGE from '../constants/message.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { sendInviteEmail } from '../utils/mailer.js';

/* ============================================
CREATE TENANT WITH ADMIN (SUPER ADMIN)
============================================ */
const createTenant = async (req, res, next) => {
  try {
    const { name, email, password = 'Admin@123', phone } = req.body;

    if (!name || !email) {
      return errorResponse(res, MESSAGE.REQUIRED_FIELDS, 400);
    }

    // Check if admin email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, MESSAGE.EMAIL_ALREADY_REGISTERED, 400);
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');

    // Check if tenant slug already exists
    const existingTenant = await Tenant.findOne({ slug });
    if (existingTenant) {
      return errorResponse(res, 'Workspace name already exists', 400);
    }

    // Create admin user
    const adminUser = new User({
      name: `${name}`,
      email,
      password,
      phone: phone || undefined,
      role: 'ADMIN',
      status: 'ACTIVE',
    });

    await adminUser.save();

    // Create tenant with default WhatsApp theme
    const tenant = new Tenant({
      name,
      slug,
      adminId: adminUser._id,
      description: `${name} workspace`,
      theme: {
        appName: name,
        logoUrl: null,
        logoHeight: 40,
        primaryColor: '#008069',
        secondaryColor: '#F0F2F5',
        accentColor: '#25D366',
        backgroundColor: '#FFFFFF',
        borderColor: '#E9EDEF',
        headerBackground: '#008069',
        headerText: '#FFFFFF',
        chatBackgroundImage: null,
        chatBubbleAdmin: '#DCF8C6',
        chatBubbleUser: '#FFFFFF',
        chatBubbleAdminText: '#111B21',
        chatBubbleUserText: '#111B21',
        messageFontSize: 14,
        messageBorderRadius: 8,
        bubbleStyle: 'rounded',
        blurEffect: 0.1,
        showAvatars: true,
        showReadStatus: true,
        enableTypingIndicator: true,
      },
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
      .populate('adminId', 'name email phone')
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

    return successResponse(res, {
      tenants: tenantsWithUserCount,
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
GET TENANT BY SLUG
============================================ */
const getTenantBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const tenant = await Tenant.findOne({ slug })
      .populate('adminId', 'name email')
      .populate('members', 'name email avatar role');

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
      .populate('adminId', 'name email')
      .populate('members', 'name email avatar role');

    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    // Check authorization
    if (
      req.user.role !== 'SUPER_ADMIN' &&
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
GET TENANT THEME
============================================ */
const getTenantTheme = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenant.findById(tenantId).select('theme');

    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    return successResponse(res, { theme: tenant.theme || {} });
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

    // Extract theme from body, excluding tenantId
    const { tenantId: _, ...themeUpdates } = req.body;

    const tenant = await Tenant.findById(tenantId);

    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    // Check if user is admin of this tenant
    if (req.user._id.toString() !== tenant.adminId.toString()) {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    // Merge theme updates with existing theme
    tenant.theme = {
      ...(tenant.theme || {}),
      ...themeUpdates,
    };

    tenant.updatedAt = new Date();
    await tenant.save();

    return successResponse(
      res,
      { theme: tenant.theme },
      MESSAGE.THEME_UPDATED || 'Theme updated successfully'
    );
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

    // Check authorization
    if (
      req.user.role !== 'SUPER_ADMIN' &&
      req.user._id.toString() !== tenant.adminId.toString()
    ) {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    const users = await User.find({ tenantId })
      .select('-password')
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
UPDATE TENANT (SUPER ADMIN ONLY)
============================================ */
const updateTenant = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { name, email, phone } = req.body;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    // Update tenant name if provided
    if (name && name !== tenant.name) {
      tenant.name = name;
      // Update slug
      tenant.slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-');
    }

    // Update admin user if email or phone changed
    if (email || phone) {
      const adminUser = await User.findById(tenant.adminId);
      if (adminUser) {
        if (email && email !== adminUser.email) {
          // Check if new email already exists
          const existingUser = await User.findOne({ email, _id: { $ne: adminUser._id } });
          if (existingUser) {
            return errorResponse(res, MESSAGE.EMAIL_ALREADY_REGISTERED, 400);
          }
          adminUser.email = email;
        }
        if (phone !== undefined) {
          adminUser.phone = phone || null;
        }
        await adminUser.save();
      }
    }

    await tenant.save();
    await tenant.populate('adminId', 'name email phone');

    const tenantResponse = {
      ...tenant.toObject(),
      admin: tenant.adminId,
    };

    return successResponse(res, { tenant: tenantResponse }, 'Tenant updated successfully');
  } catch (error) {
    next(error);
  }
};

/* ============================================
TOGGLE TENANT STATUS (SUPER ADMIN ONLY)
============================================ */
const toggleTenantStatus = async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    // Toggle status
    tenant.status = tenant.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await tenant.save();

    // Also update admin user status
    const adminUser = await User.findById(tenant.adminId);
    if (adminUser) {
      adminUser.status = tenant.status;
      await adminUser.save();
    }

    await tenant.populate('adminId', 'name email phone');

    const tenantResponse = {
      ...tenant.toObject(),
      admin: tenant.adminId,
    };

    return successResponse(
      res,
      { tenant: tenantResponse },
      `Tenant ${tenant.status === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`
    );
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

    // Check authorization
    if (req.user.role !== 'SUPER_ADMIN') {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    await Tenant.findByIdAndDelete(tenantId);

    return successResponse(res, null, MESSAGE.TENANT_DELETED || 'Tenant deleted successfully');
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
    const { email, phone } = req.body;

    // Validate required fields
    if (!email) {
      return errorResponse(res, 'Email is required', 400);
    }
    if (!phone) {
      return errorResponse(res, 'Phone number is required', 400);
    }

    // Validate phone format (10-15 digits)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return errorResponse(res, 'Phone number must be 10-15 digits', 400);
    }

    // 1. Validate tenant exists & admin owns it
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return errorResponse(res, 'Tenant not found', 404);

    if (req.user._id.toString() !== tenant.adminId.toString()) {
      return errorResponse(res, 'Only admin can invite', 403);
    }

    // 2. Check email not already in tenant
    const existingUser = await User.findOne({
      email,
      tenantId
    });
    if (existingUser) {
      return errorResponse(res, 'User already in workspace', 400);
    }

    // 3. Check email not already registered globally
    const registeredUser = await User.findOne({ email });
    if (registeredUser) {
      return errorResponse(res, 'Email already registered', 400);
    }

    // 4. Check phone not already registered globally
    const registeredPhone = await User.findOne({ phone: phoneDigits });
    if (registeredPhone) {
      return errorResponse(res, 'Phone number already registered', 400);
    }

    // 5. Generate token (7 day expiry)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 6. Store in tenant
    tenant.inviteToken = {
      token,
      expiresAt,
      invitedEmail: email,
      invitedPhone: phone,
      createdBy: req.user._id,
      acceptedAt: null,
      acceptedBy: null
    };
    await tenant.save();
    
    console.log('✅ [INVITE] Invite token saved with phone:', phone);
    console.log('📞 [INVITE] Tenant invite token:', tenant.inviteToken);

    // 7. Build invite URL
    const inviteUrl = `${process.env.FRONTEND_URL}/join?token=${token}&tenantId=${tenantId}`;

    // 8. Send invite email
    sendInviteEmail(email, tenant.name, inviteUrl).catch(err =>
      console.error('Invite email failed:', err)
    );

    return successResponse(res, {
      inviteUrl,
      expiresAt,
      invitedEmail: email
    }, 'Invite sent successfully');

  } catch (error) {
    next(error);
  }
};


export const getInviteInfo = async (req, res, next) => {
  try {
    const { token, tenantId } = req.query;

    if (!token || !tenantId) {
      return errorResponse(res, 'Invalid invite link', 400);
    }

    // Check tenant exists
    const tenant = await Tenant.findById(tenantId).select('name inviteToken slug');
    if (!tenant) {
      return errorResponse(res, 'Workspace not found', 404);
    }

    const inviteToken = tenant.inviteToken;

    // Check token exists
    if (!inviteToken || !inviteToken.token) {
      return errorResponse(res, 'No active invite for this workspace', 400);
    }

    // Check token matches
    if (inviteToken.token !== token) {
      return errorResponse(res, 'Invalid invite token', 401);
    }

    // Check not already accepted
    if (inviteToken.acceptedAt) {
      return errorResponse(res, 'This invite was already accepted', 400);
    }

    // Check expiry
    if (new Date() > new Date(inviteToken.expiresAt)) {
      return errorResponse(res, 'Invite link has expired', 401);
    }

    // Return safe info for signup form
    return successResponse(res, {
      invitedEmail: inviteToken.invitedEmail,
      invitedPhone: inviteToken.invitedPhone,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      expiresAt: inviteToken.expiresAt
    }, 'Invite is valid');

  } catch (error) {
    next(error);
  }
};

/**
 * ADMIN: Resend invite (generate new token)
 * POST /api/tenant/{tenantId}/resend-invite
 */
export const resendInvite = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const { email } = req.body;

    // Check tenant exists
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    // Check admin auth
    if (req.user._id.toString() !== tenant.adminId.toString()) {
      return errorResponse(res, 'Only admin can resend invites', 403);
    }

    // Check previous invite for this email exists
    const inviteHistory = tenant.inviteHistory || [];
    const previousInvite = inviteHistory.find(i => i.email === email.toLowerCase());

    if (!previousInvite) {
      return errorResponse(res, 'No previous invite found for this email', 400);
    }

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Update tenant
    tenant.inviteToken = {
      token,
      expiresAt,
      invitedEmail: email.toLowerCase(),
      createdBy: req.user._id,
      acceptedAt: null,
      acceptedBy: null
    };

    // Mark previous as expired in history
    previousInvite.status = 'EXPIRED';

    // Add new entry
    tenant.inviteHistory.push({
      email: email.toLowerCase(),
      sentAt: new Date(),
      expiresAt,
      status: 'PENDING'
    });

    await tenant.save();

    const inviteUrl = `${process.env.FRONTEND_URL}/join?token=${token}&tenantId=${tenantId}`;

    // TODO: Send email

    return successResponse(res, {
      inviteUrl,
      expiresAt,
      message: `New invitation sent to ${email}`
    }, 'Invite resent');

  } catch (error) {
    next(error);
  }
};


/* ============================================
GET TENANT MEMBERS (USER - for chat)
============================================ */
const getTenantMembers = async (req, res, next) => {
  try {
    const userTenantId = req.user.tenantId;

    if (!userTenantId) {
      return errorResponse(res, 'User not associated with any tenant', 400);
    }

    const tenant = await Tenant.findById(userTenantId)
      .populate('adminId', 'name email avatar _id')
      .populate('members', 'name email avatar _id');

    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    // Combine admin and members, exclude current user
    const allMembers = [
      tenant.adminId,
      ...(tenant.members || [])
    ].filter(member => member._id.toString() !== req.user._id.toString());

    return successResponse(res, { members: allMembers });
  } catch (error) {
    next(error);
  }
};

/* ============================================
GET ADMIN USERS (ADMIN ONLY)
============================================ */
const getAdminUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Get admin's tenantId from authenticated user
    const adminTenantId = req.user.tenantId;

    if (!adminTenantId) {
      return errorResponse(res, 'Admin not associated with any tenant', 400);
    }

    // Verify admin owns this tenant
    const tenant = await Tenant.findById(adminTenantId);
    if (!tenant) {
      return errorResponse(res, MESSAGE.TENANT_NOT_FOUND, 404);
    }

    if (tenant.adminId.toString() !== req.user._id.toString()) {
      return errorResponse(res, MESSAGE.UNAUTHORIZED, 403);
    }

    // Fetch users created by this admin (users in admin's tenant)
    const users = await User.find({ 
      tenantId: adminTenantId,
      role: 'USER' // Only regular users, not admins
    })
      .select('-password -refreshTokens')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments({ 
      tenantId: adminTenantId,
      role: 'USER'
    });

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



export default {
  createTenant,
  getAllTenants,
  getTenantBySlug,
  getTenantDetails,
  getTenantTheme,
  updateTheme,
  generateInviteLink,
  getTenantUsers,
  updateTenant,
  toggleTenantStatus,
  deleteTenant,
  resendInvite,
  getInviteInfo,
  getAdminUsers,
  getTenantMembers
};