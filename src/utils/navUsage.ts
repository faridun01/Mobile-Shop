import { useState, useEffect } from 'react';

const STORAGE_KEY = 'mobile_shop_nav_usage_v1';
const EVENT_NAME = 'mobile_shop_nav_usage_updated';

// Sensible initial baseline weights so the menu starts well-ordered out of the box
export const DEFAULT_PAGE_WEIGHTS: Record<string, number> = {
  SALE: 100,
  CASH_DESK: 95,
  INVENTORY: 90,
  CUSTOMERS: 85,
  SALES_HISTORY: 80,
  STORE_RECEIPT: 70,
  TRANSFER: 65,
  REVISION: 60,
  EXPENSES: 55,
  REPORTS: 50,
  CASH_COLLECTION: 45,
  EXCHANGE: 40,
  REPAIR: 35,
  PURCHASE: 30,
  SUPPLIERS: 25,
  BONUSES: 20,
  OWNERS: 15,
  EMPLOYEES: 12,
  NOTIFICATIONS: 10,
  AUDIT_LOG: 5,
  SETTINGS: 2,
};

export function getNavUsage(): Record<string, number> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_PAGE_WEIGHTS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PAGE_WEIGHTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PAGE_WEIGHTS, ...parsed };
  } catch {
    return { ...DEFAULT_PAGE_WEIGHTS };
  }
}

export function recordNavVisit(pageId: string): void {
  if (typeof window === 'undefined' || !window.localStorage || !pageId) return;
  try {
    const current = getNavUsage();
    current[pageId] = (current[pageId] || 0) + 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { pageId, usage: current } }));
  } catch {
    // Ignore storage quota or disabled localStorage errors
  }
}

export function useNavUsage(): Record<string, number> {
  const [usage, setUsage] = useState<Record<string, number>>(() => getNavUsage());

  useEffect(() => {
    const handleUpdate = () => {
      setUsage(getNavUsage());
    };
    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return usage;
}

/**
 * Sorts flat nav items by usage frequency (descending: most used at top, rarest at bottom)
 */
export function sortNavItemsByUsage<T extends { id: string }>(
  items: T[],
  usage: Record<string, number>
): T[] {
  return [...items].sort((a, b) => {
    const weightA = usage[a.id] ?? 0;
    const weightB = usage[b.id] ?? 0;
    return weightB - weightA;
  });
}

/**
 * Sorts nav items within each group by usage frequency (descending: most used at top, rarest at bottom),
 * and orders groups by total group usage so the most active functional group stays at the top!
 */
export function sortNavGroupsByUsage<T extends { title: string; items: { id: string; [key: string]: any }[] }>(
  groups: T[],
  usage: Record<string, number>
): T[] {
  // Sort items inside each group
  const withSortedItems = groups.map(group => {
    const sortedItems = [...group.items].sort((a, b) => {
      const weightA = usage[a.id] ?? 0;
      const weightB = usage[b.id] ?? 0;
      return weightB - weightA;
    });
    return { ...group, items: sortedItems };
  });

  // Calculate group total score
  const groupScores = new Map<T, number>();
  for (const g of withSortedItems) {
    const score = g.items.reduce((sum, it) => sum + (usage[it.id] ?? 0), 0);
    groupScores.set(g, score);
  }

  // Sort groups by total score descending
  return [...withSortedItems].sort((a, b) => {
    const scoreA = groupScores.get(a) ?? 0;
    const scoreB = groupScores.get(b) ?? 0;
    return scoreB - scoreA;
  });
}
