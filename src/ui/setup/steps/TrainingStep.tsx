// src/ui/setup/steps/TrainingStep.tsx
//
// Step 4: everyday activity (nine-stop PAL slider), gym comfort, equipment access, and the
// equipment questions each access level asks (walk to the gym, inventory, load steps).
// Validation comes from the field table (../model/fields). Moved verbatim out of SetupWizard.tsx.
import type { JSX } from 'react';
import { FORMAT, type CopyKey } from '../../../content/copy';
import { useCopy } from '../../../content/useCopy';
import {
  ACTIVITY_LEVEL_EXAMPLES,
  ACTIVITY_STOP_EXAMPLES,
  EQUIPMENT_ACCESS_EXAMPLES,
} from '../../../content/setupSliderExamples';
import { ACTIVITY_FACTOR, ACTIVITY_STOPS } from '../../../domain/nutrition';
import { showsHomeEquipment } from '../../../domain/plan/inventory';
import type {
  ActivityLevel,
  BodyweightEquipmentItem,
  EquipmentAccess,
  Experience,
  HomeEquipmentItem,
} from '../../../domain/types';
import { UnitInput, loadUnit } from '../../components/UnitInput';
import { UNIT } from '../fieldRules';
import { showsGymCommute, showsLoadSteps } from '../model/answers';
import { errorOf } from '../model/fields';
import { SetupIcon, type SetupIconId } from '../setupArt';
import { ActivityLevelsModal } from './modals';
import {
  STEP_TITLE_KEY,
  StepHeading,
  sliderIndexOf,
  sliderValueAt,
  toggleItem,
  type ValidatedStepProps,
} from './shared';

/**
 * SUPERSEDED (Brief G, decision `activity-slider-nine-stops`): master plan section 10.1's
 * amendment `activity-levels-three-bands` read "the bands are not arbitrary, so no slider wider
 * than three positions." That was half right. The bands are not arbitrary, but they are RANGES,
 * not points, and a stop INSIDE a published range invents nothing. The slider below is nine
 * positions, three per band, every PAL printed in the same FAO/WHO/UNU 2004 Table 5.3 the three-
 * band amendment already cited; `src/domain/nutrition.ts`'s ACTIVITY_STOPS carries the table and
 * the citation. `ActivityLevel` itself is UNCHANGED (still exactly `sedentary | moderate |
 * vigorous`): a stop's band is DERIVED from it, never a second, independently editable field, and
 * the earlier five-member ladder with invented midpoints at 1.55 and 1.85 stays rejected exactly
 * as before -- those two numbers now ship, but as points INSIDE the sedentary and moderate
 * bands (Brief G's own stops 2 and 5), not as a replacement for the printed floor the old ladder
 * used them for.
 */
const ACTIVITY_LEVEL_LABEL_KEY: Record<ActivityLevel, CopyKey> = {
  sedentary: 'option.activitySedentary',
  moderate: 'option.activityModerate',
  vigorous: 'option.activityVigorous',
};

/**
 * The nine-stop slider's own option list, `value` keyed by PAL rather than by band so
 * `sliderIndexOf`/`sliderValueAt` can address it exactly like every string-keyed slider on this
 * step (see their own updated doc comment above). `level` travels alongside each PAL so choosing
 * a stop sets `activity` (the band) and `activityPal` (the stop) together in one `patch` call --
 * the band is never chosen independently of the stop that implies it.
 */
const ACTIVITY_STOP_OPTIONS: { value: number; level: ActivityLevel }[] = ACTIVITY_STOPS.map(
  (stop) => ({ value: stop.pal, level: stop.level }),
);

/**
 * Brief F Part 1b: "Experience" renamed to Gym Comfort IN THE UI ONLY -- the type stays
 * `Experience` (novice | intermediate | advanced), and so does this array; only the copy the
 * three keys resolve to changed, to the owner's own verbatim wording. Each position also carries
 * an icon row id from docs/design/2026-09-04-icon-register.csv, which is also the name of the
 * owner's drawing the option shows (src/ui/setup/setupArt.tsx; approved 2026-10-18).
 */
