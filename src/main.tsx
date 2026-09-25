import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/common/ErrorBoundary';

if (typeof window !== 'undefined') {
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

