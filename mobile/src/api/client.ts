// File: mobile/src/api/client.ts

import Constants from 'expo-constants';

const API_BASE = (Constants.expoConfig?.extra?.['apiUrl'] as string | undefined)
  ?? 'http://localhost:4000';

interface ApiResponse<T> {
  success: boolean;
  data?:   T;
  error?:  { code: string; message: string };
}

let _accessToken  = '';
let _refreshToken = '';

export function setTokens(access: string, refresh: string): void {
  _accessToken  = access;
  _refreshToken = refresh;
}

export function getAccessToken(): string { return _accessToken; }

export async function apiRequest<T>(
  path:    string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
      ...(_accessToken ? { Authorization: `Bearer ${_accessToken}` } : {}),
    },
  });

  const json: ApiResponse<T> = await res.json();

  if (!json.success) {
    throw new Error(json.error?.message ?? 'API error');
  }

  return json.data as T;
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body:   JSON.stringify(body),
  });
}

export async function get<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export async function del<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}
