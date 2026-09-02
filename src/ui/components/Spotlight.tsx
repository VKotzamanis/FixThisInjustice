// src/ui/components/Spotlight.tsx
//
// The spotlight palette: one query box over one list of views and planned exercises.
//
// It is a CONTROLLED component (`open` / `onClose`). It registers no keydown listener of its
// own, because code review A54 was two window listeners binding the same key and both running,
// and P8 Task 9 exists to make exactly one listener possible. The combo that opens it is stated
// once, as SPOTLIGHT_COMBO in src/ui/nav/views.ts, for that task to bind; the mobile tap target
// is SpotlightButton.tsx, for a phone with no keyboard to press it on.
//
// Escape is likewise NOT handled here. ModalShell already closes on Escape from a window
// listener, and handling it in both places would call onClose twice for one key press.
//
// Matching is a case-insensitive SUBSTRING of the label, with no fuzzy library: the labels are
// a view name or an exercise name, both short and both known to the user, and a fuzzy matcher
// would rank "Log" above "Legs" for the query "lg" with no way for the user to see why.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import { copy } from '../../content/copy';
import type { CopyKey } from '../../content/copy';
import { useCopy, useCopyOverrides } from '../../content/useCopy';
import type { PlanTemplate } from '../../domain/types';
import { useAppStore } from '../../store';
import { useActivePlan } from '../../store/selectors';
import { exerciseName } from '../format/plan';
import { VIEWS } from '../nav/views';
import type { ViewId } from '../nav/views';
import { requestPlanFocus } from '../planFocus';
import type { PlanFocusTarget } from '../planFocus';
import { ModalShell } from './ModalShell';
import './spotlight.css';

/**
 * The longest list the palette will show.
 *
 * Eight rows is roughly one phone screen under the query box. The cap is not a performance
 * measure (the item list is tens of entries): it is what keeps the list scannable, so the user
 * narrows the query instead of scrolling a list they cannot read.
 */
export const MAX_SPOTLIGHT_RESULTS = 8;

export interface SpotlightItem {
  kind: 'view' | 'exercise';
  /** Unique within one item list; becomes the option's DOM id for aria-activedescendant. */
  key: string;
  /** What the query matches against, and what the row shows: a view or an exercise name. */
  label: string;
  /**
   * Where the result sits: the session name for an exercise, and empty for a view, which sits
   * nowhere. Shown, never matched, so a session name cannot return a row whose own name shares
   * none of the query.
   */
  hint: string;
  run: () => void;
}

/*
 * Every collaborator is declared as a PROPERTY holding an arrow type, not as a method. A method
 * shorthand here would be an unbound method the moment these are destructured, which is both a
 * lint error and a real `this` hazard for anything but an arrow function.
 */
export interface SpotlightArgs {
  plan: PlanTemplate | null;
  /**
   * The active skin's override table, for the view rows' labels.
   *
   * Optional, and omitting it gives the clinical label VIEWS already carries: this function
   * is pure and is called directly by its own suite, which has no React tree to read a skin
   * from. The component below passes `useCopyOverrides()`.
   */
  overrides?: Partial<Record<CopyKey, string>>;
  setView: (id: ViewId) => void;
  focusPlanRow: (target: PlanFocusTarget) => void;
  close: () => void;
}

/**
 * Everything the palette can reach: the views first, then every planned exercise in the plan.
 *
 * Views first because with an empty query the palette is a view switcher; the exercises are
 * what the user types to reach. Pure, and takes its collaborators as arguments, so the routing
 * a result performs is asserted without rendering anything.
 */
export function buildSpotlightItems(args: SpotlightArgs): SpotlightItem[] {
  const { plan, setView, focusPlanRow, close, overrides } = args;
  const items: SpotlightItem[] = [];

  for (const view of VIEWS) {
    items.push({
      kind: 'view',
      key: `view-${view.id}`,
      // Through the key rather than the baked `view.label`, so the palette names a view the
      // way the rest of the app names it under the active skin.
      label: copy(view.copyKey, overrides),
      // A view is not inside anything, and the kind badge beside it already reads "View".
      hint: '',
      run: () => {
        setView(view.id);
        close();
      },
    });
  }

  for (const session of plan?.sessions ?? []) {
    for (const planned of session.exercises) {
      items.push({
        kind: 'exercise',
        // Both ids can contain single hyphens, so the session is separated from the exercise by
        // the same double hyphen planRowDomId uses, and for the same reason: "a-b" + "c" and
        // "a" + "b-c" must not collide.
        key: `exercise-${session.id}--${planned.exerciseId}`,
        // Through the library, so a row reads "Barbell bench press" and not its id. The
        // documented fallback prints the id when the library no longer holds the exercise.
        label: exerciseName(planned.exerciseId),
        hint: session.name,
        run: () => {
          setView('plan');
          focusPlanRow({ sessionId: session.id, exerciseId: planned.exerciseId });
          close();
        },
      });
    }
  }

  return items;
}

