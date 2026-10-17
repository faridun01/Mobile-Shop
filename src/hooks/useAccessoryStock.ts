import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { mapAccessoryStockItem } from '../api/mappers';
import type { AccessoryStockItem } from '../types';
import { useDataRefreshRevision } from './useDataRefreshRevision';

/**
 * Accessory cards with their stock at one location (store staff always get their own store),
 * refreshed whenever business data changes. `available` per store excludes units held by a
 * transfer awaiting approval.
 */
export function useAccessoryStock(storeId: string | undefined) {
  const refreshRevision = useDataRefreshRevision();
  const [items, setItems] = useState<AccessoryStockItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!storeId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    apiClient<unknown[]>(`/accessories?storeId=${encodeURIComponent(storeId)}`)
      .then((rows) => {
        if (cancelled) return;
        setItems((rows || []).map(mapAccessoryStockItem));
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [storeId, refreshRevision]);

  return { items, loaded };
}

/** Units of a card that can be sold or moved now at `storeId`. */
export const availableAt = (item: AccessoryStockItem, storeId: string | undefined) =>
  item.stores.filter((s) => !storeId || s.storeId === storeId).reduce((sum, s) => sum + (s.available ?? s.quantity), 0);
