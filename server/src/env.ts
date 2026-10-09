import "dotenv/config";
import { z } from "zod";

// Fail fast at startup instead of on the first request that needs a missing setting
const schema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().startsWith("mongodb"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET should be at least 16 random characters"),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
