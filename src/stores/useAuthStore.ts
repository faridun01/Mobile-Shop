import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  currentUser: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: {
    id: 'usr-admin-1',
    login: 'admin',
    name: 'Администратор',
    role: 'ADMIN',
    active: true,
    createdAt: new Date().toISOString(),
  },
  token: 'mock-jwt-token-session',
  isAuthenticated: true,

  setAuth: (user: User, token: string) => {
    localStorage.setItem('ms_jwt_token', token);
    set({ currentUser: user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('ms_jwt_token');
    set({ currentUser: null, token: null, isAuthenticated: false });
  },
}));
