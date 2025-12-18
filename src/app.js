import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();

// Rate limiter to prevent API spam
const apiLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 20, // Max 20 requests per second per IP
  message: { success: false, message: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`⚠️ [RATE_LIMIT] Blocked ${req.method} ${req.path} from ${req.ip}`);
    res.status(429).json({ success: false, message: 'Too many requests, please slow down' });
  }
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static("public"));
app.use(cookieParser());



// Apply rate limiter
app.use('/api/', apiLimiter);

// Request logging (after rate limiter)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

import registerRoutes from "./routes/index.route.js";
registerRoutes(app);


import { registerChatSocket } from "./sockets/chatSocket.js";
// Socket setup function
export function setupSockets(io) {
  registerChatSocket(io);
}


export default app;