/**
 * Design Mode, end to end in jsdom.
 *
 * THE ASSERTION THAT MATTERS MOST is "the store is untouched". Design Mode ships, so the
 * argument for its safety has to be executable rather than a paragraph: opening, editing,
 * previewing another skin, exporting, resetting and closing must leave `useAppStore.getState()`
 * IDENTICAL - the same object reference, which is precisely what any Zustand `set` would
 * replace. Reference equality is the strongest form of "byte-identical apart from nothing at
 * all" available here, and it is stronger than a deep compare: a set that wrote the same values
 * back would still fail it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { defaultState, useAppStore } from '../store';
import { installFakeStorage } from '../store/testStorage';
import { DesignGate } from './DesignGate';
import { DESIGN_STORAGE_KEY } from './designStorage';
import { formatRatio } from './colour';
import { readPair } from './contrastPairs';
import { shippedValues } from './tokenSheet';

/** Puts the query parameter on the location the gate reads, without navigating. */
function setSearch(search: string): void {
  window.history.replaceState({}, '', `/${search}`);
}

beforeEach(() => {
  installFakeStorage();
  /*
   * The app's own default skin is LIMELIGHT (src/domain/schema.ts defaultState). These tests
   * pin it to clinical instead, because the clinical block is the bare `:root` and is the one
   * set the other two inherit from: an assertion written against it also exercises the
   * fallback path in resolveValue. Tests that care about a specific skin set it themselves.
   */
  useAppStore.setState(defaultState());
  useAppStore.setState((state) => ({ ui: { ...state.ui, skin: 'clinical' } }));
  // Left over from the previous test's unmount, which restores the app's own skin by design.
  delete document.documentElement.dataset.skin;
  document.documentElement.removeAttribute('style');
  setSearch('');
});

afterEach(() => {
  setSearch('');
  vi.restoreAllMocks();
});

describe('the gate', () => {
  it('renders nothing, and reads no storage at all, without the parameter', () => {
    const store = installFakeStorage();
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    setSearch('');

    const { container } = render(<DesignGate />);

    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('dm-panel')).toBeNull();
    expect(screen.queryByTestId('dm-launcher')).toBeNull();
    // No listener, no attribute write, no storage read: the mode does not exist in this session.
    expect(getItem).not.toHaveBeenCalledWith(DESIGN_STORAGE_KEY);
    expect(document.documentElement.dataset.skin).toBeUndefined();
    expect(store.has(DESIGN_STORAGE_KEY)).toBe(false);
  });

  it('is inert for every near miss, not only for the empty query', () => {
    for (const search of ['?design', '?design=0', '?design=true', '?designs=1']) {
      setSearch(search);
      const { container, unmount } = render(<DesignGate />);
      expect({ search, html: container.innerHTML }).toEqual({ search, html: '' });
      unmount();
    }
  });

  it('opens on ?design=1', () => {
    setSearch('?design=1');
    render(<DesignGate />);
    expect(screen.getByTestId('dm-panel')).toBeInTheDocument();
  });
});

