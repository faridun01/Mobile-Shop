type Retry = () => Promise<unknown>;

/** Tracks failed reads only. Old sessions cannot change the current session's state. */
export class DataLoadRecovery {
  constructor(private readonly onRecovered: () => void = () => {}) {}
  private epoch = 0;
  private failed = new Map<string, Retry>();
  private active = new Set<Promise<unknown>>();
  private listeners = new Set<() => void>();
  private retryTask: Promise<void> | null = null;
  private state = { failed: 0, retrying: false };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish() {
    this.state = { failed: this.failed.size, retrying: !!this.retryTask };
    this.listeners.forEach(listener => listener());
  }
  reset() {
    this.epoch++; this.failed.clear(); this.active.clear(); this.retryTask = null; this.publish();
  }
  run<T>(key: string, load: () => Promise<T>, retry: Retry = () => this.run(key, load)): Promise<T> {
    const epoch = this.epoch;
    const task = (async () => {
      try {
        const result = await load();
        if (epoch === this.epoch && this.failed.delete(key)) this.publish();
        return result;
      } catch (error) {
        if (epoch === this.epoch) { this.failed.set(key, retry); this.publish(); }
        throw error;
      }
    })().finally(() => { this.active.delete(task); });
    this.active.add(task);
    return task;
  }
  retry = (): Promise<void> => {
    if (this.retryTask) return this.retryTask;
    const epoch = this.epoch;
    const task = (async () => {
      // A fast failure may expose Retry while other initial reads are still failing.
      while (epoch === this.epoch && this.active.size) await Promise.allSettled([...this.active]);
      if (epoch !== this.epoch) return;
      await Promise.allSettled([...this.failed.values()].map(read => Promise.resolve().then(() => epoch === this.epoch ? read() : undefined)));
    })()
      .finally(() => { if (this.retryTask === task) { this.retryTask = null; this.publish(); if (this.failed.size === 0) this.onRecovered(); } });
    this.retryTask = task; this.publish();
    return task;
  };
}
