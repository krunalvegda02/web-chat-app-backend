import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv"

dotenv.config();

const app = express();

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


import registerRoutes from "./routes/index.route.js";
registerRoutes(app);


import { registerChatSocket } from "./sockets/chatSocket.js";
// Socket setup function
export function setupSockets(io) {
  registerChatSocket(io);
}


export default app;