// routes/index.js
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import tenantRoutes from "./tenant.routes.js";
import chatRoutes from "./chat.routes.js";
import uploadRoutes from "./upload.routes.js";
import callLogRoutes from "./callLog.routes.js";
import contactsRoutes from "./contacts.routes.js";
import notificationRoutes from "./notification.routes.js";

import { ROUTE } from "../constants/endpoints.js";

const registerRoutes = (app) => {
  app.use(ROUTE.AUTH_ROUTER, authRoutes);
  app.use(ROUTE.USER_ROUTER, userRoutes);
  app.use(ROUTE.TENANT_ROUTER, tenantRoutes);
  app.use(ROUTE.CHAT_ROUTER, chatRoutes);
  app.use(ROUTE.UPLOAD_ROUTER, uploadRoutes);
  app.use('/api/v1/call-logs', callLogRoutes);
  app.use(ROUTE.CONTACTS_ROUTER, contactsRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
};

export default registerRoutes;
