import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any uncaught render error anywhere in the tree (a null pointer, a bad
 * prop, a race between a realtime update and a component unmounting) takes down the
 * entire app to a blank white screen with no way back short of the user guessing to
 * reload. This catches it and offers a reload instead.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: '24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif',
          background: '#0b0e14', color: '#e6e8ec',
        }}>
          <p style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Произошла ошибка
          </p>
          <p style={{ fontSize: '12px', color: '#9aa1ad', marginTop: '8px', maxWidth: '360px' }}>
            Приложение столкнулось с непредвиденной ошибкой. Попробуйте обновить страницу.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px', padding: '10px 20px', borderRadius: '10px', border: 'none',
              background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
            }}
          >
            ОБНОВИТЬ СТРАНИЦУ
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
