import { useAuthStore } from '../stores/useAuthStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = API_BASE_URL.startsWith('http')
    ? `${API_BASE_URL.replace(/\/$/, '')}${cleanEndpoint}`
    : `${API_BASE_URL}${cleanEndpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().logout();
    }
    const errorData = await response.json().catch(() => ({ message: 'API Request Failed' }));
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}
