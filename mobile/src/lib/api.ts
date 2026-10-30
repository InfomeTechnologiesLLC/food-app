import * as SecureStore from '@/lib/secure-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;
const TOKEN_KEY = 'mealmind.token';
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export async function loadToken() {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}
export async function saveToken(value: string | null) {
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
  token = value;
}
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public data?: any) { super(message); }
}

export async function api<T>(path: string, options: {
  method?: string; body?: unknown; headers?: Record<string, string>; timeoutMs?: number;
} = {}): Promise<T> {
  const requestToken = options.headers?.authorization?.replace(/^Bearer /, '') ?? token;
  const isForm = options.body instanceof FormData;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 120000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        // Let fetch set the multipart boundary itself for FormData.
        ...(isForm ? {} : { 'content-type': 'application/json' }),
        ...(requestToken ? { authorization: `Bearer ${requestToken}` } : {}),
        ...options.headers,
      },
      signal: controller.signal,
      body: options.body === undefined ? undefined : isForm ? options.body as FormData : JSON.stringify(options.body),
    });
    if (res.status === 401 && requestToken && requestToken === token) onUnauthorized?.();
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = data?.error;
      // In development the server adds `detail` with the underlying reason (e.g. the AI's error)
      const detail = __DEV__ && typeof data?.detail === 'string' ? `\n\nDetails: ${data.detail}` : '';
      const message = (typeof err === 'string' ? err : 'Something went wrong. Please check your input.') + detail;
      throw new ApiError(res.status, message, data?.code, data);
    }
    if (data === null) throw new Error('The server returned an unreadable response. Try again.');
    return data as T;
  } finally { clearTimeout(timer); }
}
