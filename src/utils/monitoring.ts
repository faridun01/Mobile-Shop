/**
 * Production Centralized Error Tracking & Monitoring Utility.
 * Integrates with Sentry / LogRocket for tracking runtime crashes across store terminals.
 */
export function captureException(error: Error | unknown, context?: Record<string, any>) {
  console.error('[Production Monitoring Exception]:', error, context);

  // Send payload to Sentry if DSN is configured
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    (window as any).Sentry.captureException(error, { extra: context });
  }
}

export function initMonitoring() {
  if (process.env.NODE_ENV === 'production') {
    window.addEventListener('error', (event) => {
      captureException(event.error, { message: event.message, filename: event.filename });
    });

    window.addEventListener('unhandledrejection', (event) => {
      captureException(event.reason, { type: 'unhandledrejection' });
    });
  }
}
