import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  currentUser: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

const getInitialUser = (): User | null => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return {
      id: 'user-admin',
      login: 'admin',
      name: 'Далер',
      role: 'ADMIN',
      active: true,
      createdAt: '2026-01-01T08:00:00Z'
    };
  }
  try {
    const savedUser = localStorage.getItem('ms_user');
    if (savedUser) return JSON.parse(savedUser);

    const savedUsers = localStorage.getItem('ms_users');
    if (savedUsers) {
      const usersList = JSON.parse(savedUsers);
      const adminUser = usersList.find((u: any) => u.login === 'admin' || u.role === 'ADMIN');
      if (adminUser) return adminUser;
    }
  } catch (e) {
    console.error(e);
  }
  return {
    id: 'user-admin',
    login: 'admin',
    name: 'Далер',
    role: 'ADMIN',
    active: true,
    createdAt: '2026-01-01T08:00:00Z'
  };
};

const initialUser = getInitialUser();

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: initialUser,
  token: initialUser ? 'mock-jwt-token-session' : null,
  isAuthenticated: !!initialUser,

  setAuth: (user: User, token: string) => {
    localStorage.setItem('ms_jwt_token', token);
    localStorage.setItem('ms_user', JSON.stringify(user));
    set({ currentUser: user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('ms_jwt_token');
    localStorage.removeItem('ms_user');
    set({ currentUser: null, token: null, isAuthenticated: false });
  },
}));
