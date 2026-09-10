import React from 'react';
import { AppProvider } from './context/AppContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { AppRouter } from './router/AppRouter';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <NotificationsProvider>
        <AppProvider>
          <AppRouter />
        </AppProvider>
      </NotificationsProvider>
    </ErrorBoundary>
  );
}
