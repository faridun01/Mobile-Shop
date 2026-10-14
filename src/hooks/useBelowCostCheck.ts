import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

export interface PriceToCheck {
  deviceId: string;
  priceTjs: number | undefined;
}

/**
 * Which of these phones a price would sell below cost. The server answers yes/no only, so store
 * staff are warned without ever seeing the purchase cost. Asked again shortly after the prices
 * stop changing; a failed check simply shows no warning.
 */
export function useBelowCostCheck(items: PriceToCheck[], delayMs = 400): Record<string, boolean> {
  const [belowCost, setBelowCost] = useState<Record<string, boolean>>({});
  const valid = items.filter((item) => item.deviceId && item.priceTjs !== undefined && Number.isFinite(item.priceTjs) && item.priceTjs > 0);
  const key = valid.map((item) => `${item.deviceId}:${item.priceTjs}`).join('|');

  useEffect(() => {
    if (!valid.length) {
      setBelowCost({});
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiClient<{ items: { deviceId: string; belowCost: boolean }[] }>('/devices/price-check', {
        method: 'POST',
        body: JSON.stringify({ items: valid.map((item) => ({ deviceId: item.deviceId, priceTjs: item.priceTjs })) }),
      })
        .then((res) => {
          if (cancelled) return;
          setBelowCost(Object.fromEntries((res.items ?? []).map((row) => [row.deviceId, Boolean(row.belowCost)])));
        })
        .catch(() => { if (!cancelled) setBelowCost({}); });
    }, delayMs);
    return () => { cancelled = true; clearTimeout(timer); };
    // `key` captures every device and price that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs]);

  return belowCost;
}