const EXPERIENCE_OPTIONS: { value: Experience; labelKey: CopyKey; iconRow: SetupIconId }[] = [
  { value: 'novice', labelKey: 'option.experienceNovice', iconRow: 'comfort-1-starting' },
  {
    value: 'intermediate',
    labelKey: 'option.experienceIntermediate',
    iconRow: 'comfort-2-machines',
  },
  {
    value: 'advanced',
    labelKey: 'option.experienceAdvanced',
    iconRow: 'comfort-3-freeweights',
  },
];

/**
 * Brief F Part 1c: five positions, lowest to highest access. The two combination positions
 * (`home-and-bodyweight`, `full-and-home`) carry no exercise tag of their own -- they resolve
 * through `ACCESS_UNLOCKS` (src/domain/types.ts) at generation time, in `resolveSlot`
 * (src/domain/plan/templates.ts). This is why library.ts needed no retagging: see that type's own
 * comment for the proof that a combination resolves identically to its dominant pure tier.
 */
export const EQUIPMENT_ACCESS_OPTIONS: { value: EquipmentAccess; labelKey: CopyKey; iconRow: SetupIconId }[] = [
  { value: 'bodyweight', labelKey: 'option.accessBodyweight', iconRow: 'equip-1-bodyweight' },
  {
    value: 'home-and-bodyweight',
    labelKey: 'option.accessHomeAndBodyweight',
    iconRow: 'equip-2-home-bodyweight',
  },
  { value: 'home', labelKey: 'option.accessHome', iconRow: 'equip-3-home' },
  { value: 'full-and-home', labelKey: 'option.accessFullAndHome', iconRow: 'equip-4-full-home' },
  { value: 'full-gym', labelKey: 'option.accessFullGym', iconRow: 'equip-5-full-gym' },
];

/**
 * Round 3 Task 7, his words: "can we have a slider with 5 markers and 3 of them (start, middle,
 * and end) have icons instead of markers?"
 *
 * DERIVED, not written out as [0, 2, 4]. The middle of a five-stop slider is index 2; the middle
 * of a list that grows to seven would be index 3, and a literal would silently mark the wrong
 * stop. `Math.floor` picks the LOWER of the two middles on an even-length list, which is a
 * choice rather than an accident: a list with no true middle has no middle marker to be right
 * about, and the lower one keeps the three icons in ascending order.
 */
const EQUIPMENT_ICON_INDICES: readonly number[] = [
  0,
  Math.floor((EQUIPMENT_ACCESS_OPTIONS.length - 1) / 2),
  EQUIPMENT_ACCESS_OPTIONS.length - 1,
];

/** Brief F Part 3: the aerobic row of the "What equipment do you have?" multi-select. */
const HOME_AEROBIC_OPTIONS: { value: HomeEquipmentItem; labelKey: CopyKey }[] = [
  { value: 'treadmill', labelKey: 'option.homeTreadmill' },
  { value: 'elliptical', labelKey: 'option.homeElliptical' },
  { value: 'rowing-machine', labelKey: 'option.homeRowingMachine' },
];

/**
 * Brief F Part 3: the three dumbbell bands. Each carries its own lower bound and an optional
 * upper bound (`hi: null` is the open-ended "40 and above" band); FORMAT.dumbbellBand /
 * dumbbellBandOpen append the profile's own unit at render, per the owner's own flag ("a range
 * with no unit is ambiguous"). The NUMBERS are the same in both unit systems -- the brief states
 * the pair verbatim as "5 to 20 kg" or "5 to 20 lb" -- only the trailing unit word changes.
 */
const HOME_DUMBBELL_BANDS: { value: HomeEquipmentItem; lo: number; hi: number | null }[] = [
  { value: 'dumbbells-5-20', lo: 5, hi: 20 },
  { value: 'dumbbells-20-40', lo: 20, hi: 40 },
  { value: 'dumbbells-40-plus', lo: 40, hi: null },
];

/** Brief F Part 3: the machine row of the "What equipment do you have?" multi-select. */
const HOME_MACHINE_OPTIONS: { value: HomeEquipmentItem; labelKey: CopyKey }[] = [
  { value: 'squat-rack', labelKey: 'option.homeSquatRack' },
  { value: 'cable-machine', labelKey: 'option.homeCableMachine' },
  { value: 'bench', labelKey: 'option.homeBench' },
  { value: 'leg-press', labelKey: 'option.homeLegPress' },
  { value: 'lat-pulldown', labelKey: 'option.homeLatPulldown' },
  { value: 'smith-machine', labelKey: 'option.homeSmithMachine' },
];

