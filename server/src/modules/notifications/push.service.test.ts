import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import webpush from 'web-push';
import { PushNotificationService, isAllowedPushEndpoint } from './push.service';

describe('PushNotificationService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    const testKeys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = testKeys.publicKey;
    process.env.VAPID_PRIVATE_KEY = testKeys.privateKey;
    (PushNotificationService as any).configured = false;
    (PushNotificationService as any).warnedMissingKeys = false;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    (PushNotificationService as any).configured = false;
  });

  it('initializes successfully with valid VAPID details', () => {
    const isInit = PushNotificationService.init();
    expect(isInit).toBe(true);
    expect(PushNotificationService.isEnabled()).toBe(true);
  });

  it('provides a valid VAPID public key string', () => {
    const key = PushNotificationService.getPublicKey();
    expect(key).toBeTypeOf('string');
    expect(key?.length).toBeGreaterThan(20);
  });

  it('gracefully disables push notifications when VAPID keys are absent', () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    (PushNotificationService as any).configured = false;
    (PushNotificationService as any).warnedMissingKeys = false;

    expect(PushNotificationService.init()).toBe(false);
    expect(PushNotificationService.isEnabled()).toBe(false);
    expect(PushNotificationService.getPublicKey()).toBeNull();
  });

  it('allows valid browser push service endpoints', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/sample-token')).toBe(true);
    expect(isAllowedPushEndpoint('https://android.googleapis.com/gcm/send/sample-token')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QN01sample')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/sample')).toBe(true);
    expect(isAllowedPushEndpoint('https://push.services.mozilla.com/wpush/v2/sample')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-sn1p.notify.windows.com/w/sample')).toBe(true);
  });

  it('rejects disallowed or malicious endpoints', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/plain-http')).toBe(false);
    expect(isAllowedPushEndpoint('https://malicious-site.com/push')).toBe(false);
    expect(isAllowedPushEndpoint('https://localhost:3000/internal')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedPushEndpoint('')).toBe(false);
    expect(isAllowedPushEndpoint(null)).toBe(false);
    expect(isAllowedPushEndpoint(undefined)).toBe(false);
  });
});
