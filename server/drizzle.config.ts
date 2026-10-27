import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { databaseUrlFromEnv } from "./src/db/url.js";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrlFromEnv() ?? "mysql://root@localhost:3306/mealmind" },
});
