// src/ui/settings/ActivitySlider.tsx
//
// Audit G04: Settings edits the same nine FAO/WHO/UNU 2004 stops setup offers, and writes the PAL
// and its band in one patch (src/domain/activity.ts withPal). The readout names the band and the
// stop's own example, as the wizard does.
import type { JSX } from 'react';
import type { CopyKey } from '../../content/copy';
import { ACTIVITY_STOP_EXAMPLES } from '../../content/setupSliderExamples';
import { useCopy } from '../../content/useCopy';
import { bandOfPal, palOf, withPal } from '../../domain/activity';
import { ACTIVITY_STOPS } from '../../domain/nutrition';
import type { ActivityLevel, Profile } from '../../domain/types';
import { useAppStore } from '../../store';

/** The band's name, read per render through useCopy (moved here from SettingsView's select). */
export const BAND_LABEL_KEY: Record<ActivityLevel, CopyKey> = {
  sedentary: 'option.activitySedentary',
  moderate: 'option.activityModerate',
  vigorous: 'option.activityVigorous',
};

/** The stop nearest a PAL: exact for every stored stop, nearest for a hand-edited value. */
function stopIndexOf(pal: number): number {
  let best = 0;
  ACTIVITY_STOPS.forEach((s, i) => {
    const current = ACTIVITY_STOPS[best];
    if (current !== undefined && Math.abs(s.pal - pal) < Math.abs(current.pal - pal)) best = i;
  });
  return best;
}

export function ActivitySlider(props: { profile: Profile }): JSX.Element {
  const { profile } = props;
  const t = useCopy();
  const pal = palOf(profile); // [PAL]
  const index = stopIndexOf(pal);

  return (
    <div className="view-field">
      <label htmlFor="settings-activity">{t('label.activity')}</label>
      <input
        id="settings-activity"
        type="range"
        min={0}
        max={ACTIVITY_STOPS.length - 1}
        step={1}
        value={index}
        onChange={(e) => {
          const stop = ACTIVITY_STOPS[Number(e.target.value)];
          if (stop === undefined) return;
          useAppStore.getState().updateProfile(profile.id, withPal(stop.pal));
        }}
      />
      <p className="view-note" aria-live="polite">
        {t(BAND_LABEL_KEY[bandOfPal(pal)])} {ACTIVITY_STOP_EXAMPLES[ACTIVITY_STOPS[index]?.pal ?? pal] ?? ''}
      </p>
    </div>
  );
}
