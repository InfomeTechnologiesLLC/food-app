import { corsOrigins, env } from "./env.js";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { connectDb, pingDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import multer from "multer";
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import pantryRoutes from "./routes/pantry.js";
import scanRoutes from "./routes/scans.js";
import { StockConflict } from "./lib/add-stock.js";
import planRoutes from "./routes/plans.js";

import exerciseRoutes from "./routes/exercise.js";
import historyRoutes from "./routes/history.js";
import coachRoutes from "./routes/coach.js";
import foodLogRoutes from "./routes/food-log.js";
import { ScheduleConflict } from "./lib/schedule.js";
import adminRoutes from "./routes/admin.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mountAdminFrontend } from "./lib/admin-frontend.js";

const app = express();
app.set("trust proxy", 1); // behind Render/Railway's proxy, so rate limiting sees real client IPs
app.disable("x-powered-by");
// The phone app isn't affected by CORS; this only limits which websites may call the API from a browser.
app.use(cors({ origin: corsOrigins === true ? true : corsOrigins.length ? corsOrigins : false }));
app.use("/admin-api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(express.json({ limit: "1mb" }));
app.use("/admin-api", adminRoutes);

app.get("/health", async (_req, res) => res.json({ ok: true, db: await pingDb() }));
app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/pantry", pantryRoutes);
app.use("/scans", scanRoutes);
app.use("/plans", planRoutes);
app.use("/food-history", historyRoutes);
app.use("/exercise", exerciseRoutes);
app.use("/coach", coachRoutes);
app.use("/food-log", foodLogRoutes);

const adminDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../admin/dist");
if (env.NODE_ENV === "production") mountAdminFrontend(app, adminDist);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Last-resort handler: never leak stack traces to the app
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ScheduleConflict) return res.status(err.status).json({ error: err.message, code: "SCHEDULE_CONFLICT" });
  if (err instanceof StockConflict) return res.status(err.status).json({ error: err.message });
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Image is too large (max 8 MB)." : err.message });
  }
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
};
app.use(errorHandler);

try {
  await connectDb(env.DATABASE_URL);
  // Creates any missing tables (safe to run on every start). Set DB_AUTO_MIGRATE=false to manage this yourself.
  if (process.env.DB_AUTO_MIGRATE !== "false") await runMigrations(env.DATABASE_URL);
} catch (error) {
  const url = new URL(env.DATABASE_URL);
  console.error(`Could not connect to MySQL at ${url.hostname}:${url.port || 3306} (database "${url.pathname.slice(1)}").`);
  console.error("Check that MySQL is running, the database exists, and the user/password in DATABASE_URL are correct.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

app.listen(env.PORT, "0.0.0.0", () => console.log(`API on :${env.PORT}`));
