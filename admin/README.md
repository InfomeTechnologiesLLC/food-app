# MealMind Admin

Read-only internal portal for separate administrator accounts. It talks to the same-origin `/admin-api` endpoints and sends cookies with every request.

## Development

From this directory, run `npm install` once, then `npm run dev`. Vite serves the portal under `/admin/` and proxies `/admin-api` to `http://localhost:4000`.

Start the backend from `server/` with `npm run dev`. To create an administrator, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the server's local environment, then run `npm run seed:admin` there. Accounts are separate from mobile users; running the seed again preserves the existing password. Passwords require at least 8 characters and no more than 72 UTF-8 bytes.

If the backend uses a different development port, set `ADMIN_API_PROXY` to its local URL before starting Vite.

Run `npm run typecheck` for TypeScript checks and `npm run build` to create the production bundle in `dist/`. Production hosting should serve this app at `/admin/` and route `/admin-api` to the backend.

For the existing Express host, build both `admin/` and `server/`, then start the server with `NODE_ENV=production` over HTTPS. It serves `admin/dist` at `/admin/`, including direct links to user pages. Production login cookies require HTTPS. Deploy both folders together so the server can find the frontend bundle.

The portal displays stored MongoDB records only, including debug JSON. Credentials and push tokens are excluded. Unsynced phone-only activity and deleted plans are unavailable. There are no user-data editing or export actions.
