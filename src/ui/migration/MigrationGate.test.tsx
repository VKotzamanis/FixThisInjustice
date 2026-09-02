import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import raw from '../../domain/migrations/fixtures/v2-sample.json';
import { copy } from '../../content/copy';
import { makeBlankState } from '../../test/migrationFactories';
import { cancelPendingSave, useAppStore } from '../../store';
import { LEGACY_V2_KEY } from '../../store/persistence';
import { installFakeStorage } from '../../store/testStorage';
import { MigrationGate } from './MigrationGate';

const LEGACY_JSON = JSON.stringify(raw);

/** Installs storage with or without a legacy key, and a hydrated store holding a blank document. */
function seed(legacy: string | null): Map<string, string> {
  const data = installFakeStorage(legacy === null ? {} : { [LEGACY_V2_KEY]: legacy });
  useAppStore.getState().hydrate();
  useAppStore.getState().replaceState(makeBlankState());
  return data;
}

function heading(name: string): HTMLElement | null {
  return screen.queryByRole('heading', { name });
}

afterEach(() => {
  cancelPendingSave();
  vi.restoreAllMocks();
});

describe('MigrationGate', () => {
  it('renders nothing when there is no legacy document', () => {
    seed(null);
    const { container } = render(<MigrationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the import when a legacy document exists and nothing has been decided', () => {
    seed(LEGACY_JSON);
    render(<MigrationGate />);
    expect(heading(copy('hero.legacyImport'))).toBeTruthy();
  });

  it('renders nothing once the import has been done', () => {
    seed(LEGACY_JSON);
    act(() => {
      useAppStore.getState().setUi({ legacyMigration: 'done' });
    });
    const { container } = render(<MigrationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once the offer has been dismissed', () => {
    seed(LEGACY_JSON);
    act(() => {
      useAppStore.getState().setUi({ legacyMigration: 'dismissed' });
    });
    const { container } = render(<MigrationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before a profile exists', () => {
    seed(LEGACY_JSON);
    act(() => {
      useAppStore.setState({ activeProfileId: null });
    });
    const { container } = render(<MigrationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before a plan exists', () => {
    seed(LEGACY_JSON);
    act(() => {
      useAppStore.setState({ cursors: {} });
    });
    const { container } = render(<MigrationGate />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the wizard on screen after the import writes the done decision', () => {
    seed(LEGACY_JSON);
    render(<MigrationGate />);
    fireEvent.click(screen.getByLabelText(copy('label.legacyUnitKg')));
    fireEvent.click(screen.getByRole('button', { name: copy('button.legacyPreview') }));
    fireEvent.change(screen.getByLabelText(copy('label.legacyConfirm')), {
      target: { value: 'IMPORT' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy('button.legacyApply') }));
    // The decision is already recorded, and the delete offer still has to be made.
    expect(useAppStore.getState().ui.legacyMigration).toBe('done');
    expect(heading(copy('hero.legacyDone'))).toBeTruthy();
  });

  it('stops rendering once the wizard reports it has finished', () => {
    seed(LEGACY_JSON);
    const { container } = render(<MigrationGate />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.legacyDismiss') }));
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the import again when the decision is put back to pending', () => {
    seed(LEGACY_JSON);
    const { container } = render(<MigrationGate />);
    fireEvent.click(screen.getByRole('button', { name: copy('button.legacyDismiss') }));
    expect(container).toBeEmptyDOMElement();
    // The Settings entry point: it writes nothing but the decision.
    act(() => {
      useAppStore.getState().setUi({ legacyMigration: 'pending' });
    });
    expect(heading(copy('hero.legacyImport'))).toBeTruthy();
  });
});
