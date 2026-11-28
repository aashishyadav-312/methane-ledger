import { Component, type ReactNode } from 'react';
import { Button } from '../ui';

interface LoadErrorProps {
  /** The route path. A new route clears the error, so the next page gets its own try. */
  resetKey: string;
  children: ReactNode;
}

interface LoadErrorState {
  key: string;
  failed: boolean;
}

/**
 * Catches a page whose code failed to load (a lazy chunk that 404s after a new deploy, or a dropped connection), so
 * the header stays and the reader gets a way out instead of a blank screen.
 */
export class LoadError extends Component<LoadErrorProps, LoadErrorState> {
  state: LoadErrorState = { key: this.props.resetKey, failed: false };

  static getDerivedStateFromProps(props: LoadErrorProps, state: LoadErrorState): Partial<LoadErrorState> | null {
    return props.resetKey === state.key ? null : { key: props.resetKey, failed: false };
  }

  static getDerivedStateFromError(): Partial<LoadErrorState> {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page-width not-found">
        <h1 className="t-h2">This page did not load</h1>
        <p className="t-lede">The connection may have dropped, or the site was updated. Reloading usually fixes it.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
      </div>
    );
  }
}
