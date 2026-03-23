import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Rate limiter disabled for debugging
// const apiLimiter = rateLimit({
//   windowMs: 60 * 1000, // 1 minute
//   max: 100, // Max 100 requests per minute per IP
//   message: { success: false, message: 'Too many requests, please slow down' },
//   standardHeaders: true,
//   legacyHeaders: false,
//   handler: (req, res) => {
//     console.log(`⚠️ [RATE_LIMIT] Blocked ${req.method} ${req.path} from ${req.ip}`);
//     res.status(429).json({ success: false, message: 'Too many requests, please slow down' });
//   }
// });

const allowedOrigins = [
  process.env.CORS_ORIGIN,
  'http://localhost:5500', // Backend server serving test-chat.html
  'http://localhost:5501',
  'http://127.0.0.1:5501',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173', // Frontend Vite dev server
  'http://127.0.0.1:5173',
  'https://vfx247.club', // Production domain
  'https://www.vfx247.club', // Production www subdomain
  'http://vfx247.club', // HTTP variant (will redirect to HTTPS)
  'http://www.vfx247.club', // HTTP www variant (will redirect to HTTPS)
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static("public"));

// ✅ Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use(cookieParser());



// Apply rate limiter - DISABLED FOR DEBUGGING
// app.use('/api/', apiLimiter);

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