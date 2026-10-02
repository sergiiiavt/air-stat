import React from 'react';
import ReactDOM from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './theme.css';
import App from './App';
import ProgressPage from './ProgressPage';
import './mobile.css';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const RootPage = pathname === '/progress' ? ProgressPage : App;

function markBootReady() {
  const bootWindow = window as Window & { __airAlertBootReady?: boolean };
  bootWindow.__airAlertBootReady = true;
  document.getElementById('boot-fallback')?.remove();
}

function BootReady({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    markBootReady();
  }, []);

  return children;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: '' };

  static getDerivedStateFromError(error: Error) {
    return { failed: true, message: error?.message || 'Unknown runtime error' };
  }

  componentDidCatch(error: Error) {
    markBootReady();
    console.error('Air Alert Stat failed to render', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--page, #15191d)',
          color: 'var(--text, #edf0f2)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Не вдалося відкрити сторінку</h1>
          <p style={{ margin: '0 0 18px', color: 'var(--muted, #a9b2bb)' }}>
            Інтерфейс завершив роботу з помилкою. Дані в API можуть залишатися доступними.
          </p>
          {this.state.message && (
            <details style={{ margin: '0 0 18px', textAlign: 'left' }}>
              <summary>Технічна причина</summary>
              <code style={{ display: 'block', marginTop: 8, overflowWrap: 'anywhere' }}>
                {this.state.message}
              </code>
            </details>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: 40,
              padding: '8px 14px',
              border: '1px solid var(--line-strong, #59636e)',
              borderRadius: 4,
              background: 'var(--panel, #1c2126)',
              color: 'inherit',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            Оновити сторінку
          </button>
        </div>
      </main>
    );
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Application root element is missing');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BootReady>
        <RootPage />
      </BootReady>
    </RootErrorBoundary>
  </React.StrictMode>,
);
