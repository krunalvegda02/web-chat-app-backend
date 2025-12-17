import dotenv from "dotenv";
import connectDB from "./db/index.js";
import app, { setupSockets } from "./app.js";

import { ensureDirectoryExists } from "./utils/ensureDirectoryExists.js";
import { createAdmin } from "./utils/createAdmin.js";

import http from "http";
import { Server } from "socket.io";



dotenv.config({
  path: "./.env",
});


const port = process.env.PORT || 8000;


const server = http.createServer(app);
// Initialize Socket.io server 
export const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Setup sockets
setupSockets(io);


connectDB()
  .then(() => {
    server.listen(port, () => {
      try {
        ensureDirectoryExists("./public/temp");
        console.log(`Server is running on port ${port}`);
        createAdmin();
      } catch (error) {
        console.error("Error during server startup:", error);
      }
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err);
  });
