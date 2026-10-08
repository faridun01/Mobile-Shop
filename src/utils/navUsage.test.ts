import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getNavUsage,
  recordNavVisit,
  sortNavItemsByUsage,
  sortNavGroupsByUsage,
  DEFAULT_PAGE_WEIGHTS,
} from './navUsage';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
  };
}

describe('navUsage', () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('window', {
      localStorage: storage,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('provides sensible default weights out of the box', () => {
    const usage = getNavUsage();
    expect(usage.SALE).toBeGreaterThan(usage.SETTINGS);
    expect(usage.INVENTORY).toBeGreaterThan(usage.AUDIT_LOG);
  });

  it('increments usage when recordNavVisit is called', () => {
    const initial = getNavUsage().SETTINGS;
    recordNavVisit('SETTINGS');
    const updated = getNavUsage().SETTINGS;
    expect(updated).toBe(initial + 1);
  });

  it('sorts flat items by usage descending (most used first)', () => {
    const items = [
      { id: 'SETTINGS', label: 'Настройки' },
      { id: 'SALE', label: 'Продажи' },
      { id: 'INVENTORY', label: 'Склад' },
    ];
    const usage = { SETTINGS: 5, SALE: 100, INVENTORY: 50 };
    const sorted = sortNavItemsByUsage(items, usage);
    expect(sorted.map(i => i.id)).toEqual(['SALE', 'INVENTORY', 'SETTINGS']);
  });

  it('sorts groups and items within groups by usage frequency', () => {
    const groups = [
      {
        title: 'Управление',
        items: [
          { id: 'SETTINGS', label: 'Настройки' },
          { id: 'AUDIT_LOG', label: 'Аудит' },
        ],
      },
      {
        title: 'Продажи',
        items: [
          { id: 'SALES_HISTORY', label: 'История' },
          { id: 'SALE', label: 'POS' },
        ],
      },
    ];

    const usage = {
      SETTINGS: 2,
      AUDIT_LOG: 5,
      SALES_HISTORY: 50,
      SALE: 150,
    };

    const sortedGroups = sortNavGroupsByUsage(groups, usage);

    // Group 'Продажи' has 200 points, 'Управление' has 7 points -> 'Продажи' is first
    expect(sortedGroups[0].title).toBe('Продажи');
    expect(sortedGroups[1].title).toBe('Управление');

    // Inside 'Продажи', 'SALE' (150) is before 'SALES_HISTORY' (50)
    expect(sortedGroups[0].items.map(i => i.id)).toEqual(['SALE', 'SALES_HISTORY']);

    // Inside 'Управление', 'AUDIT_LOG' (5) is before 'SETTINGS' (2)
    expect(sortedGroups[1].items.map(i => i.id)).toEqual(['AUDIT_LOG', 'SETTINGS']);
  });
});
