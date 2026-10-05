import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useAuthStore, takeLegacyPersistedToken } from '../stores/useAuthStore';
import { hasActiveMutations, revokeAbandonedSession } from '../api/client';
import { InactivityMonitor } from './inactivityLock';

/** Hides the app synchronously (before the next paint) via CSS while the session is locked. */
export function markLockedDom(locked: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute('data-session-locked', locked);
}

/**
 * Locks the session: the credential is dropped on the device at once (no API request can be
 * made) and its server session is revoked; the signed-in user's screens stay mounted behind
 * the lock screen so a cart or an unsaved form survives until the same user signs in again.
 */
export function lockSession() {
  markLockedDom(true);
  const token = useAuthStore.getState().lock();
  if (token) void revokeAbandonedSession(token);
}

/** Revokes a server session left by an earlier launch (never reused). Call once at startup. */
export function revokeLeftoverSession() {
  const token = takeLegacyPersistedToken();
  if (token) void revokeAbandonedSession(token);
}

function safeSessionStorage(): Storage | null {
  try { return sessionStorage; } catch { return null; }
}

/**
 * Inactivity auto-lock disabled by user request.
 * The session remains permanently active until explicitly closed or logged out.
 */
export function useInactivityLock() {
  // Disabled: do not monitor inactivity or lock after 10 minutes
}
