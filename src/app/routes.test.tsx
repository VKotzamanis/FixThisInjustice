import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { copyFor } from '../content/copy';
import { lazyRoute } from './lazyRoute';

/** Every non-test source file under src, as text, keyed by its path relative to src/. */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([path, text]) => [path.startsWith('./') ? `app/${path.slice(2)}` : path.replace(/^\.\.\//, ''), text]),
);

/**
 * Each split screen (path under src/, no extension) and the only files that may import it
 * STATICALLY. Any other static import pulls the screen back into the main chunk (audit E09).
 * ProgrammeSettings and AvailabilitySettings read constants from the wizard; both are inside the
 * Settings chunk.
 */
const SPLIT: Readonly<Record<string, readonly string[]>> = {
  'ui/setup/SetupWizard': ['ui/settings/ProgrammeSettings.tsx', 'ui/settings/AvailabilitySettings.tsx'],
  'ui/intro/IntroSequence': [],
  'ui/views/AtlasView': [],
  'ui/views/LogView': [],
  'ui/views/SettingsView': [],
  'ui/settings/DataSection': ['ui/views/SettingsView.tsx'],
  'ui/views/ExportView': ['ui/settings/DataSection.tsx'],
};

/** Static, value-level import specifiers of one file (type-only imports are erased). */
function staticImports(text: string): string[] {
  return [...text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)';/gms)].map((m) => m[1] ?? '');
}

/** `ui/setup/SetupWizard.tsx` importing `./setupArt` -> `ui/setup/setupArt`. */
function resolve(importer: string, spec: string): string {
  return new URL(spec, `file:///${importer}`).pathname.slice(1).replace(/\.(tsx?|js)$/, '');
}

describe('split screens stay out of the main chunk (audit E09)', () => {
  it('reads the source tree', () => {
    expect(Object.keys(SOURCES)).toContain('app/App.tsx');
    expect(Object.keys(SOURCES)).toContain('app/routes.tsx');
  });

  it('imports each split screen statically only from its allowed files', () => {
    const offenders: string[] = [];
    for (const [importer, text] of Object.entries(SOURCES)) {
      for (const spec of staticImports(text)) {
        if (!spec.startsWith('.')) continue;
        const target = resolve(importer, spec);
        const allowed = SPLIT[target];
        if (allowed !== undefined && !allowed.includes(importer)) offenders.push(`${importer} -> ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has one confirmation word (rule 2)', () => {
    const declaring = Object.entries(SOURCES)
      .filter(([, text]) => /const CONFIRM_WORD\b/.test(text))
      .map(([path]) => path);
    expect(declaring).toEqual(['ui/components/confirmWord.ts']);
  });
});

describe('lazyRoute', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a busy placeholder, then the screen; a later mount is drawn at once', async () => {
    const route = lazyRoute('demo', () => Promise.resolve(() => <p>loaded screen</p>));
    const first = render(<route.Component />);
    expect(first.container.querySelector('[data-route="demo"][aria-busy="true"]')).not.toBeNull();
    expect(await screen.findByText('loaded screen')).toBeInTheDocument();
    first.unmount();
    render(<route.Component />);
    expect(screen.getByText('loaded screen')).toBeInTheDocument();
  });

  it('renders synchronously after preload()', async () => {
    const route = lazyRoute('pre', () => Promise.resolve(() => <p>preloaded</p>));
    await route.preload();
    render(<route.Component />);
    expect(screen.getByText('preloaded')).toBeInTheDocument();
  });

  it('keeps a failed load local, and Try Again loads it again', async () => {
    const load = vi
      .fn<() => Promise<() => ReactElement>>()
      .mockRejectedValueOnce(new Error('chunk 404'))
      .mockResolvedValueOnce(() => <p>second try</p>);
    const route = lazyRoute('flaky', load);
    render(<route.Component />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(copyFor('limelight', 'advice.screenLoadFailed'));
    expect(screen.getByRole('button', { name: copyFor('limelight', 'button.reload') })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.tryAgain') }));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText('second try')).toBeInTheDocument();
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('passes props through', async () => {
    const route = lazyRoute('props', () => Promise.resolve((props: { label: string }) => <p>{props.label}</p>));
    await route.preload();
    render(<route.Component label="hello" />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
