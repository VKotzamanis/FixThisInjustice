import { Component, createRef } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { cancelPendingSave, useAppStore } from '../store';
import { clearStorage, readRaw } from '../store/persistence';
import { downloadText } from './download';

/**
 * Security review constraint 6: the boundary sits *above* the store, so a
 * store-level throw still renders a UI that can export and clear.
 *
 * It therefore *reads* storage directly through persistence.ts rather than
 * through the store. When the store is what threw, a validated read is exactly
 * what is unavailable, and the user's data still has to be recoverable.
 *
 * Clearing is the other way round. Removing the key is not enough on its own —
 * a debounced write already in flight would put the document straight back —
 * and only the store knows about that write, so the clear goes through
 * wipeAll() and falls back to cancelPendingSave() + clearStorage() when the
 * store cannot be reached.
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

  /** The recovery container, focused when it replaces the application tree. */
  private readonly recoveryRef = createRef<HTMLDivElement>();

  public static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  /**
   * The common case: a child throws during the boundary's own mount, so React
   * finishes that mount with the fallback tree already in place and there is no
   * update to hook. componentDidUpdate never fires for it.
   */
  public override componentDidMount(): void {
    if (this.state.error !== null) this.recoveryRef.current?.focus();
  }

  /**
   * Moves focus onto the recovery UI when it appears after the tree was already
   * mounted, and again when it is replaced by the cleared confirmation.
   *
   * The tree the user was reading has just been unmounted, so focus is on a
   * detached node and a keyboard or screen-reader user is left with nothing
   * announced and nothing to tab from. Only the two transitions are handled: a
   * focus call on every render would steal the caret out of the confirmation
   * field on each keystroke. A class rather than an effect because
   * getDerivedStateFromError has no hook equivalent.
   */
  public override componentDidUpdate(_prevProps: Props, prevState: State): void {
    const enteredRecovery = this.state.error !== null && prevState.error === null;
    const enteredCleared = this.state.cleared && !prevState.cleared;
    if (enteredRecovery || enteredCleared) this.recoveryRef.current?.focus();
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

  /**
   * Master plan §3: the clear path must cancel any pending debounced write.
   *
   * wipeAll() does both — it removes the key and drops the queued write — so it
   * is the path taken whenever the store is usable. clearStorage() on its own
   * lets a write already sitting in the 250 ms window land afterwards and
   * re-create the document the user just asked to be rid of.
   *
   * The fallback covers the case this boundary exists for: the store is what
   * threw, so its actions may throw again. cancelPendingSave() is a module
   * function that touches no store state, which makes the pair reachable even
   * then.
   */
  private readonly handleClear = (): void => {
    try {
      useAppStore.getState().wipeAll();
    } catch {
      cancelPendingSave();
      clearStorage();
    }
    this.setState({ cleared: true });
  };

  public override render(): ReactNode {
    const { error, exported, confirmation, cleared } = this.state;
    if (error === null) {
      return this.props.children;
    }

    if (cleared) {
      return (
        <div className="recovery" role="alert" tabIndex={-1} ref={this.recoveryRef}>
          <h1>Stored data cleared</h1>
          <p>Reload the page to start from an empty document.</p>
        </div>
      );
    }

    return (
      <div className="recovery" role="alert" tabIndex={-1} ref={this.recoveryRef}>
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