describe('the panel never writes to the store or to a profile', () => {
  it('leaves useAppStore.getState() the identical object after a full session', () => {
    setSearch('?design=1');
    const before = useAppStore.getState();

    render(<DesignGate />);
    fireEvent.change(screen.getByLabelText('--bg'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByTestId('dm-skin-limelight'));
    fireEvent.change(screen.getByLabelText('--accent'), { target: { value: '#00ff00' } });
    fireEvent.click(screen.getByTestId('dm-export'));
    fireEvent.click(screen.getByTestId('dm-reset'));
    fireEvent.click(screen.getByTestId('dm-close'));

    expect(useAppStore.getState()).toBe(before);
    expect(useAppStore.getState().profiles).toBe(before.profiles);
    expect(useAppStore.getState().ui).toBe(before.ui);
  });

  it('writes only its own namespaced key, and never the document key', () => {
    setSearch('?design=1');
    const store = installFakeStorage();

    render(<DesignGate />);
    fireEvent.change(screen.getByLabelText('--bg'), { target: { value: '#123456' } });

    expect([...store.keys()]).toEqual([DESIGN_STORAGE_KEY]);
    const written: unknown = JSON.parse(store.get(DESIGN_STORAGE_KEY) ?? '{}');
    /*
     * `copy` is the Task 2 half of the same key, and `r10` and `notes` are the long-form half:
     * ONE namespace holds all four, and the three besides `tokens` are empty here because this
     * test edits a token and types nothing.
     *
     * The exhaustive shape is the assertion. A field added to the stored body without being added
     * here is a field nobody decided to store, and this key is the one thing Design Mode is
     * permitted to write.
     */
    expect(written).toEqual({
      version: 1,
      tokens: { clinical: { '--bg': '#123456' } },
      copy: {},
      r10: {},
      notes: [],
    });
  });
});

describe('the skin switcher', () => {
  it('re-renders in the other skin tokens by flipping the attribute the blocks key on', () => {
    setSearch('?design=1');
    render(<DesignGate />);

    expect(document.documentElement.dataset.skin).toBe('clinical');

    fireEvent.click(screen.getByTestId('dm-skin-limelight'));
    expect(document.documentElement.dataset.skin).toBe('limelight');
    // The limelight-only tokens are now offered, which the clinical block does not declare.
    expect(screen.getByLabelText('--lime')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('dm-skin-board'));
    expect(document.documentElement.dataset.skin).toBe('board');
    expect(screen.getByLabelText('--amber')).toBeInTheDocument();
    expect(screen.queryByLabelText('--lime')).toBeNull();
  });

  it('restores the app own skin when the panel unmounts', () => {
    setSearch('?design=1');
    useAppStore.setState((state) => ({ ui: { ...state.ui, skin: 'board' } }));

    const { unmount } = render(<DesignGate />);
    fireEvent.click(screen.getByTestId('dm-skin-limelight'));
    expect(document.documentElement.dataset.skin).toBe('limelight');

    unmount();
    expect(document.documentElement.dataset.skin).toBe('board');
  });
});

describe('editing a token', () => {
  it('sets the custom property on the document element immediately', () => {
    setSearch('?design=1');
    render(<DesignGate />);

    fireEvent.change(screen.getByLabelText('--bg'), { target: { value: 'rgba(1, 2, 3, 0.5)' } });

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('rgba(1, 2, 3, 0.5)');
  });

  it('drops the previous skin overrides when the preview changes, rather than stacking them', () => {
    setSearch('?design=1');
    render(<DesignGate />);

    fireEvent.change(screen.getByLabelText('--bg'), { target: { value: '#111111' } });
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#111111');

    fireEvent.click(screen.getByTestId('dm-skin-limelight'));
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');

    fireEvent.click(screen.getByTestId('dm-skin-clinical'));
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#111111');
  });

  it('offers a colour input beside the text input only where the value is a colour', () => {
    setSearch('?design=1');
    render(<DesignGate />);

    expect(screen.getByLabelText('--bg Swatch')).toBeInTheDocument();
    // A bare rgb triple and a font stack cannot be expressed by a colour control.
    expect(screen.queryByLabelText('--accent-rgb Swatch')).toBeNull();
    expect(screen.getByLabelText('--accent-rgb')).toBeInTheDocument();
    expect(screen.queryByLabelText('--sans Swatch')).toBeNull();
  });

  it('keeps the swatch on screen while a colour value is half typed', () => {
    setSearch('?design=1');
    render(<DesignGate />);

    fireEvent.change(screen.getByLabelText('--bg'), { target: { value: 'rgba(2' } });

    // The control must not vanish mid-keystroke: that reads as the tool breaking.
    expect(screen.getByLabelText('--bg Swatch')).toHaveValue('#000000');
  });

  it('restores the shipped values on Reset', () => {
    setSearch('?design=1');
    render(<DesignGate />);

    fireEvent.change(screen.getByLabelText('--bg'), { target: { value: '#111111' } });
    fireEvent.click(screen.getByTestId('dm-reset'));

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('');
    expect(screen.getByLabelText('--bg')).toHaveValue(shippedValues('clinical').get('--bg') ?? '');
  });
});

describe('the contrast readout', () => {
  it('shows the ratio the published table records for a known pair', () => {
    setSearch('?design=1');
    render(<DesignGate />);
    fireEvent.click(screen.getByTestId('dm-skin-limelight'));

    // Round three section 2.3: #000000 on #8ACE00 is 10.91:1. --text is var(--ink) and --bg is
    // var(--lime) in this skin, so this row is exactly that measurement, resolved live.
    const row = screen.getByTestId('dm-pair---text-on---bg');
    expect(row.textContent).toContain('10.91:1');
    expect(row.textContent).toContain('PASS against 4.5:1');
  });

  it('marks the pair the sheet records as a deliberate 1.41:1 as failing 3:1', () => {
    setSearch('?design=1');
    render(<DesignGate />);
    fireEvent.click(screen.getByTestId('dm-skin-limelight'));

    // Pink on lime. It is a FILL here and the sheet says so; the readout still reports the
    // number, and the pair's own note carries the decision. A tool that hid it would be useless.
    const row = screen.getByTestId('dm-pair---accent-on---bg');
    expect(row.textContent).toContain('1.41:1');
    expect(row.textContent).toContain('FAIL against 3:1');
  });

  it('follows an edit, which is the whole point of a live readout', () => {
    setSearch('?design=1');
    render(<DesignGate />);

    fireEvent.change(screen.getByLabelText('--text'), { target: { value: '#0b0c0d' } });

    const values = new Map(shippedValues('clinical'));
    values.set('--text', '#0b0c0d');
    const expected = readPair(
      { label: 'Body Text on Ground', fg: '--text', bg: '--bg', kind: 'text' },
      values,
      values,
    );
    expect(expected.ratio).not.toBeNull();
    const row = screen.getByTestId('dm-pair---text-on---bg');
    expect(row.textContent).toContain(formatRatio(expected.ratio ?? 0));
    expect(row.textContent).toContain('FAIL against 4.5:1');
  });
});

describe('export', () => {
  it('emits only the changed declarations, in the shape the applier accepts', () => {
    setSearch('?design=1');
    render(<DesignGate />);

    fireEvent.change(screen.getByLabelText('--bg'), { target: { value: '#111111' } });
    fireEvent.click(screen.getByTestId('dm-skin-board'));
    fireEvent.change(screen.getByLabelText('--amber'), { target: { value: '#ffaa00' } });
    fireEvent.click(screen.getByTestId('dm-export'));

    const text = screen.getByTestId<HTMLTextAreaElement>('dm-export-text').value;
    const patch: unknown = JSON.parse(text);
    expect(patch).toMatchObject({
      version: 1,
      tokens: { clinical: { '--bg': '#111111' }, board: { '--amber': '#ffaa00' } },
      copy: {},
      assets: [],
      notes: [],
    });
    // 121 declarations ship. Two were changed, and two is what the patch carries.
    const body = patch as { tokens: Record<string, Record<string, string>> };
    expect(Object.values(body.tokens).flatMap((map) => Object.keys(map)).length).toBe(2);
  });

  it('gives a phone a textarea it can select, rather than a download', () => {
    setSearch('?design=1');
    render(<DesignGate />);
    fireEvent.click(screen.getByTestId('dm-export'));

    const area = screen.getByTestId<HTMLTextAreaElement>('dm-export-text');
    expect(area.readOnly).toBe(true);
    const select = vi.spyOn(area, 'select');
    fireEvent.click(screen.getByTestId('dm-select-all'));
    expect(select).toHaveBeenCalled();
  });
});

describe('the panel can be got out of the way', () => {
  it('collapses to a launcher and reopens', () => {
    setSearch('?design=1');
    render(<DesignGate />);

    fireEvent.click(screen.getByTestId('dm-close'));
    expect(screen.queryByTestId('dm-panel')).toBeNull();

    fireEvent.click(screen.getByTestId('dm-launcher'));
    expect(screen.getByTestId('dm-panel')).toBeInTheDocument();
  });
});
