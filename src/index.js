import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

import connectDB from "./db/index.js";
import app, { setupSockets } from "./app.js";
import { ensureDirectoryExists } from "./utils/ensureDirectoryExists.js";
import { createAdmin } from "./utils/createAdmin.js";

dotenv.config({ path: "./.env" });

const PORT = process.env.PORT || 5500;

let server;
let io;

/* =====================================================
   START SERVER (ONLY ONCE, AFTER DB CONNECTS)
   ===================================================== */
const startServer = async () => {
  try {
    // Ensure folders BEFORE server starts
    ensureDirectoryExists("./public/temp");

    // Connect DB (await — not then)
    await connectDB();
    console.log("✅ MongoDB connected");

    // Create HTTP server ONCE
    server = http.createServer(app);

    // Attach Socket.IO
    io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN,
        credentials: true,
        methods: ["GET", "POST"],
      },
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Store io in app for controller access
    app.set('io', io);
    
    setupSockets(io);

    // Start listening ONCE
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      createAdmin();
    });

    // Handle port errors safely
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} already in use`);
        process.exit(1);
      }
      throw err;
    });

  } catch (error) {
    console.error("❌ Startup failed:", error);
    process.exit(1);
  }
};

/* =====================================================
   GRACEFUL SHUTDOWN (CRITICAL)
   ===================================================== */
const shutdown = (signal) => {
  console.log(`🛑 Received ${signal}. Shutting down...`);

  if (io) {
    io.close(() => console.log("🔌 Socket.IO closed"));
  }

  if (server) {
    server.close(() => {
      console.log("🧹 HTTP server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  // Force exit if stuck
  setTimeout(() => {
    console.error("⚠️ Force shutdown");
    process.exit(1);
  }, 5000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGUSR2", shutdown); // nodemon restart
process.on("uncaughtException", shutdown);
process.on("unhandledRejection", shutdown);

// 🚀 BOOT
startServer();
