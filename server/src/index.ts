import { env } from "./env.js";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import mongoose from "mongoose";
import multer from "multer";
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import pantryRoutes from "./routes/pantry.js";
import scanRoutes from "./routes/scans.js";
import { StockConflict } from "./lib/add-stock.js";
import planRoutes from "./routes/plans.js";

import exerciseRoutes from "./routes/exercise.js";
import historyRoutes from "./routes/history.js";
import { ScheduleConflict } from "./lib/schedule.js";

const app = express();
app.set("trust proxy", 1); // behind Render/Railway's proxy, so rate limiting sees real client IPs
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use("/auth", authRoutes);
app.use("/me", meRoutes);
app.use("/pantry", pantryRoutes);
app.use("/scans", scanRoutes);
app.use("/plans", planRoutes);
app.use("/food-history", historyRoutes);
app.use("/exercise", exerciseRoutes);

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

await mongoose.connect(env.MONGODB_URI);

app.listen(env.PORT, "0.0.0.0", () => console.log(`API on :${env.PORT}`));
