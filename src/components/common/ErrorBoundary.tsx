import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AeroDiff ErrorBoundary caught an error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    try {
      this.setState({ hasError: false, error: null, errorInfo: null });
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleCopy = async () => {
    const { error, errorInfo } = this.state;
    const details = [
      `AeroDiff Error Report:`,
      `Message: ${error?.message || 'Unknown error'}`,
      `Stack: ${error?.stack || 'No stack'}`,
      `Component Stack: ${errorInfo?.componentStack || 'No component stack'}`,
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n\n');

    try {
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      console.warn('Failed to copy to clipboard');
    }
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      const { fallbackTitle = 'Something went wrong in AeroDiff' } = this.props;
      const { error, copied, showDetails } = this.state;

      return (
        <div className="flex h-full w-full min-h-[300px] flex-col items-center justify-center bg-[#09090b] p-6 text-neutral-200 select-none">
          <div className="max-w-md w-full rounded-xl border border-rose-500/30 bg-[#121215] p-6 shadow-2xl shadow-black/80">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">{fallbackTitle}</h3>
                <p className="text-xs text-neutral-400">
                  Your files on disk remain safe. You can dismiss or reload this view.
                </p>
              </div>
            </div>

            {/* Error Message */}
            <div className="mt-4 rounded-md border border-neutral-800 bg-[#09090b] p-3 text-xs font-mono text-rose-300 break-words max-h-32 overflow-y-auto">
              {error?.message || 'Unknown runtime error'}
            </div>

            {/* Expandable Technical Details */}
            <div className="mt-3">
              <button
                type="button"
                onClick={this.toggleDetails}
                className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                {showDetails ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span>Technical details & stack</span>
              </button>

              {showDetails && (
                <pre className="mt-2 max-h-40 overflow-auto rounded border border-neutral-800 bg-black/60 p-2 font-mono text-[10px] text-neutral-400 select-text">
                  {error?.stack}
                </pre>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={this.handleCopy}
                className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700 transition-colors cursor-pointer"
                title="Copy error details to clipboard"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copied ? 'Copied!' : 'Copy Error'}</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700 transition-colors cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Dismiss</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center gap-1.5 rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-emerald-400 transition-colors cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>Reload App</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
