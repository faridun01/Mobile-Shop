/**
 * Thin fetch wrapper for integration tests that exercise the real Express API
 * against a real PostgreSQL database (no mocks). Requires the server from
 * `server/src/index.ts` to be running and reachable at BASE_URL (defaults to
 * the local dev server on port 3002) — see tests/integration/README.md.
 */
export const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';

export interface ApiResult<T = any> {
  status: number;
  json: T;
}

export async function apiCall<T = any>(token: string | null, method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json: json as T };
}

export async function login(loginStr: string, password: string): Promise<string> {
  const result = await apiCall<{ token: string }>(null, 'POST', '/api/auth/login', { login: loginStr, password });
  if (!result.json?.token) {
    throw new Error(`Login failed for ${loginStr}: ${result.status} ${JSON.stringify(result.json)}`);
  }
  return result.json.token;
}

export async function isServerReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
