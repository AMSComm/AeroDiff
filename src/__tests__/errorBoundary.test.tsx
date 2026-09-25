import { describe, it, expect } from 'vitest';
import React from 'react';
import { ErrorBoundary } from '../components/common/ErrorBoundary';

describe('AeroDiff ErrorBoundary Component', () => {
  it('correctly updates state via getDerivedStateFromError', () => {
    const error = new Error('Test crash in AeroDiff');
    const state = ErrorBoundary.getDerivedStateFromError(error);
    expect(state.hasError).toBe(true);
    expect(state.error).toBe(error);
  });

  it('initializes with clean initial state', () => {
    const boundary = new ErrorBoundary({ children: 'Child' });
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBeNull();
    expect(boundary.state.errorInfo).toBeNull();
    expect(boundary.state.copied).toBe(false);
    expect(boundary.state.showDetails).toBe(false);
  });

  it('renders children when hasError is false', () => {
    const child = <div id="child">Hello AeroDiff</div>;
    const boundary = new ErrorBoundary({ children: child });
    expect(boundary.state.hasError).toBe(false);
    const rendered = boundary.render();
    expect(rendered).toBe(child);
  });

  it('renders fallback UI when hasError is true', () => {
    const child = <div>Hidden Child</div>;
    const boundary = new ErrorBoundary({
      children: child,
      fallbackTitle: 'Critical Diff Panic',
    });
    boundary.state = {
      hasError: true,
      error: new Error('Render failed'),
      errorInfo: { componentStack: 'at Component' },
      copied: false,
      showDetails: false,
    };

    const rendered = boundary.render() as React.ReactElement<{ className?: string }>;
    expect(rendered).not.toBe(child);
    expect(rendered).toBeDefined();
    expect(rendered.type).toBe('div');
  });
});
