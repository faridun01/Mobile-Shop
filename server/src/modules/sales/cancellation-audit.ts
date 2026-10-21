export function activeRefundLogs<T extends { id?: string; action: string; financialDetails: unknown }>(logs: T[]): T[] {
  const cancelled = new Set(logs.filter((log) => log.action === 'REFUND_CANCEL').map((log) =>
    (log.financialDetails as { refundLogId?: string } | null)?.refundLogId));
  return logs.filter((log) => log.action !== 'REFUND' || !cancelled.has(log.id));
}

/** Exact saved event; the cancellation reports its negative on the correction's own day. */
export interface CancelledReturnEvent {
  storeId: string;
  saleId: string;
  receiptNumber: number;
  originalDate: string;
  revenueUsd: number;
  revenueTjs: number;
  profitUsd: number;
  bonusUsd: number;
  rate: number;
  penaltyTjs: number;
  penaltyUsd: number;
  reason: string;
}