/** Brief F Part 3: the Body Weight Only multi-select, a flat unlabelled list. */
const BODYWEIGHT_EQUIPMENT_OPTIONS: { value: BodyweightEquipmentItem; labelKey: CopyKey }[] = [
  { value: 'yoga-mat', labelKey: 'option.bodyweightYogaMat' },
  { value: 'skipping-rope', labelKey: 'option.bodyweightSkippingRope' },
  { value: 'pull-up-bar', labelKey: 'option.bodyweightPullUpBar' },
  { value: 'resistance-bands', labelKey: 'option.bodyweightResistanceBands' },
];

interface TrainingStepProps extends ValidatedStepProps {
  activityLevelsOpen: boolean;
  setActivityLevelsOpen: (open: boolean) => void;
}

export function TrainingStep(props: TrainingStepProps): JSX.Element {
  const { answers: draft, patch, headingRef, validation, activityLevelsOpen, setActivityLevelsOpen } = props;
  const t = useCopy();
  const loadLabelUnit = loadUnit(draft.units);
  return (
    <fieldset>
      <StepHeading title={t(STEP_TITLE_KEY.training)} headingRef={headingRef} />

      {activityLevelsOpen && (
        <ActivityLevelsModal
          onClose={() => {
            setActivityLevelsOpen(false);
          }}
        />
      )}

      {/* Brief G: Everyday Activity Level, widened from Brief F Part 1a's 3-position slider
          to nine stops, three per FAO/WHO/UNU 2004 band -- ACTIVITY_STOP_OPTIONS above,
          read from src/domain/nutrition.ts's ACTIVITY_STOPS. Interpolating BETWEEN bands to
          invent a new category is still forbidden, exactly as it was at three positions:
          every one of the nine values is printed in the same Table 5.3 the three bands
          already cite. Choosing a stop sets `activity` (the band) and `activityPal` (the
          stop) together in one patch, never independently. */}
      <div className="wiz-field wiz-slider">
        <label htmlFor="f-activity">{t('label.activity')}</label>
        <input
          id="f-activity"
          type="range"
          min={0}
          max={ACTIVITY_STOP_OPTIONS.length - 1}
          step={1}
          value={sliderIndexOf(ACTIVITY_STOP_OPTIONS, draft.activityPal ?? ACTIVITY_FACTOR.moderate)}
          onChange={(e) => {
            const pal = sliderValueAt(ACTIVITY_STOP_OPTIONS, e.target.value, ACTIVITY_FACTOR.moderate);
            const level =
              ACTIVITY_STOP_OPTIONS.find((option) => option.value === pal)?.level ?? 'moderate';
            patch({ activity: level, activityPal: pal });
          }}
        />
        {/*
         * ROUND 3 TASK 5: a tick at each of the nine stops, aligned to the THUMB centres.
         *
         * One span per member of ACTIVITY_STOP_OPTIONS, so the count is the slider's own and
         * a tenth stop added to src/domain/nutrition.ts's ACTIVITY_STOPS grows a tenth tick
         * rather than leaving nine ticks under ten positions.
         *
         * `aria-hidden`, and no live region of its own: the position this control is at is
         * already announced by `.wiz-slider-position` below, which is the live region. A
         * second announcement of the same state is noise, not access.
         */}
        <div className="wiz-slider-ticks" aria-hidden="true">
          {ACTIVITY_STOP_OPTIONS.map((option) => (
            <span key={option.value} className="wiz-slider-tick" />
          ))}
        </div>
        {/* THE BAND AND THE STOP, both. Brief G widened this control to nine stops and
            left the readout showing only the band, so the three stops inside a band were
            indistinguishable and six of nine positions changed nothing a user could see.
            The band still names the FAO/WHO/UNU category the number comes from; the sentence
            below it is what actually differs from one stop to the next. Both sit in the one
            live region so a screen reader announces the change once, not twice. */}
        <p className="wiz-slider-position" aria-live="polite">
          {t(
            ACTIVITY_LEVEL_LABEL_KEY[
              ACTIVITY_STOP_OPTIONS[
                sliderIndexOf(ACTIVITY_STOP_OPTIONS, draft.activityPal ?? ACTIVITY_FACTOR.moderate)
              ]?.level ?? 'moderate'
            ],
          )}
          <span className="wiz-slider-stop">
            {ACTIVITY_STOP_EXAMPLES[draft.activityPal ?? ACTIVITY_FACTOR.moderate] ?? ''}
          </span>
        </p>
        <details>
          <summary>{t('disclosure.examples')}</summary>
          {ACTIVITY_LEVEL_EXAMPLES.map((line) => (
            <p key={line} className="wiz-note">
              {line}
            </p>
          ))}
        </details>
        {/* Brief G's callout: a text link under the slider opening the same ModalShell the
            sex explainer uses, with the FAO/WHO/UNU citation and the full nine-stop table. */}
        <button
          type="button"
          className="wiz-link"
          onClick={() => {
            setActivityLevelsOpen(true);
          }}
        >
          {t('advice.activityLevelsSource')}
        </button>
      </div>

      {/*
       * GYM COMFORT, round 3 Task 6. The owner: "Gym comfort should not a slider, I think it
       * should just be a selection of image boxes, just like the gender option."
       *
       * SO IT IS THE SEX CONTROL'S SHAPE, not a second picker pattern invented beside it:
       * `.wiz-choice[role=radiogroup]` labelled by its own `.wiz-label`, one `.wiz-glyph`
       * label per option, the mark as an `aria-hidden` <span> before the text. A <span> and
       * not a <div> or <p>: a <label>'s content model is phrasing content, so a paragraph
       * inside it is invalid markup, and the sex control puts a bare <span> there for the
       * same reason. The option's own text is the caption.
       *
       * `Experience` is untouched. This is a CONTROL change: the stored type still has its
       * three values and `draft.experience` still holds one of them.
       *
       * Each 44 px frame names its docs/design/2026-09-04-icon-register.csv row in
       * `data-icon-row` and holds the owner's drawing for that row (approved 2026-10-18):
       * comfort-1-starting, comfort-2-machines, comfort-3-freeweights.
       */}
      <div className="wiz-field">
        <p className="wiz-label" id="experience-label">
          {t('label.experience')}
        </p>
        <div className="wiz-choice" role="radiogroup" aria-labelledby="experience-label">
          {EXPERIENCE_OPTIONS.map((o) => (
            <label key={o.value} className="wiz-glyph wiz-glyph-boxed">
              <input
                type="radio"
                name="experience"
                checked={draft.experience === o.value}
                onChange={() => {
                  patch({ experience: o.value });
                }}
              />
              <span
                aria-hidden="true"
                className="wiz-option-frame"
                data-icon-row={o.iconRow}
              >
                <SetupIcon id={o.iconRow} />
              </span>
              {t(o.labelKey)}
            </label>
          ))}
        </div>
      </div>

      {/* Brief F Part 1c: Equipment Access, 5 positions. The two combination positions
          carry no exercise tag of their own; see EQUIPMENT_ACCESS_OPTIONS's own comment. */}
      <div className="wiz-field wiz-slider">
        <label htmlFor="f-equipment-access">{t('label.equipmentAccess')}</label>
        <input
          id="f-equipment-access"
          type="range"
          min={0}
          max={EQUIPMENT_ACCESS_OPTIONS.length - 1}
          step={1}
          value={sliderIndexOf(EQUIPMENT_ACCESS_OPTIONS, draft.equipment)}
          onChange={(e) => {
            patch({
              equipment: sliderValueAt(EQUIPMENT_ACCESS_OPTIONS, e.target.value, 'full-gym'),
            });
          }}
        />
        {/*
         * ROUND 3 TASK 7: one marker per position, and the start, the middle and the end
         * carry a 20 px icon instead of a plain marker (EQUIPMENT_ICON_INDICES above derives
         * which three). Each frame names its docs/design/2026-09-04-icon-register.csv row in
         * `data-icon-row` and holds the owner's drawing for it (approved 2026-10-18). The two
         * positions between stay plain markers, as he asked ("3 of them ... have icons"), so
         * equip-2 and equip-4 have drawings this row does not show.
         *
         * `aria-hidden` for the same reason the activity ticks are: the position is already
         * announced by the live region below.
         */}
        <div className="wiz-slider-ticks" aria-hidden="true">
          {EQUIPMENT_ACCESS_OPTIONS.map((o, i) =>
            EQUIPMENT_ICON_INDICES.includes(i) ? (
              <span key={o.value} className="wiz-slider-tick-icon" data-icon-row={o.iconRow}>
                <SetupIcon id={o.iconRow} />
              </span>
            ) : (
              <span key={o.value} className="wiz-slider-tick" />
            ),
          )}
        </div>
        <p className="wiz-slider-position" aria-live="polite">
          {t(EQUIPMENT_ACCESS_OPTIONS[sliderIndexOf(EQUIPMENT_ACCESS_OPTIONS, draft.equipment)]?.labelKey ?? 'option.accessFullGym')}
        </p>
        {/* Round 3 Task 7, last point: the per-position example sentence stays, and still
            changes with the position. */}
        <p className="wiz-note">{EQUIPMENT_ACCESS_EXAMPLES[draft.equipment]}</p>
      </div>

      {/* Brief F Part 3: "Do you walk to and from the gym?", Full gym or Full gym and home
          gym only. Answer is STORED and feeds NO energy calculation -- see 1a above for why:
          the PAL band already counts it. */}
      {showsGymCommute(draft.equipment) && (
        <div className="wiz-field">
          <p className="wiz-label" id="walk-to-gym-label">
            {t('advice.walkToGym')}
          </p>
          <div className="wiz-choice" role="radiogroup" aria-labelledby="walk-to-gym-label">
            <label className="wiz-glyph">
              <input
                type="radio"
                name="walks-to-gym"
                checked={draft.walksToGym}
                onChange={() => {
                  patch({ walksToGym: true });
                }}
              />
              {t('button.yes')}
            </label>
            <label className="wiz-glyph">
              <input
                type="radio"
                name="walks-to-gym"
                checked={!draft.walksToGym}
                onChange={() => {
                  // No sets it to zero (Brief F Part 3), not to blank: the field carries no
                  // meaning once the answer is No.
                  patch({ walksToGym: false, walkMinutes: '0' });
                }}
              />
              {t('button.no')}
            </label>
          </div>
          {draft.walksToGym && (
            <UnitInput
              id="f-walk-minutes"
              quantity={t('quantity.walkMinutes')}
              unit={UNIT.minutes}
              inputMode="numeric"
              value={draft.walkMinutes}
              error={errorOf(validation, 'walkMinutes')}
              onChange={(v) => {
                patch({ walkMinutes: v });
              }}
            />
          )}
        </div>
      )}

      {/* Brief F Part 3: "What equipment do you have?", Home gym or either combination that
          includes it. Multi-select: a non-contiguous inventory (a light dumbbell pair and a
          heavy one, nothing between) is uncommon but real, so nothing here is exclusive. */}
      {showsHomeEquipment(draft.equipment) && (
        <div className="wiz-field">
          <p className="wiz-label" id="home-equipment-label">
            {t('advice.equipmentInventoryPrompt')}
          </p>
          <div role="group" aria-labelledby="home-equipment-label">
            <p className="wiz-label">{t('label.homeEquipmentAerobic')}</p>
            <div className="wiz-choice">
              {HOME_AEROBIC_OPTIONS.map((o) => (
                <label key={o.value} className="wiz-glyph">
                  <input
                    type="checkbox"
                    checked={draft.homeEquipment.includes(o.value)}
                    onChange={() => {
                      patch({ homeEquipment: toggleItem(draft.homeEquipment, o.value) });
                    }}
                  />
                  {t(o.labelKey)}
                </label>
              ))}
            </div>
            <p className="wiz-label">{t('label.homeEquipmentDumbbells')}</p>
            <div className="wiz-choice">
              {HOME_DUMBBELL_BANDS.map((band) => (
                <label key={band.value} className="wiz-glyph">
                  <input
                    type="checkbox"
                    checked={draft.homeEquipment.includes(band.value)}
                    onChange={() => {
                      patch({ homeEquipment: toggleItem(draft.homeEquipment, band.value) });
                    }}
                  />
                  {band.hi === null
                    ? FORMAT.dumbbellBandOpen(band.lo, loadLabelUnit)
                    : FORMAT.dumbbellBand(band.lo, band.hi, loadLabelUnit)}
                </label>
              ))}
            </div>
            <p className="wiz-label">{t('label.homeEquipmentMachines')}</p>
            <div className="wiz-choice">
              {HOME_MACHINE_OPTIONS.map((o) => (
                <label key={o.value} className="wiz-glyph">
                  <input
                    type="checkbox"
                    checked={draft.homeEquipment.includes(o.value)}
                    onChange={() => {
                      patch({ homeEquipment: toggleItem(draft.homeEquipment, o.value) });
                    }}
                  />
                  {t(o.labelKey)}
                </label>
              ))}
            </div>
            {/* P3a (audit D07): a home gym's bar and bands decide its pulling work, so the
                portable list is asked here too (showsPortableEquipment). No row label: the
                copy is out of scope for P3a, and the option names say what they are. */}
            <div className="wiz-choice">
              {BODYWEIGHT_EQUIPMENT_OPTIONS.map((o) => (
                <label key={o.value} className="wiz-glyph">
                  <input
                    type="checkbox"
                    checked={draft.bodyweightEquipment.includes(o.value)}
                    onChange={() => {
                      patch({
                        bodyweightEquipment: toggleItem(draft.bodyweightEquipment, o.value),
                      });
                    }}
                  />
                  {t(o.labelKey)}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Brief F Part 3: Body weight only, its own flat multi-select. Read by inventoryOf
          (P3a); the home access levels show the same list inside the block above. */}
      {draft.equipment === 'bodyweight' && (
        <div className="wiz-field">
          <p className="wiz-label" id="bodyweight-equipment-label">
            {t('advice.equipmentInventoryPrompt')}
          </p>
          <div
            className="wiz-choice"
            role="group"
            aria-labelledby="bodyweight-equipment-label"
          >
            {BODYWEIGHT_EQUIPMENT_OPTIONS.map((o) => (
              <label key={o.value} className="wiz-glyph">
                <input
                  type="checkbox"
                  checked={draft.bodyweightEquipment.includes(o.value)}
                  onChange={() => {
                    patch({
                      bodyweightEquipment: toggleItem(draft.bodyweightEquipment, o.value),
                    });
                  }}
                />
                {t(o.labelKey)}
              </label>
            ))}
          </div>
        </div>
      )}

      {/*
       * THE LOAD-STEP FIELDS, round 3 Task 8. His paragraph, in six parts:
       *
       *   1. "should appear ONLY when home gym and above is selected" -- `showsLoadSteps`
       *      above, and see its comment for why the cut sits where it does.
       *   2. "should come after the 'what equipment do you have'" -- they are last on the
       *      step now, below every equipment question, rather than above all of them.
       *   3. "Right now the three textboxes are 1 column, 3 rows. remake it so it is 1 row 2
       *      columns" -- `.wiz-row-tight`, which is the one row rule that stays two columns
       *      below the 560 px breakpoint (a bare `.wiz-row` collapses to one there).
       *   4. "Just have a title above them 'Load Step'" -- `label.loadStep`, R14.
       *   5. "below 'Dumbbell' and the other 'Plates'" -- in that order, left to right.
       *   6. "We don't need 3. Machine increment is standardized anyways." The weight-stack
       *      field is GONE. `Profile.equipmentSteps.stackKg` is NOT: it is a stored field,
       *      it keeps its existing default (`initialDraft`, and the unit reseed above), and
       *      `confirm` still writes it. Removing a stored field nothing will write is a
       *      migration, and `schemaVersion` stays 3.
       */}
      {showsLoadSteps(draft.equipment) && (
        <div className="wiz-box">
          <p className="wiz-label">{t('label.loadStep')}</p>
          <div className="wiz-row wiz-row-tight">
            <UnitInput
              id="f-dumbbell-step"
              quantity={t('quantity.dumbbellStep')}
              unit={loadLabelUnit}
              value={draft.dumbbellStep}
              error={errorOf(validation, 'dumbbellStep')}
              onChange={(v) => {
                patch({ dumbbellStep: v });
              }}
            />
            <UnitInput
              id="f-barbell-step"
              quantity={t('quantity.barbellStep')}
              unit={loadLabelUnit}
              value={draft.barbellStep}
              error={errorOf(validation, 'barbellStep')}
              onChange={(v) => {
                patch({ barbellStep: v });
              }}
            />
          </div>
          <p className="wiz-note">{t('advice.loadSteps')}</p>
        </div>
      )}
    </fieldset>
  );
}