/** The visible result set: a case-insensitive substring of the LABEL, capped. */
export function filterSpotlightItems(
  items: readonly SpotlightItem[],
  query: string,
): SpotlightItem[] {
  const needle = query.trim().toLowerCase();
  const matched =
    needle === '' ? items : items.filter((i) => i.label.toLowerCase().includes(needle));
  return matched.slice(0, MAX_SPOTLIGHT_RESULTS);
}

export function Spotlight({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): ReactElement | null {
  const plan = useActivePlan();
  const titleId = useId();
  const listId = useId();
  const emptyId = useId();
  const optionIdPrefix = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const t = useCopy();
  const overrides = useCopyOverrides();

  const [query, setQuery] = useState('');
  /** Index into the FILTERED list, not the item list. */
  const [active, setActive] = useState(0);

  /*
   * ModalShell documents that its onClose must be referentially stable: an unstable one re-runs
   * its effect on every render, and that effect focuses the panel, which would pull the caret
   * out of the query box on every keystroke. Wrapping the caller's handler in a ref-backed
   * callback makes the palette correct for a caller that passes an inline arrow.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const close = useCallback(() => {
    onCloseRef.current();
  }, []);

  const items = useMemo(
    () =>
      buildSpotlightItems({
        plan,
        // Called through getState rather than a subscribed selector, the convention every other
        // view here follows (src/app/App.tsx, TodayView, TrainView): the palette WRITES the
        // preference and never reads it, so subscribing would re-render it for nothing.
        setView: (id) => {
          useAppStore.getState().setUi({ lastView: id });
        },
        focusPlanRow: requestPlanFocus,
        close,
        overrides,
      }),
    // `useCopyOverrides` returns the frozen table for the skin, so the reference is stable
    // per skin and this memo re-runs only when the skin actually changes.
    [plan, close, overrides],
  );

  const results = useMemo(() => filterSpotlightItems(items, query), [items, query]);

  /*
   * Opening and closing, keyed on `open` and not on the mount.
   *
   * The palette is CONTROLLED and stays mounted with `open` toggling, so a mount-only effect
   * would run exactly once, while `open` is false and the input does not exist yet: the caret
   * would stay on the panel ModalShell focuses, and the user would type into nothing.
   *
   * On open, the query box takes the caret. This runs AFTER ModalShell's own effect, which
   * focuses the panel, because React flushes a child's effects before its parent's, and
   * ModalShell remounts on every open. The optional call is the guard for the render in which
   * `open` is false and the ref therefore holds null.
   *
   * On close, the query and the selection are dropped. They are component state, and closing
   * does not unmount the component, so without this the palette reopens on the last query with
   * whatever row the last arrow press had left active.
   */
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      return;
    }
    setQuery('');
    setActive(0);
  }, [open]);

  const optionId = (index: number): string => `${optionIdPrefix}-${index}`;

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      // preventDefault, or the caret jumps to the end of the query at the same time.
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      results[active]?.run();
    }
  };

  if (!open) return null;

  return (
    <ModalShell
      labelledBy={titleId}
      className="spotlight"
      backdropClassName="spotlight-bg"
      testId="spotlight"
      onClose={close}
    >
      <h2 id={titleId} className="spotlight-title">
        {t('hero.spotlight')}
      </h2>

      <input
        ref={inputRef}
        type="text"
        role="combobox"
        className="spotlight-query"
        aria-label={t('label.spotlightQuery')}
        placeholder={t('label.spotlightQuery')}
        /* Whether the popup HAS anything in it, not whether the dialog is open: hard-coded
           true, a screen reader announces an expanded listbox over a query that matched
           nothing. */
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-describedby={emptyId}
        aria-autocomplete="list"
        aria-activedescendant={results.length === 0 ? undefined : optionId(active)}
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          // The result set has changed under it, so the old index would run a different row.
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />

      <ul id={listId} className="spotlight-list" role="listbox" aria-label={t('label.spotlightResults')}>
        {results.map((item, i) => (
          <li
            key={item.key}
            id={optionId(i)}
            role="option"
            className={'spotlight-item' + (i === active ? ' is-active' : '')}
            aria-selected={i === active}
            /* The label is on the element so a test can read what matched without depending on
               how the row lays its three spans out. */
            data-label={item.label}
            onClick={() => {
              item.run();
            }}
          >
            <span className={`spotlight-kind is-${item.kind}`}>
              {item.kind === 'view' ? t('label.spotlightView') : t('label.spotlightExercise')}
            </span>
            <span className="spotlight-label">{item.label}</span>
            {item.hint !== '' && <span className="spotlight-hint">{item.hint}</span>}
          </li>
        ))}
      </ul>

      {/* Mounted on every render, empty when there is nothing to say, rather than inserted
          with its text: a live region added to the document at the same moment as its content
          is not reliably announced, because the region was not present to be observed. The
          combobox points at it with aria-describedby so the sentence is also reachable on
          demand and not only as an announcement. */}
      <p id={emptyId} role="status" className="spotlight-empty">
        {results.length === 0 ? t('advice.noSpotlightMatch') : ''}
      </p>
    </ModalShell>
  );
}
