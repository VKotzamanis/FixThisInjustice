// src/ui/setup/setupBanner.tsx
//
// What the top bar has to know about the setup wizard, and nothing else.
//
// WHY A CONTEXT AND NOT THE STORE. The banner is rendered in <header> by src/app/App.tsx and the
// wizard is rendered in <main>, so they are siblings and neither can read the other's state. The
// two facts the banner needs (the name as typed, and whether Review is on screen) both live in
// `SetupWizard`'s own React state, and they are needed FOR THE CURRENT KEYSTROKE: the store's
// copy of the draft is written on a 400 ms trailing debounce (SETUP_DRAFT_SAVE_DEBOUNCE_MS,
// deliberately, so that typing does not re-render every store subscriber), so a banner reading it
// would trail the field the user is looking at by up to that long and read as a bug. A context
// carries exactly these two values to exactly one reader and adds nothing to the persisted
// document.
//
// WHY TWO CONTEXTS AND NOT ONE. The publisher (`setState`, referentially stable for the life of
// the provider) and the value (new on every keystroke) are separated so the wizard, which only
// publishes, does not re-render every time the banner's value changes. One context would make the
// publisher's identity change with the value and put the wizard on that render path.

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

/** The two facts the banner reads off the wizard. */
export interface SetupBannerState {
  /**
   * The display name AS TYPED. Raw: not trimmed, not re-cased, not truncated. The banner decides
   * whether a name has been given by testing `trim()`, which is the same test `confirm()` uses to
   * decide whether to fall back to the default display name, but it renders THIS string.
   */
  displayName: string;
  /**
   * Whether the wizard is showing its review step. The blank-name joke is keyed off this and
   * never off an empty field: it is for someone who reached the end without giving a name, not
   * for someone who has not typed it yet.
   */
  atReview: boolean;
}

/** `null` while no wizard is mounted, which is every screen after setup. */
const SetupBannerValueContext = createContext<SetupBannerState | null>(null);

type Publish = (state: SetupBannerState | null) => void;

/** The default is a no-op, so the wizard can be rendered on its own in a test with no provider. */
const SetupBannerPublishContext = createContext<Publish>(() => {
  /* no provider: nothing is listening, so publishing is a no-op rather than an error */
});

export function SetupBannerProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<SetupBannerState | null>(null);
  return (
    // `setState` is stable for the life of the provider, so the publish context's value never
    // changes identity and the effect below runs on the wizard's own values alone.
    <SetupBannerPublishContext.Provider value={setState}>
      <SetupBannerValueContext.Provider value={state}>{children}</SetupBannerValueContext.Provider>
    </SetupBannerPublishContext.Provider>
  );
}

/** What the wizard is showing, or `null` when it is not mounted. */
export function useSetupBanner(): SetupBannerState | null {
  return useContext(SetupBannerValueContext);
}

/**
 * Publishes the wizard's two banner facts, and withdraws them when the wizard goes away.
 *
 * The reset is its OWN effect with an empty dependency list rather than a cleanup on the first
 * one. A cleanup that ran on every change would publish `null` and then the new value on each
 * keystroke, and the banner would blink back to the brand between characters.
 */
export function usePublishSetupBanner(displayName: string, atReview: boolean): void {
  const publish = useContext(SetupBannerPublishContext);
  useEffect(() => {
    publish({ displayName, atReview });
  }, [publish, displayName, atReview]);
  useEffect(
    () => () => {
      publish(null);
    },
    [publish],
  );
}
