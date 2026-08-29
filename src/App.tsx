import React from 'react';
import { AppProvider } from './context/AppContext';
import { AppRouter } from './router/AppRouter';

export default function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
}
