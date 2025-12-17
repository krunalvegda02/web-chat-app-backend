const ROUTE = {
    AUTH_ROUTER: "/api/v1/auth",
    USER_ROUTER: "/api/v1/users",
    TENANT_ROUTER: "/api/v1/tenants",
    CHAT_ROUTER: "/api/v1/chat",
};

const API = {
    AUTH: {
        REGISTER: "/register",
        LOGIN: "/login",
        LOGOUT: "/logout",
        LOGOUT_ALL: "/logout-all",
        REFRESH_TOKEN: "/refresh-token",
        FORGOT_PASSWORD: "/forgot-password",
        RESET_PASSWORD: "/reset-password",
        ME: "/me",
        SESSIONS: "/sessions",
        REVOKE_SESSION: "/revoke-session",
    },
    SUPER_ADMIN: {
        CREATE_ADMIN: "/create-admin",
    },
    USER: {
        PROFILE: "/profile",
        NOTIFICATIONS: "/notifications",
        NOTIFICATION_BY_ID: "/notifications/:notificationId",
    },
    TENANT: {
        CREATE: "/",
        GET_ALL: "/",
        DELETE: "/:tenantId",
        BY_SLUG: "/by-slug/:slug",
        DETAILS: "/:tenantId",
        UPDATE_THEME: "/:tenantId/theme",
        INVITE_LINK: "/:tenantId/invite-link",
        USERS: "/:tenantId/users",
    },
    CHAT: {
        ROOMS: "/rooms",
        CREATE_ROOM: "/rooms",
        ROOM_DETAILS: "/rooms/:roomId",
        ROOM_MESSAGES: "/rooms/:roomId/messages",
        MARK_AS_READ: "/rooms/:roomId/mark-as-read",
        SEARCH_MESSAGES: "/rooms/:roomId/search",
        ALL_CHATS: "/all-chats",
        ADMIN_ROOMS: "/admin-rooms",
        CREATE_ADMIN_ROOM: "/admin-rooms",
        ADMIN_CHATS: "/admin/:adminId/chats",
        ADMIN_CHAT_ROOMS: "/admin-chat-rooms",
        CREATE_OR_GET_ADMIN_ROOM: "/admin-rooms"
    },
};


export { API, ROUTE };