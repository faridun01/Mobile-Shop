import { describe, expect, it } from 'vitest';
import { activeRefundLogs } from './cancellation-audit';
import { calculateRecognizedProfit } from './profit';

describe('cancellation audit', () => {
  it('ignores cancelled full refunds and retains a later refund on the same receipt', () => {
    const logs = [
      { id: 'original', action: 'REFUND', financialDetails: { amountUsd: 330.11 } },
      { id: 'cancel', action: 'REFUND_CANCEL', financialDetails: { refundLogId: 'original' } },
      { id: 'new', action: 'REFUND', financialDetails: { amountUsd: 804.3 } },
    ];
    expect(activeRefundLogs(logs).filter((row) => row.action === 'REFUND').map((row) => row.id)).toEqual(['new']);
  });

  it('returns the original profit after cancelling a return, including repeated corrections', () => {
    const logs = [
      { action: 'SALE', financialDetails: { recognizedProfitUsd: 384.41 } },
      { action: 'SALE_RETURN', financialDetails: { profitDeltaUsd: 419.89 } },
      { action: 'SALE_RETURN_CANCEL', financialDetails: { profitDeltaUsd: -419.89 } },
      { action: 'SALE_RETURN', financialDetails: { profitDeltaUsd: -54.3 } },
      { action: 'SALE_RETURN_CANCEL', financialDetails: { profitDeltaUsd: 54.3 } },
    ];
    expect(calculateRecognizedProfit(logs, 0).toString()).toBe('384.41');
  });
});
