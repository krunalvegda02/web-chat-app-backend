/**
 * Role-based access control middleware
 */
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
      });
    }

    next();
  };
};

/**
 * Check if user is super admin
 */
export const isSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super admin only.',
    });
  }

  next();
};

/**
 * Check if user is platform admin
 */
export const isPlatformAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  if (req.user.role !== 'PLATFORM_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Platform admin only.',
    });
  }

  next();
};

/**
 * Check if user owns the platform
 */
export const isPlatformOwner = (platformIdParam = 'platformId') => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Super admin can access any platform
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    // Platform admin can only access their own platform
    if (req.user.role === 'PLATFORM_ADMIN') {
      const platformId = req.params[platformIdParam];
      
      if (!platformId) {
        return res.status(400).json({
          success: false,
          message: 'Platform ID required',
        });
      }

      if (req.user.platformId?.toString() !== platformId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own platform.',
        });
      }

      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied.',
    });
  };
};

export default {
  requireRole,
  isSuperAdmin,
  isPlatformAdmin,
  isPlatformOwner,
};
