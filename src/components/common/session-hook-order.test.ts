import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
vi.mock('../../context/AppContext', async () => {
 const React = await import('react');
 return { useAppFields: () => {
  const [ready, setReady] = React.useState(false);
  if(!ready) setReady(true);
  return { currentUser: ready ? {id:'probe',role:'ADMIN'} : null, todayRate: null, stores: [], devices: [], owners: [], users: [], storeProfitShares: [], ownerTransactions: [], expenses: [], sales: [], selectedStoreId:'all' };
 }};
});
import { DailyRateModal } from './DailyRateModal';
import { RevisionPage } from '../pages/RevisionPage';
it('keeps hook order when DailyRateModal user becomes available in the same component instance', () => {
 expect(() => renderToString(React.createElement(DailyRateModal, {isOpen:false}))).not.toThrow();
});
it('keeps hook order when RevisionPage user becomes admin in the same component instance', () => {
 expect(() => renderToString(React.createElement(MemoryRouter, null, React.createElement(RevisionPage)))).not.toThrow();
});

