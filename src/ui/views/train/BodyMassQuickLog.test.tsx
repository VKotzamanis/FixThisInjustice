// src/ui/views/train/BodyMassQuickLog.test.tsx
//
// The in-session body-mass entry's copy contract (P8 close-out C).
//
// This is the one Train component copy.limelight.ts names NO row for. That is the table's rule
// 4 again: `button.logBodyMass` fronts a measurement that feeds the > 2 % dehydration
// comparison, and `advice.fluidLoss` is the flag that comparison raises, so both stand in the
// clinical sentence under every skin. The limelight suite therefore asserts the fall-through by
// key rather than pretending to an override, and a row added to the table later fails here.
//
// `quantity` arrives as a prop, already resolved by TrainView from the same table, so the field
// name and the words around it cannot come from two different skins.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORMAT, SKIN_COPY, copy, copyFor } from '../../../content/copy';
import { DEHYDRATION_LOSS_FRACTION } from '../../../domain/training/hydration';
import type { SkinId } from '../../../domain/types';
import { useAppStore } from '../../../store';
import { FUN_PROFILE_ID, makeAppState, makeProfile, makeUiPrefs } from '../../../test/funFixtures';
import { BodyMassQuickLog } from './BodyMassQuickLog';

const TODAY = '2026-03-02';
/** [ms] epoch UTC. 12:00 on 2026-03-02 in Europe/Athens, the fixture profile's zone. */
const NOW = Date.UTC(2026, 2, 2, 10, 0, 0);
const PERCENT = 100; // [%] per unit fraction

/** [kg] The reference this session started from, and a post-session mass 3 % below it. */
const PRE_KG = 100;
const POST_KG = 97;

function renderLog(skin: SkinId): void {
  useAppStore.setState(makeAppState({ ui: makeUiPrefs({ skin }), bodyMass: { [FUN_PROFILE_ID]: [] } }));
  render(
    <BodyMassQuickLog
      profile={makeProfile()}
      date={TODAY}
      preSessionMassKg={PRE_KG} // [kg]
      id="body-mass-test"
      quantity={copyFor(skin, 'quantity.bodyMass')}
    />,
  );
}

/** Enters a mass in the display unit and submits. */
function submitMass(skin: SkinId, kg: number): void {
  const field = screen.getByLabelText(`${copyFor(skin, 'quantity.bodyMass')} (kg)`);
  fireEvent.change(field, { target: { value: String(kg) } });
  fireEvent.click(screen.getByRole('button', { name: copyFor(skin, 'button.logBodyMass') }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BodyMassQuickLog: the clinical words', () => {
  it('flags a loss past the threshold in the default words, with its arithmetic behind why?', () => {
    renderLog('clinical');
    submitMass('clinical', POST_KG);

    expect(screen.getByText(copy('advice.fluidLoss'))).toBeInTheDocument();
    expect(screen.getByText(copy('disclosure.why'))).toBeInTheDocument();
    // Sign convention: the fraction is POSITIVE for a loss, so 100 -> 97 kg is 3.0 %.
    expect(
      screen.getByText(FORMAT.fluidLossWhy('3.0', DEHYDRATION_LOSS_FRACTION * PERCENT)),
    ).toBeInTheDocument();
  });
});

describe('BodyMassQuickLog: the limelight voice', () => {
  it("keeps the control and the flag in the clinical words, which is the table's own rule", () => {
    // Asserted by key on both sides: the table names no row for either, so `copyFor` returns
    // the default. A row added later changes these two expectations and this test fails.
    expect(copyFor('limelight', 'button.logBodyMass')).toBe(copy('button.logBodyMass'));
    expect(copyFor('limelight', 'advice.fluidLoss')).toBe(copy('advice.fluidLoss'));

    renderLog('limelight');
    submitMass('limelight', POST_KG);

    expect(
      screen.getByRole('button', { name: copyFor('limelight', 'button.logBodyMass') }),
    ).toBeInTheDocument();
    expect(screen.getByText(copyFor('limelight', 'advice.fluidLoss'))).toBeInTheDocument();
  });

  it('reads the disclosure body through the overlay, which has no word for it either', () => {
    /*
     * P8 close-out D: `FORMAT.fluidLossWhy` reads `why.fluidLoss` since close-out B, and this
     * component now hands it `useCopyOverrides()`. No table carries that key, and round three
     * section 3.3 is why: the title may be camp, the body may not, and every word left in this
     * one is a defined quantity or the ACSM 2007 citation.
     */
    renderLog('limelight');
    submitMass('limelight', POST_KG);

    const threshold = DEHYDRATION_LOSS_FRACTION * PERCENT; // [%]
    expect(
      screen.getByText(FORMAT.fluidLossWhy('3.0', threshold, SKIN_COPY.limelight)),
    ).toBeInTheDocument();
    expect(screen.getByText(FORMAT.fluidLossWhy('3.0', threshold))).toBeInTheDocument();
  });

  it('records the entry the store was handed, whatever the skin', () => {
    renderLog('limelight');
    submitMass('limelight', POST_KG);

    const entries = useAppStore.getState().bodyMass[FUN_PROFILE_ID] ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.massKg).toBe(POST_KG); // [kg]
  });
});
