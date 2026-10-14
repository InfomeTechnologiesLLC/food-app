# Admin portal

The admin API is separate from mobile JWT authentication. Create the first admin explicitly by setting `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the server environment and running `npm run seed:admin` from `server/`. The script creates the account only when that email is absent; it never resets existing credentials. It is not run during server startup.

Admins sign in at `POST /admin-api/auth/login` with `{ "email", "password" }`. The server returns an HttpOnly, SameSite=Lax cookie scoped to `/admin-api`; production uses Secure cookies. Sessions expire after eight hours, are stored as SHA-256 token hashes, and are revoked by `POST /admin-api/auth/logout`. `GET /admin-api/auth/me` returns the signed-in admin. Login is rate limited.

The authenticated read-only endpoints are `GET /admin-api/overview`, `GET /admin-api/users`, `GET /admin-api/users/:id`, and `GET /admin-api/users/:id/records/:category`. User lists accept `search`, `plan=free|plus`, `onboarded=true|false`, `page`, and `limit`. Record categories are `pantry`, `meal-plans`, `food-history`, `scans`, `workout-plans`, `workout-sessions`, and `stock-operations`. All admin API responses set `Cache-Control: no-store`.

When `admin/dist` exists and `NODE_ENV=production`, the server serves it at `/admin` and falls back to its SPA entry point for admin routes.
