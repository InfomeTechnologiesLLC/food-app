import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Mount the production admin SPA only when its build directory is present. */
export function mountAdminFrontend(app: Express, directory: string): boolean {
  if (!existsSync(directory)) return false;

  // The exact regex avoids Express's default loose matching treating /admin/
  // as a match and redirecting it back to itself.
  app.get(/^\/admin$/, (_req, res) => res.redirect(302, "/admin/"));
  app.use("/admin", express.static(directory, { index: false }));
  app.get("/admin/{*path}", (_req, res) => res.sendFile(resolve(directory, "index.html")));
  return true;
}
