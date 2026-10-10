import React, { useEffect, useState } from 'react';
import { CheckCircle2, Share2 } from 'lucide-react';
import { Sale } from '../../types';
import { formatMoney } from '../../utils/money';
import { formatReceiptText, paymentSummary } from '../../utils/receipt';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { CopyImeiButton } from '../common/CopyImeiButton';

interface SaleReceiptDialogProps {
  /** Receipt number of the sale just completed, or null when closed. */
  receiptNumber: number | null;
  /** The sale once it has been reloaded; undefined until then. */
  sale: Sale | undefined;
  storeAddress?: string;
  /** Show the store name under the receipt number (admin and multi-store views). */
  showStoreName: boolean;
  storeNameFallback: string;
  sellerNameFallback?: string;
  /** Closing and «Новый чек» both end the receipt. */
  onClose: () => void;
}

/** The receipt shown right after a sale, with sharing to the customer (messenger / clipboard). */
export const SaleReceiptDialog: React.FC<SaleReceiptDialogProps> = ({
  receiptNumber,
  sale,
  storeAddress,
  showStoreName,
  storeNameFallback,
  sellerNameFallback,
  onClose,
}) => {
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => { setShareState('idle'); }, [receiptNumber]);

  const share = async () => {
    if (!sale) return;
    const text = formatReceiptText(sale, { showStore: true, storeAddress });
    try {
      if (navigator.share) {
        await navigator.share({ title: `Чек №${sale.receiptNumber}`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareState('copied');
    } catch (err) {
      // Closing the share sheet is not an error.
      if ((err as Error)?.name !== 'AbortError') setShareState('failed');
    }
  };

  return (
    <Dialog
      open={receiptNumber !== null}
      onClose={onClose}
      title="Продажа завершена"
      maxWidth="sm"
      footer={
        <div className="w-full grid grid-cols-2 gap-2">
          <Button variant="secondary" fullWidth leftIcon={Share2} disabled={!sale} onClick={share}>
            {shareState === 'copied' ? 'Скопировано' : 'Отправить чек'}
          </Button>
          <Button fullWidth onClick={onClose}>Новый чек</Button>
        </div>
      }
    >
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-success/15 text-success flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">Чек №{receiptNumber}</p>
            <p className="text-xs text-fg-subtle">
              {new Date(sale?.date || Date.now()).toLocaleString('ru-RU')}
              {showStoreName && ` · ${sale?.storeName || storeNameFallback}`}
            </p>
          </div>
        </div>

        {sale ? (
          <div className="rounded-lg border border-border bg-bg divide-y divide-border text-sm">
            {sale.items.map((item) => (
              <div key={item.deviceId} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-fg-muted">{item.brand} {item.model}</p>
                  <div className="flex items-center gap-1 text-xs text-fg-subtle">
                    <span>IMEI: {item.imei}</span>
                    <CopyImeiButton imei={item.imei} />
                  </div>
                </div>
                <span className="tabular-nums font-semibold text-fg-muted whitespace-nowrap">{formatMoney(item.salePriceTjs)} TJS</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-fg-muted">Итого</span>
              <strong className="text-base tabular-nums text-accent">{formatMoney(sale.totalTjs)} TJS</strong>
            </div>
            <div className="px-3 py-2 text-xs text-fg-subtle space-y-0.5">
              <p>Оплата: <span className="text-fg-muted">{paymentSummary(sale)}</span></p>
              {sale.customerName && <p>Покупатель: <span className="text-fg-muted">{sale.customerName}</span></p>}
              {sale.customerPhone && <p>Телефон: <span className="text-fg-muted font-mono">{sale.customerPhone}</span></p>}
              <p>Продавец: <span className="text-fg-muted">{sale.sellerName || sellerNameFallback}</span></p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">Продажа сохранена. Состав чека появится после обновления данных — его можно открыть в «Истории продаж».</p>
        )}

        {shareState === 'failed' && (
          <p className="mt-2 text-xs text-danger">Не удалось отправить чек. Откройте его в «Истории продаж».</p>
        )}
      </div>
    </Dialog>
  );
};
