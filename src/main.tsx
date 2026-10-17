import React, { StrictMode, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('DiskSentinel Pro Runtime Crash Caught:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#090d16',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{
            maxWidth: '560px',
            width: '100%',
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '12px',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444', marginBottom: '12px' }}>
              DiskSentinel Pro 복구 모드
            </h2>
            <p style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '16px', lineHeight: '1.5' }}>
              애플리케이션 렌더링 중 오류가 감지되었습니다. 아래 버튼을 눌러 상태를 재설정하고 다시 로드할 수 있습니다.
            </p>
            <div style={{
              backgroundColor: '#030712',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #1f2937',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#fca5a5',
              overflowX: 'auto',
              marginBottom: '20px'
            }}>
              {this.state.error?.message || '알 수 없는 렌더링 오류가 발생했습니다.'}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 18px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                새로고침
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '10px 18px',
                  backgroundColor: '#374151',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                설정 초기화 후 재시작
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function mountApp() {
  let container = document.getElementById('root');
  if (!container) {
    if (document.body) {
      container = document.createElement('div');
      container.id = 'root';
      document.body.appendChild(container);
    } else {
      document.addEventListener('DOMContentLoaded', mountApp);
      return;
    }
  }

  try {
    const root = createRoot(container);
    root.render(
      <StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </StrictMode>,
    );
  } catch (err) {
    console.error('DiskSentinel Pro initialization error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp);
} else {
  mountApp();
}
