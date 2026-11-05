// src/ui/setup/SetupErrorBoundary.tsx
//
// Audit A12: a render throw anywhere in the setup wizard used to reach the ROOT boundary, whose
// only way out is Clear (every logged session with it) and which has no reload on an installed
// iOS app. The persisted draft survived, so a throw caused by the draft repeated on every launch.
// This boundary sits around the wizard alone: Restart Setup clears the draft only and remounts
// the wizard from scratch; Reload is there for a throw that was not the draft's fault.
import { Component, Fragment, type ErrorInfo, type JSX, type ReactNode } from 'react';
import { useCopy } from '../../content/useCopy';
import { useAppStore } from '../../store';

interface Props {
  children: ReactNode;
  /** Injected by tests; the app reloads the page. */
  onReload?: () => void;
}

interface State {
  failed: boolean;
  /** Bumped on Restart Setup, so the wizard remounts and re-reads the (now empty) draft. */
  attempt: number;
}

export class SetupErrorBoundary extends Component<Props, State> {
  public override state: State = { failed: false, attempt: 0 };

  public static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  public override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Development only, as in RootErrorBoundary: tree-shaken from the production bundle.
    if (import.meta.env.DEV) {
      console.error('SetupErrorBoundary caught', error, info.componentStack);
    }
  }

  private readonly restart = (): void => {
    useAppStore.getState().clearSetupDraft();
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  private readonly reload = (): void => {
    if (this.props.onReload !== undefined) {
      this.props.onReload();
      return;
    }
    window.location.reload();
  };

  public override render(): ReactNode {
    if (!this.state.failed) {
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>;
    }
    return <SetupFailed onRestart={this.restart} onReload={this.reload} />;
  }
}

function SetupFailed(props: { onRestart: () => void; onReload: () => void }): JSX.Element {
  const t = useCopy();
  return (
    <div className="wiz" role="alert">
      <h2>{t('hero.setupFailed')}</h2>
      <p className="wiz-note">{t('advice.setupRestartClearsDraft')}</p>
      <div className="wiz-nav">
        <button type="button" onClick={props.onRestart}>
          {t('button.restartSetup')}
        </button>
        <button type="button" onClick={props.onReload}>
          {t('button.reload')}
        </button>
      </div>
    </div>
  );
}
