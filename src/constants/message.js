const MESSAGE = {
    // Admin
    ADMIN_REGISTER_FAILED: "Admin Registration Failed",
    
    // Auth Messages
    REQUIRED_FIELDS: "Name, email, and password are required",
    PASSWORDS_NOT_MATCH: "Passwords do not match",
    EMAIL_ALREADY_REGISTERED: "Email already registered",
    REGISTRATION_SUCCESSFUL: "Registration successful",
    EMAIL_PASSWORD_REQUIRED: "Email and password are required",
    INVALID_CREDENTIALS: "Invalid email or password",
    ACCOUNT_BANNED: "User account is banned",
    LOGIN_SUCCESSFUL: "Login successful",
    REFRESH_TOKEN_REQUIRED: "Refresh token is required",
    AUTH_HEADER_REQUIRED: "Authorization header required",
    INVALID_TOKEN: "Invalid token",
    INVALID_REFRESH_TOKEN: "Invalid or expired refresh token",
    USER_NOT_FOUND: "User not found",
    LOGOUT_SUCCESSFUL: "Logout successful",
    LOGOUT_ALL_SUCCESSFUL: "Logged out from all devices",
    USER_AGENT_REQUIRED: "User agent required",
    SESSION_REVOKED: "Session revoked",
    EMAIL_REQUIRED: "Email is required",
    PASSWORD_RESET_EMAIL_SENT: "If account exists, password reset email will be sent",
    TOKEN_PASSWORD_REQUIRED: "Token and password are required",
    PASSWORD_RESET_SUCCESSFUL: "Password reset successful",
    
    // User Messages
    PROFILE_UPDATED: "Profile updated successfully",
    NOTIFICATION_MARKED_READ: "Notification marked as read",
    
    // Tenant Messages
    TENANT_CREATED: "Tenant created successfully",
    TENANT_UPDATED: "Tenant updated successfully",
    TENANT_DELETED: "Tenant deleted successfully",
    THEME_UPDATED: "Theme updated successfully",
    INVITE_LINK_GENERATED: "Invite link generated successfully",
    TENANT_NOT_FOUND: "Tenant not found",
    
    // Chat Messages
    ROOM_CREATED: "Room created successfully",
    MESSAGE_SENT: "Message sent successfully",
    MESSAGES_RETRIEVED: "Messages retrieved successfully",
    ROOM_NOT_FOUND: "Room not found",
    MARKED_AS_READ: "Messages marked as read",
    
    // General
    SUCCESS: "Success",
    INTERNAL_ERROR: "Internal server error",
    UNAUTHORIZED: "Unauthorized access",
    FORBIDDEN: "Forbidden access",
    NOT_FOUND: "Resource not found",
    VALIDATION_ERROR: "Validation error"
};

export default MESSAGE;