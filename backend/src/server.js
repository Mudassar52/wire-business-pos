import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import routes from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { runMigrations } from "./db/migrate.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" })); // 5mb to allow the base64 logo in settings
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Basic protection against brute-force login attempts
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth/login", loginLimiter);

// Lighter, general-purpose limiter for every other API route, so no single
// client (or bug in the frontend) can hammer the database endlessly.
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use("/api", apiLimiter);

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;

// Server start hote hi database schema apne aap up-to-date ho jata hai
// (idempotent hai — dobara chalne se kuch nahi bigrta), taake Render jaisi
// jagah deploy karne ke baad Supabase SQL Editor mein manually schema.sql
// paste karna na pade.
async function start() {
  try {
    await runMigrations();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("❌ Startup migration failed:", err);
    // Migration fail hone par bhi server start hone dete hain (taake agar DB
    // temporarily unreachable ho to poora app na gir jaye), lekin error
    // clearly Render logs mein dikh jayega.
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Wire Business POS API listening on http://localhost:${PORT}`);
  });
}

start();
