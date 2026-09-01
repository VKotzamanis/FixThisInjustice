import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { clearStorage, readRaw } from '../store/persistence';
import { downloadText } from './download';

/**
 * Security review constraint 6: the boundary sits *above* the store, so a
 * store-level throw still renders a UI that can export and clear.
 *
 * It therefore reads storage directly through persistence.ts rather than through
 * the store. When the store is what threw, a validated read is exactly what is
 * unavailable, and the user's data still has to be recoverable.
 *
 * Why a class: React has no hook equivalent of getDerivedStateFromError, so an
 * error boundary must be a class. It is the only class in the codebase.
 */
interface Props {
  children: ReactNode;
  /** Test seam. Production passes nothing and the real download runs. */
  onDownload?: (filename: string, text: string) => void;
}

interface State {
  error: Error | null;
  exported: boolean;
  confirmation: string;
  cleared: boolean;
}

const CONFIRMATION_WORD = 'DELETE';

export class RootErrorBoundary extends Component<Props, State> {
  public override state: State = {
    error: null,
    exported: false,
    confirmation: '',
    cleared: false,
  };

  public static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  public override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Development only: import.meta.env.DEV is statically replaced, so this is
    // tree-shaken from the production bundle (security constraint 28).
    if (import.meta.env.DEV) {
      console.error('RootErrorBoundary caught', error, info.componentStack);
    }
  }

  private readonly handleExport = (): void => {
    const raw = readRaw();
    const text = raw ?? '{}';
    const download = this.props.onDownload ?? downloadText;
    download('fixthisinjustice-recovery.json', text);
    this.setState({ exported: true });
  };

  private readonly handleClear = (): void => {
    clearStorage();
    this.setState({ cleared: true });
  };

  public override render(): ReactNode {
    const { error, exported, confirmation, cleared } = this.state;
    if (error === null) {
      return this.props.children;
    }

    if (cleared) {
      return (
        <div className="recovery" role="alert">
          <h1>Stored data cleared</h1>
          <p>Reload the page to start from an empty document.</p>
        </div>
      );
    }

    return (
      <div className="recovery" role="alert">
        <h1>The application could not start</h1>
        <p>
          Your data has not been changed. Export it first, then decide whether to clear the stored
          document.
        </p>
        <pre>{error.message}</pre>

        <button type="button" onClick={this.handleExport}>
          Export stored data
        </button>
        {exported ? <p>Export downloaded.</p> : null}

        <label htmlFor="recovery-confirm">
          To clear the stored document, export it first and type {CONFIRMATION_WORD} below.
        </label>
        <input
          id="recovery-confirm"
          type="text"
          autoComplete="off"
          value={confirmation}
          onChange={(e) => {
            this.setState({ confirmation: e.target.value });
          }}
        />
        <button
          type="button"
          className="destructive"
          disabled={!exported || confirmation !== CONFIRMATION_WORD}
          onClick={this.handleClear}
        >
          Clear stored data
        </button>
      </div>
    );
  }
}
