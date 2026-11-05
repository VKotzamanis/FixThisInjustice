import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FORMAT, copyFor } from '../../content/copy';
import { defaultState, useAppStore } from '../../store';
import { downloadText } from '../../app/download';
import { UnreadableRecords } from './UnreadableRecords';

vi.mock('../../app/download', () => ({ downloadText: vi.fn() }));

const STATUS = { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null };

beforeEach(() => {
  useAppStore.setState({ ...defaultState(), status: STATUS });
});

afterEach(() => {
  vi.mocked(downloadText).mockReset();
});

describe('UnreadableRecords (B01, B04, B10)', () => {
  it('renders nothing when every record was read', () => {
    const { container } = render(<UnreadableRecords />);
    expect(container.innerHTML).toBe('');
  });

  it('lists each quarantined record and repaired answer, and exports them as stored', () => {
    const raw = { id: 'bad', rpe: 7.3 };
    useAppStore.setState({
      status: {
        ...STATUS,
        quarantine: [{ store: 'sets', key: 'bad', index: null, reason: 'sets.bad.rpe: rpe is recorded in 0.5 steps', raw }],
        repairs: [{ store: 'profiles', key: 'p1', path: ['body', 'sex'], stored: 'x', readAs: 'nd' }],
      },
    });
    render(<UnreadableRecords />);
    expect(screen.getByRole('heading', { name: copyFor('limelight', 'hero.unreadableRecords') })).toBeInTheDocument();
    expect(screen.getByText('sets.bad.rpe: rpe is recorded in 0.5 steps')).toBeInTheDocument();
    expect(screen.getByText(FORMAT.repairedAnswer('profiles.p1.body.sex', '"x"', '"nd"'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.exportUnreadable') }));
    const [name, text] = vi.mocked(downloadText).mock.calls[0] ?? ['', ''];
    expect(name).toBe('fti-unreadable-records.json');
    expect(JSON.parse(text)).toEqual({
      quarantined: [{ store: 'sets', key: 'bad', index: null, reason: 'sets.bad.rpe: rpe is recorded in 0.5 steps', raw }],
      repairs: [{ store: 'profiles', key: 'p1', path: ['body', 'sex'], stored: 'x', readAs: 'nd' }],
    });
  });
});
