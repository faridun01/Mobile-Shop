import React from 'react';
import { SupplierInvoice, Store } from '../../types';
import { CentralCashPaymentDialog } from './CentralCashPaymentDialog';

interface PaySupplierInvoiceModalProps {
  open: boolean;
  invoice: SupplierInvoice | null;
  centralCashStore: Store | null;
  rateNumber: number;
  onClose: () => void;
  onPay: (data: { invoiceId: string; amountUsd: number; sourceAccountId?: string; storeId?: string }) => Promise<{ success: boolean; message?: string }>;
  onError: (msg: string) => void;
}

/** Pays one specific invoice from Central Cash. */
export const PaySupplierInvoiceModal: React.FC<PaySupplierInvoiceModalProps> = ({
  open,
  invoice,
  centralCashStore,
  rateNumber,
  onClose,
  onPay,
  onError,
}) => {
  if (!invoice) return null;
  const centralId = centralCashStore?.id || 'main-warehouse';
  return (
    <CentralCashPaymentDialog
      open={open}
      title="Оплата накладной"
      subtitle={invoice.invoiceNumber}
      dueUsd={invoice.remainingAmountUsd}
      cashBalanceUsd={Number(centralCashStore?.cashBalanceUsd) || 0}
      rateNumber={rateNumber}
      onClose={onClose}
      onSubmit={async (amountUsd) => {
        const res = await onPay({ invoiceId: invoice.id, amountUsd, sourceAccountId: centralId, storeId: centralId });
        if (!res.success) onError(res.message || 'Ошибка оплаты');
        return res.success;
      }}
    />
  );
};
