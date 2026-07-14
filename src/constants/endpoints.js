const ROUTE = {
    AUTH_ROUTER: "/api/v1/auth",
    USER_ROUTER: "/api/v1/users",

    CHAT_ROUTER: "/api/v1/chat",
    UPLOAD_ROUTER: "/api/v1/upload",
};

const API = {
    AUTH: {
        LOGIN: "/login",
        LOGOUT: "/logout",
        LOGOUT_ALL: "/logout-all",
        REFRESH_TOKEN: "/refresh-token",
        ME: "/me",
        SESSIONS: "/sessions",
        REVOKE_SESSION: "/revoke-session",
    },
    SUPER_ADMIN: {
        CREATE_ADMIN: "/create-admin",
    },
    USER: {
        BY_ID: "/:userId",
        PROFILE: "/profile",
        NOTIFICATIONS: "/notifications",
        NOTIFICATION_BY_ID: "/notifications/:notificationId",
    },


    CHAT: {
        AVAILABLE_USERS: "/available-users",
        ROOMS: "/rooms",
        DIRECT: "/direct",
        ADMIN_CHAT: "/admin-chat",

        ROOM_MESSAGES: "/rooms/:roomId/messages",
        MARK_AS_READ: "/rooms/:roomId/mark-as-read",
        SEARCH_MESSAGES: "/rooms/:roomId/search",

        // SUPER ADMIN
        ALL_CHATS: "/admin/all-chats",
        ADMIN_CHATS_BY_ID: "/admin/chats/:adminId",
        USER_ROOMS: "/user/:userId/rooms",

        // ADMIN (NEW – MEMBER MONITORING)
        ADMIN_MEMBER_CHATS: "/admin/member-chats",
        SPECIFIC_MEMBER_CHATS: "/admin/member-chats/:memberId",
        MEMBER_CHAT_HISTORY: "/admin/member-chats/:memberId/rooms/:roomId/messages"
    },

};


export { API, ROUTE };