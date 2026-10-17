import React from 'react';
import { renderToString, renderToPipeableStream } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../context/AppContext', () => ({ useAppFields: () => ({ currentUser: { id: 'diagnostic', role: 'ADMIN', name: 'Диагностика' }, stores: [], users: [], expenses: [], todayRate: { rate: 10 }, selectedStoreId: 'all', isInitialLoading: false, fetchExpensesRange: async () => [] }) }));
import { ExpensesPage } from './ExpensesPage';
afterEach(() => vi.unstubAllGlobals());
it('control: expense page renders with a valid saved category array', () => {
 vi.stubGlobal('localStorage', { getItem: () => '[]' });
 expect(() => renderToString(React.createElement(ExpensesPage))).not.toThrow();
});
it.each(['null', '{}', '123'])('renders safely with invalid saved categories %s', (value) => {
 vi.stubGlobal('localStorage', { getItem: () => value });
 expect(() => renderToString(React.createElement(ExpensesPage))).not.toThrow();
});
it('reproduces rejected lazy chunk as a React rendering error', async () => {
 const reason = new TypeError('Failed to fetch dynamically imported module');
 const Page = React.lazy(() => Promise.reject(reason));
 await new Promise<void>((resolve, reject) => {
  const stream = renderToPipeableStream(React.createElement(React.Suspense, {fallback: 'loading'}, React.createElement(Page)), {
   onError(error) { try { expect(error).toBe(reason); resolve(); } catch(e) { reject(e); } },
   onAllReady() { stream.abort(); }
  });
 });
});

