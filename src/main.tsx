import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/common/ErrorBoundary';

import { useTabStore } from './stores/tabStore';
import { useQuickCompareStore } from './stores/quickCompareStore';

if (typeof window !== 'undefined') {
  (window as any).__TAB_STORE__ = useTabStore;
  (window as any).__QUICK_COMPARE_STORE__ = useQuickCompareStore;
  window.addEventListener('error', (event) => {
    console.error('[AeroDiff Global Error]:', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[AeroDiff Global Unhandled Rejection]:', event.reason);
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="AeroDiff encountered an unexpected error">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

