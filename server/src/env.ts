import "dotenv/config";
import { z } from "zod";
import { databaseUrlFromEnv } from "./db/url.js";

// Fail fast at startup instead of on the first request that needs a missing setting
const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().startsWith("mysql://", "DATABASE_URL must look like mysql://user:password@localhost:3306/mealmind"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 random characters (generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\")"),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  /** Production only: comma-separated web origins allowed to call the API (e.g. https://admin.example.com). The phone app doesn't need this. */
  CORS_ORIGINS: z.string().optional(),
});

const parsed = schema.safeParse({ ...process.env, DATABASE_URL: databaseUrlFromEnv() });
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;

/** Browser origins allowed to call the API. In development any origin; in production only CORS_ORIGINS (none when unset). */
export const corsOrigins = env.NODE_ENV === "production"
  ? (env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)
  : true;
