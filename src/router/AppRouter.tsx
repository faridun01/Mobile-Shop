import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { LoadingState } from '../components/ui/Skeleton';

const LoginPage = lazy(() => import('../components/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const MainLayout = lazy(() => import('./MainLayout').then((m) => ({ default: m.MainLayout })));

function LoadingFallback() {
  return <LoadingState label="Загрузка…" className="h-full bg-bg" />;
}

function SessionLayout() {
  const currentUser = useAuthStore((state) => state.currentUser);
  // Same session check as MainLayout, before downloading the authenticated UI.
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Suspense fallback={<LoadingFallback />}><MainLayout /></Suspense>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Suspense fallback={<LoadingFallback />}><LoginPage /></Suspense>} />
        <Route path="/*" element={<SessionLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
