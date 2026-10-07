import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * CashDeskPage is now unified into FinancePage under the «Касса и долги» tab.
 * Any direct navigation to /cash automatically redirects to /finance?tab=CASH.
 */
export const CashDeskPage: React.FC = () => {
  return <Navigate to="/finance?tab=CASH" replace />;
};
