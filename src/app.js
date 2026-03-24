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
  'http://rrrpay.co/',
  'https://vfx247.club', 
  'http://212.90.120.17/', // With trailing slash
  'http://212.90.120.17',  // Without trailing slash
  'https://212.90.120.17/', // HTTPS with trailing slash
  'https://212.90.120.17',   // HTTPS without trailing slash

  "https://rrrpay.co/",
].filter(Boolean); // Remove undefined values

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Log rejected origins for debugging
      console.warn(`❌ [CORS] Rejected origin: ${origin}`);
      console.log(`🔍 [CORS] Allowed origins:`, allowedOrigins);
      
      const error = new Error(`CORS policy violation: Origin ${origin} not allowed`);
      error.status = 403;
      callback(error);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'Cache-Control',
      'Pragma'
    ],
    exposedHeaders: ['Set-Cookie'],
    optionsSuccessStatus: 200,
    preflightContinue: false
  })
);

// Manual CORS headers as fallback (only for allowed origins)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Only add CORS headers for allowed origins
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, Cache-Control, Pragma');
  }
  
  if (req.method === 'OPTIONS') {
    if (!origin || allowedOrigins.includes(origin)) {
      res.sendStatus(200);
    } else {
      res.sendStatus(403);
    }
  } else {
    next();
  }
});

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
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'No Origin'} - IP: ${req.ip}`);
  if (req.method === 'OPTIONS') {
    console.log(`🔍 [OPTIONS] Headers:`, req.headers);
  }
  next();
});

// Global OPTIONS handler for allowed origins only
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  console.log(`🔧 [GLOBAL_OPTIONS] Handling OPTIONS for: ${req.path} from origin: ${origin}`);
  
  if (!origin || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key, Cache-Control, Pragma');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
  } else {
    console.warn(`❌ [GLOBAL_OPTIONS] Rejected origin: ${origin}`);
    res.sendStatus(403);
  }
});

// Test CORS endpoint
app.get('/api/test-cors', (req, res) => {
  res.json({ 
    success: true, 
    message: 'CORS is working!', 
    origin: req.headers.origin,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
});

import registerRoutes from "./routes/index.route.js";
registerRoutes(app);


import { registerChatSocket } from "./sockets/chatSocket.js";
// Socket setup function
export function setupSockets(io) {
  registerChatSocket(io);
}


export default app;