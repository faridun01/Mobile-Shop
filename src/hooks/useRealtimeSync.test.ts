import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ cleanup: undefined as undefined | (() => void) }));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => undefined | (() => void)) => { lifecycle.cleanup = effect(); },
}));

import { useRealtimeSync } from './useRealtimeSync';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close = vi.fn(() => this.onclose?.({ code: 1000 }));
  constructor(public url: string) { FakeSocket.instances.push(this); }
}

describe('realtime connection recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_WS_URL', '');
    vi.stubGlobal('window', { location: { protocol: 'https:', host: 'shop.test' } });
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.instances = [];
  });
  afterEach(() => {
    lifecycle.cleanup?.();
    lifecycle.cleanup = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reconnects after a dropped connection and requests a refresh', () => {
    const onEvent = vi.fn();
    useRealtimeSync('token', onEvent);
    const first = FakeSocket.instances[0];
    expect(first.url).toBe('wss://shop.test/ws?token=token');
    first.onopen?.();
    first.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1000);
    const second = FakeSocket.instances[1];
    second.onopen?.();
    expect(onEvent).toHaveBeenCalledWith('RECONNECTED', null);
    second.onmessage?.({ data: JSON.stringify({ type: 'SALE_COMPLETED', payload: { id: 1 } }) });
    expect(onEvent).toHaveBeenCalledWith('SALE_COMPLETED', { id: 1 });
  });

  it('backs off failed attempts and caps the delay at 30 seconds', () => {
    useRealtimeSync('token', vi.fn());
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const count = FakeSocket.instances.length;
      FakeSocket.instances[count - 1].onclose?.({ code: 1006 });
      vi.advanceTimersByTime(delay - 1);
      expect(FakeSocket.instances).toHaveLength(count);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.instances).toHaveLength(count + 1);
    }
  });

  it('cancels retries when the component unmounts or the token changes', () => {
    useRealtimeSync('old-token', vi.fn());
    FakeSocket.instances[0].onclose?.({ code: 1006 });
    lifecycle.cleanup?.();
    useRealtimeSync('new-token', vi.fn());
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1].url).toContain('token=new-token');
    expect(FakeSocket.instances[0].close).toHaveBeenCalled();
  });

  it('does not retry rejected authentication', () => {
    useRealtimeSync('expired-token', vi.fn());
    FakeSocket.instances[0].onclose?.({ code: 1008 });
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('retries a constructor failure and handles error/close only once', () => {
    const construct = vi.fn().mockImplementationOnce(() => { throw new Error('offline'); });
    vi.stubGlobal('WebSocket', class extends FakeSocket {
      constructor(url: string) { construct(); super(url); }
    });
    useRealtimeSync('token', vi.fn());
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(1);
    FakeSocket.instances[0].onerror?.();
    FakeSocket.instances[0].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
