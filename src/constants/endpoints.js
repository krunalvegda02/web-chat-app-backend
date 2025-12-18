const ROUTE = {
    AUTH_ROUTER: "/api/v1/auth",
    USER_ROUTER: "/api/v1/users",
    TENANT_ROUTER: "/api/v1/tenants",
    CHAT_ROUTER: "/api/v1/chat",
    UPLOAD_ROUTER: "/api/v1/upload",
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
        REGISTER_WITH_INVITE: "/register-with-invite",

        INVITE_INFO: '/invite-info',
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
        GET_THEME: "/:tenantId/theme",
        UPDATE_THEME: "/:tenantId/theme",
        INVITE_LINK: "/:tenantId/invite-link",
        USERS: "/:tenantId/users",

        INVITE_USER: '/:tenantId/invite-user',
        RESEND_INVITE: '/:tenantId/resend-invite',
        INVITE_HISTORY: '/:tenantId/invite-history',
        ADMIN_USERS: '/admin-users',
        TENANT_MEMBERS: '/members'


    },
    CHAT: {
        AVAILABLE_USERS: "/available-users",
        ROOMS: "/rooms",
        DIRECT: "/direct",
        GROUP: "/group",
        ADMIN_CHAT: "/admin-chat",
        ROOM_MESSAGES: "/rooms/:roomId/messages",
        SEARCH_MESSAGES: "/rooms/:roomId/search",
        MARK_AS_READ: "/rooms/:roomId/mark-read",
        ALL_CHATS: "/admin/all-chats",
        ADMIN_CHATS_BY_ID: "/admin/chats/:adminId"
    },
};


export { API, ROUTE };