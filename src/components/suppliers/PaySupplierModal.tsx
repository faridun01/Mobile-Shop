import React from 'react';
import { Supplier, Store } from '../../types';
import { CentralCashPaymentDialog } from './CentralCashPaymentDialog';

interface PaySupplierModalProps {
  open: boolean;
  supplier: Supplier | null;
  centralCashStore: Store | null;
  rateNumber: number;
  onClose: () => void;
  onPay: (data: { supplierId: string; amountUsd: number; sourceAccountId?: string; storeId?: string; note?: string }) => Promise<{ success: boolean; message?: string }>;
  onError: (msg: string) => void;
}

/** Pays down a supplier's debt from Central Cash; the server applies it to the oldest invoices first. */
export const PaySupplierModal: React.FC<PaySupplierModalProps> = ({
  open,
  supplier,
  centralCashStore,
  rateNumber,
  onClose,
  onPay,
  onError,
}) => {
  if (!supplier) return null;
  const centralId = centralCashStore?.id || 'main-warehouse';
  return (
    <CentralCashPaymentDialog
      open={open}
      title="Оплата поставщику"
      subtitle={supplier.name}
      dueUsd={supplier.totalDebtUsd}
      cashBalanceUsd={Number(centralCashStore?.cashBalanceUsd) || 0}
      rateNumber={rateNumber}
      withNote
      defaultNote={`Оплата поставщику ${supplier.name}`}
      onClose={onClose}
      onSubmit={async (amountUsd, note) => {
        const res = await onPay({ supplierId: supplier.id, amountUsd, sourceAccountId: centralId, storeId: centralId, note });
        if (!res.success) onError(res.message || 'Ошибка оплаты');
        return res.success;
      }}
    />
  );
};
