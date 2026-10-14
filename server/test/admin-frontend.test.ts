import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type Request, type Response } from "express";
import { mountAdminFrontend } from "../src/lib/admin-frontend.js";

type Result = { status: number; redirect?: string; file?: string; body?: string };

function request(app: express.Express, url: string): Promise<Result> {
  return new Promise((resolve, reject) => {
    const result: Result = { status: 200 };
    const req = Object.assign(Object.create(app.request), {
      app, method: "GET", url, originalUrl: url, baseUrl: "", headers: { host: "localhost", accept: "text/html" },
    }) as Request;
    const res = Object.assign(Object.create(app.response), {
      app, req, locals: {}, statusCode: 200,
      setHeader(name: string, value: unknown) { return this; },
      getHeader(_name: string) { return undefined; },
      removeHeader(_name: string) { return this; },
      end(body?: string) { result.status = this.statusCode; result.body = body; resolve(result); return this; },
      redirect(status: number, location: string) { result.status = status; result.redirect = location; resolve(result); return this; },
      sendFile(path: string) { result.status = this.statusCode; result.file = path; resolve(result); return this; },
    }) as unknown as Response;
    app.handle(req, res, (error?: unknown) => {
      if (error) reject(error);
      else { result.status = res.statusCode === 200 ? 404 : res.statusCode; resolve(result); }
    });
  });
}

test("admin frontend redirects only /admin and serves SPA routes from index", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mealmind-admin-"));
  try {
    await writeFile(join(directory, "index.html"), "<main>admin</main>");
    const app = express();
    assert.equal(mountAdminFrontend(app, directory), true);

    const bare = await request(app, "/admin");
    assert.equal(bare.status, 302);
    assert.equal(bare.redirect, "/admin/");

    for (const path of ["/admin/", "/admin/users/abc123"]) {
      const result = await request(app, path);
      assert.equal(result.status, 200, path);
      assert.equal(result.file, join(directory, "index.html"), path);
    }

    const outside = await request(app, "/admin-api/auth/me");
    assert.equal(outside.status, 404);
    assert.equal(outside.file, undefined);
    assert.equal(outside.redirect, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing admin build directory does not register routes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "mealmind-admin-missing-"));
  const missing = join(parent, "dist");
  try {
    const app = express();
    assert.equal(mountAdminFrontend(app, missing), false);
    const result = await request(app, "/admin");
    assert.equal(result.status, 404);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
