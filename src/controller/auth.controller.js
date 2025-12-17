import { User } from '../models/index.model.js';
import jwt from 'jsonwebtoken';

import {
    generateAccessToken,
    generateRefreshToken,
    saveRefreshToken,
    verifyRefreshToken,
    revokeRefreshToken,
    revokeAllRefreshTokens,
    getUserSessions
} from '../utils/tokenUtils.js';

import { successResponse, errorResponse } from '../utils/response.js';
import { validateEmail, validatePassword } from '../utils/validators.js';
import MESSAGE from '../constants/message.js';


// ===============================
// AUTH CONTROLLER (ARROW FUNCTIONS)
// ===============================
const register = async (req, res, next) => {
    try {
        const { name, email, password, confirmPassword } = req.body;

        if (!name || !email || !password) {
            return errorResponse(res, MESSAGE.REQUIRED_FIELDS, 400);
        }

        validateEmail(email);
        validatePassword(password);

        if (password !== confirmPassword) {
            return errorResponse(res, MESSAGE.PASSWORDS_NOT_MATCH, 400);
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return errorResponse(res, MESSAGE.EMAIL_ALREADY_REGISTERED, 400);
        }

        const user = new User({ name, email, password, role: 'USER' });
        await user.save();

        const accessToken = generateAccessToken(user._id, user.email, user.role, user.tenantId);
        const refreshToken = await saveRefreshToken(
            user._id,
            req.ip,
            req.headers["user-agent"]
        );

        return successResponse(res, {
            user: user.toJSON(),
            accessToken,
            refreshToken
        }, MESSAGE.REGISTRATION_SUCCESSFUL, 201);

    } catch (error) {
        next(error);
    }
};



const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return errorResponse(res, MESSAGE.EMAIL_PASSWORD_REQUIRED, 400);
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await user.comparePassword(password))) {
            return errorResponse(res, MESSAGE.INVALID_CREDENTIALS, 401);
        }

        if (user.status === 'BANNED') {
            return errorResponse(res, MESSAGE.ACCOUNT_BANNED, 403);
        }

        user.lastLogin = new Date();
        await user.save();

        const accessToken = generateAccessToken(user._id, user.email, user.role, user.tenantId);
        const refreshToken = await saveRefreshToken(
            user._id,
            req.ip,
            req.headers['user-agent']
        );

        return successResponse(res, {
            user: user.toJSON(),
            accessToken,
            refreshToken,
        });

    } catch (error) {
        next(error);
    }
};


const refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return errorResponse(res, MESSAGE.REFRESH_TOKEN_REQUIRED, 400);
        }

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            return errorResponse(res, MESSAGE.AUTH_HEADER_REQUIRED, 401);
        }

        const accessToken = authHeader.replace("Bearer ", "");
        const decoded = jwt.decode(accessToken);

        if (!decoded?.userId) {
            return errorResponse(res, MESSAGE.INVALID_TOKEN, 401);
        }

        const isValid = await verifyRefreshToken(refreshToken, decoded.userId);
        if (!isValid) {
            return errorResponse(res, MESSAGE.INVALID_REFRESH_TOKEN, 401);
        }

        const user = await User.findById(decoded.userId);
        if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);

        const newAccessToken = generateAccessToken(
            user._id, user.email, user.role, user.tenantId
        );

        return successResponse(res, { accessToken: newAccessToken });

    } catch (error) {
        next(error);
    }
};


const logout = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return errorResponse(res, MESSAGE.REFRESH_TOKEN_REQUIRED, 400);
        }

        await revokeRefreshToken(refreshToken, req.userId);
        return successResponse(res, null, MESSAGE.LOGOUT_SUCCESSFUL);

    } catch (error) {
        next(error);
    }
};


const logoutAll = async (req, res, next) => {
    try {
        await revokeAllRefreshTokens(req.userId);
        return successResponse(res, null, MESSAGE.LOGOUT_ALL_SUCCESSFUL);
    } catch (error) {
        next(error);
    }
};


const me = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId).populate('tenantId');
        if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);

        return successResponse(res, { user });
    } catch (error) {
        next(error);
    }
};


const getSessions = async (req, res, next) => {
    try {
        const sessions = await getUserSessions(req.userId);
        return successResponse(res, { sessions });
    } catch (error) {
        next(error);
    }
};



const revokeSession = async (req, res, next) => {
    try {
        const { userAgent } = req.body;

        if (!userAgent) {
            return errorResponse(res, MESSAGE.USER_AGENT_REQUIRED, 400);
        }

        const user = await User.findById(req.userId);
        if (!user) return errorResponse(res, MESSAGE.USER_NOT_FOUND, 404);

        user.revokeSessionByAgent(userAgent);
        await user.save();

        return successResponse(res, null, MESSAGE.SESSION_REVOKED);
    } catch (error) {
        next(error);
    }
};


const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) return errorResponse(res, MESSAGE.EMAIL_REQUIRED, 400);

        // TODO: Send reset email
        return successResponse(res, null, MESSAGE.PASSWORD_RESET_EMAIL_SENT);

    } catch (error) {
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return errorResponse(res, MESSAGE.TOKEN_PASSWORD_REQUIRED, 400);
        }

        validatePassword(password);

        // TODO: Implement reset logic
        return successResponse(res, null, MESSAGE.PASSWORD_RESET_SUCCESSFUL);

    } catch (error) {
        next(error);
    }
};

export default {
    login,
    register,
    refreshToken,
    logout,
    logoutAll,
    me,
    getSessions,
    revokeSession,
    forgotPassword,
    resetPassword
}