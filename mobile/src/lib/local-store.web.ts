// Web logging is online-only; native session persistence is intentionally separate.
const store = new Map<string, string>();
export function readLocal<T>(account: string, key: string): T | null { const value = store.get(`${account}:${key}`); return value ? JSON.parse(value) as T : null; }
export function writeLocal(account: string, key: string, value: unknown) { store.set(`${account}:${key}`, JSON.stringify(value)); }
export function removeLocal(account: string, key: string) { store.delete(`${account}:${key}`); }
