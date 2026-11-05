import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { copyFor } from '../../content/copy';
import { ACTIVITY_STOP_EXAMPLES } from '../../content/setupSliderExamples';
import { ACTIVITY_STOPS } from '../../domain/nutrition';
import { defaultState } from '../../domain/schema';
import { useAppStore } from '../../store';
import { installFakeStorage } from '../../store/testStorage';
import { makeProfile } from '../../test/fixtures';
import { ActivitySlider } from './ActivitySlider';

const P = 'profile-1';

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    ui: { ...defaultState().ui, skin: 'limelight' },
    activeProfileId: P,
    profiles: { [P]: makeProfile({ activity: 'sedentary', activityPal: 1.85 }) },
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
});

describe('ActivitySlider (audit G04)', () => {
  it('shows the stored PAL, not the stale band, and writes PAL and band together', () => {
    const profile = useAppStore.getState().profiles[P];
    if (profile === undefined) throw new Error('no profile');
    render(<ActivitySlider profile={profile} />);
    const slider = screen.getByLabelText(copyFor('limelight', 'label.activity'));
    expect(slider).toHaveValue(String(ACTIVITY_STOPS.findIndex((s) => s.pal === 1.85)));
    expect(screen.getByText(ACTIVITY_STOP_EXAMPLES[1.85] ?? '', { exact: false })).toBeTruthy();
    fireEvent.change(slider, { target: { value: '0' } });
    expect(useAppStore.getState().profiles[P]).toMatchObject({ activityPal: 1.4, activity: 'sedentary' });
    fireEvent.change(slider, { target: { value: String(ACTIVITY_STOPS.length - 1) } });
    expect(useAppStore.getState().profiles[P]).toMatchObject({ activityPal: 2.4, activity: 'vigorous' });
  });
});
