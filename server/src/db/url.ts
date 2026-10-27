/**
 * The MySQL connection string. Use either
 *   DATABASE_URL=mysql://user:password@localhost:3306/mealmind
 * or the separate DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME settings
 * (easier when the password contains special characters such as @ or #).
 */
export function databaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (!env.DB_NAME) return undefined;
  const user = encodeURIComponent(env.DB_USER ?? "root");
  const password = env.DB_PASSWORD ? `:${encodeURIComponent(env.DB_PASSWORD)}` : "";
  return `mysql://${user}${password}@${env.DB_HOST ?? "localhost"}:${env.DB_PORT ?? "3306"}/${encodeURIComponent(env.DB_NAME)}`;
}
