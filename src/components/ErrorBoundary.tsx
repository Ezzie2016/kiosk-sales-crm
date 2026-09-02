import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Last-resort boundary so a render error shows the message instead of a blank
 * screen (spec §29 — do not hide errors). Route-level data errors are handled by
 * each page's own `error` state; this catches the unexpected.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in the CRM UI:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="content" style={{ maxWidth: 560, marginTop: '10vh' }}>
        <div className="card">
          <h2>Something went wrong</h2>
          <p className="muted">The page hit an unexpected error. Reloading usually clears it.</p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.82rem',
              background: 'var(--color-background)',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
            }}
          >
            {this.state.error.message}
          </pre>
          <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
