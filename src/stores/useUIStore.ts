import { create } from 'zustand';
import { ThemeMode } from '../types';

interface UIState {
  theme: ThemeMode;
  drawerOpen: boolean;
  selectedStoreId: string;
  isDailyRateModalOpen: boolean;
  isScannerOpen: boolean;
  scannerCallback: ((code: string) => void) | null;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setDrawerOpen: (open: boolean) => void;
  setSelectedStoreId: (storeId: string) => void;
  setDailyRateModalOpen: (open: boolean) => void;
  openScanner: (callback: (code: string) => void) => void;
  closeScanner: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: (typeof localStorage !== 'undefined' ? (localStorage.getItem('ms_theme') as ThemeMode) : null) || 'dark',
  drawerOpen: false,
  selectedStoreId: 'all',
  isDailyRateModalOpen: false,
  isScannerOpen: false,
  scannerCallback: null,

  setTheme: (theme) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ms_theme', theme);
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    set({ theme });
  },

  toggleTheme: () =>
    set((state) => {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ms_theme', nextTheme);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', nextTheme);
      }
      return { theme: nextTheme };
    }),

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setSelectedStoreId: (selectedStoreId) => set({ selectedStoreId }),
  setDailyRateModalOpen: (isDailyRateModalOpen) => set({ isDailyRateModalOpen }),

  openScanner: (scannerCallback) => set({ isScannerOpen: true, scannerCallback }),
  closeScanner: () => set({ isScannerOpen: false, scannerCallback: null }),
}));
