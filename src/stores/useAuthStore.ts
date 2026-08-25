import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  currentUser: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

// No default-admin fallback: an unauthenticated visitor must see the login screen,
// never a live session. Only a real, previously-issued token restores a session.
const getInitialUser = (): User | null => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const savedUser = localStorage.getItem('ms_user');
    const savedToken = localStorage.getItem('ms_jwt_token');
    if (savedUser && savedToken) return JSON.parse(savedUser);
  } catch (e) {
    console.error(e);
  }
  return null;
};

const getInitialToken = (): string | null => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  return localStorage.getItem('ms_jwt_token');
};

const initialUser = getInitialUser();
const initialToken = initialUser ? getInitialToken() : null;

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: initialUser,
  token: initialToken,
  isAuthenticated: !!initialUser && !!initialToken,

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
