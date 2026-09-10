/**
 * In-place copy editing, end to end in jsdom.
 *
 * THE ASSERTIONS THAT EARN THIS FILE:
 *   1. without `?design=1` the page is byte-identical and carries no `data-copy-key` at all;
 *   2. an edit typed into the page is stored under the skin whose WORDS are on screen, which is
 *      `ui.skin` and not the panel's token preview;
 *   3. a paste carrying markup is refused with a visible message rather than stripped;
 *   4. the four contract failures the plan names appear inline, next to the string, by rule id.
 *
 * The harness renders one ordinary component through `useCopy()`, exactly as the app does, plus
 * the gate. Nothing here reaches into the layer's internals: the test drives the DOM.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useCopy } from '../content/useCopy';
import { INTRO_SLIDES } from '../content/introSlides';
import { GUIDANCE_REFERENCES } from '../content/guidanceReferences';
import { defaultState, useAppStore } from '../store';
import { installFakeStorage } from '../store/testStorage';
import { DesignGate } from './DesignGate';
import { DESIGN_STORAGE_KEY } from './designStorage';
import { setCopyKeyMarking } from './copyMarkers';

/** Puts the query parameter on the location the gate reads, without navigating. */
function setSearch(search: string): void {
  window.history.replaceState({}, '', `/${search}`);
}

/**
 * A page of ordinary app copy.
 *
 * `button.reload` is a standalone string in a leaf element, which is the case the layer can make
 * editable. `hero.yourAnswers` is there so more than one key is discovered.
 */
function Page(): ReactElement {
  const t = useCopy();
  return (
    <main>
      <h1 data-testid="hero">{t('hero.yourAnswers')}</h1>
      <button type="button" data-testid="reload">
        {t('button.reload')}
      </button>
      <p data-testid="composed">Step 1 of 8: {t('label.units')}</p>
    </main>
  );
}

function editableNode(testId: string): HTMLElement {
  return screen.getByTestId(testId);
}

/** The stored body, parsed. */
function stored(store: Map<string, string>): {
  copy?: Record<string, Record<string, string>>;
} {
  return JSON.parse(store.get(DESIGN_STORAGE_KEY) ?? '{}') as {
    copy?: Record<string, Record<string, string>>;
  };
}

/** Types `value` into an editable node the way a browser would, then commits it. */
function typeInto(node: HTMLElement, value: string): void {
  const only = node.firstChild;
  if (only !== null && only.nodeType === Node.TEXT_NODE) only.nodeValue = value;
  else node.textContent = value;
  fireEvent.input(node);
}

let store = new Map<string, string>();

beforeEach(() => {
  store = installFakeStorage();
  useAppStore.setState(defaultState());
  useAppStore.setState((state) => ({ ui: { ...state.ui, skin: 'clinical' } }));
  delete document.documentElement.dataset.skin;
  document.documentElement.removeAttribute('style');
  setSearch('');
  setCopyKeyMarking(false);
});

afterEach(() => {
  setSearch('');
  setCopyKeyMarking(false);
});

describe('outside design mode', () => {
  it('renders the table strings identically and marks no node at all', () => {
    render(<Page />);

    expect(editableNode('reload').textContent).toBe('Reload');
    expect(editableNode('hero').textContent).toBe('What You Told Me');
    expect(document.querySelectorAll('[data-copy-key]')).toHaveLength(0);
    expect(document.querySelectorAll('[contenteditable]')).toHaveLength(0);
    expect(store.has(DESIGN_STORAGE_KEY)).toBe(false);
  });
});

describe('in design mode', () => {
  beforeEach(() => {
    setSearch('?design=1');
    // The gate reads the query parameter; the accessor reads its own module-level flag, which is
    // decided at import. A test cannot re-import, so it sets the flag the way the parameter would.
    setCopyKeyMarking(true);
  });

  it('carries the key onto the rendered node and makes it editable', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );

    const node = editableNode('reload');
    expect(node.getAttribute('data-copy-key')).toBe('button.reload');
    expect(node.getAttribute('data-copy-editable')).toBe('true');
    expect(node.getAttribute('contenteditable')).toBe('plaintext-only');
    // The marker itself never reaches the reader.
    expect(node.textContent).toBe('Reload');
  });

  it('refuses to make a composed string editable, because a slot would be lost', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );

    const node = editableNode('composed');
    // The key is attributed so the panel can offer it as a field; the node is not editable,
    // because committing "Step 1 of 8: Units on the Weight Plates" would write the frame into
    // the row.
    expect(node.getAttribute('data-copy-key')).toBe('label.units');
    expect(node.getAttribute('data-copy-editable')).toBe('false');
    expect(node.hasAttribute('contenteditable')).toBe(false);
  });

  it('stores an edit under the skin whose WORDS are on screen', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );

    const node = editableNode('reload');
    fireEvent.focusIn(node);
    typeInto(node, 'Reload Now');
    fireEvent.focusOut(node);

    expect(stored(store).copy).toEqual({ clinical: { 'button.reload': 'Reload Now' } });
  });

  it('files the edit against ui.skin even while another skin is PREVIEWED', () => {
    // This is the trap Task 2 exists to avoid. The switcher flips <html data-skin>, which changes
    // colours; the words stay clinical because useCopy() reads the store. An edit to clinical
    // words must not land in copy.board.ts.
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    fireEvent.click(screen.getByTestId('dm-skin-board'));
    expect(document.documentElement.dataset.skin).toBe('board');

    const node = editableNode('reload');
    fireEvent.focusIn(node);
    typeInto(node, 'Reload Now');
    fireEvent.focusOut(node);

    expect(stored(store).copy).toEqual({ clinical: { 'button.reload': 'Reload Now' } });
    expect(screen.getByTestId('dm-copy-target').textContent).toContain('src/content/copy.ts');
    expect(screen.getByTestId('dm-copy-preview-warning').textContent).toContain('COLOURS only');
  });

  it('files an edit into the SKIN table when the app is set to that skin', () => {
    useAppStore.setState((state) => ({ ui: { ...state.ui, skin: 'limelight' } }));
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );

    expect(screen.getByTestId('dm-copy-target').textContent).toContain(
      'src/content/copy.limelight.ts',
    );
    // `button.reload` has no limelight row, so it renders the clinical sentence and the panel
    // refuses the edit rather than inventing a row.
    expect(editableNode('reload').getAttribute('data-copy-editable')).toBe('false');
    expect(screen.getByTestId('dm-copy-blocked-button.reload').textContent).toContain(
      'no row for button.reload',
    );
  });

  it('refuses a paste carrying markup, with a message naming what it found', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    const node = editableNode('reload');
    fireEvent.focusIn(node);

    fireEvent.paste(node, {
      clipboardData: {
        getData: (type: string) => (type === 'text/html' ? '<b>Reload Now</b>' : 'Reload Now'),
      },
    });

    expect(screen.getByTestId('dm-copy-refusal').textContent).toContain('Paste refused');
    expect(screen.getByTestId('dm-copy-refusal').textContent).toContain('<b>');
    // Nothing was inserted, and nothing was stored.
    expect(node.textContent).toBe('Reload');
    expect(stored(store).copy ?? {}).toEqual({});
  });

  it('accepts a plain paste and inserts the PLAIN flavour', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    const node = editableNode('reload');
    fireEvent.focusIn(node);

    fireEvent.paste(node, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/html' ? '<html><body>Reload Now</body></html>' : 'Reload Now',
      },
    });

    expect(screen.queryByTestId('dm-copy-refusal')).toBeNull();
    expect(node.textContent).toContain('Reload Now');
  });

  it('shows the failing rule inline, in the sentence that broke it', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    const node = editableNode('reload');
    fireEvent.focusIn(node);

    typeInto(node, 'Go On To The Next');
    expect(screen.getByTestId('dm-copy-violation-R1').textContent).toContain('at most 3 words');

    typeInto(node, 'Reload — Now');
    expect(screen.getByTestId('dm-copy-violation-R5').textContent).toContain('no em dash');

    typeInto(node, 'reload now');
    expect(screen.getByTestId('dm-copy-violation-R14').textContent).toContain('Title Case');
  });

  it('marks the node itself as failing, so it is findable without the bubble', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    const node = editableNode('reload');
    fireEvent.focusIn(node);
    typeInto(node, 'Go On To The Next');
    fireEvent.focusOut(node);

    expect(node.getAttribute('data-copy-invalid')).toContain('R1');
  });

  it('takes textContent and never innerHTML, whatever ends up in the node', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    const node = editableNode('reload');
    fireEvent.focusIn(node);
    // A browser that ignored plaintext-only would leave an element behind. The commit must read
    // through it rather than storing the tag.
    node.innerHTML = '<b>Reload</b> Now';
    fireEvent.focusOut(node);

    expect(stored(store).copy).toEqual({ clinical: { 'button.reload': 'Reload Now' } });
    expect(node.innerHTML).toBe('Reload Now');
  });

  it('drops an edit that types the shipped words back, so the patch stays reviewable', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    const node = editableNode('reload');
    fireEvent.focusIn(node);
    typeInto(node, 'Reload Now');
    fireEvent.focusOut(node);
    expect(stored(store).copy).toEqual({ clinical: { 'button.reload': 'Reload Now' } });

    fireEvent.focusIn(node);
    typeInto(node, 'Reload');
    fireEvent.focusOut(node);
    expect(stored(store).copy).toEqual({ clinical: {} });
  });

  it('carries the edit into the export under the copy field', () => {
    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    const node = editableNode('reload');
    fireEvent.focusIn(node);
    typeInto(node, 'Reload Now');
    fireEvent.focusOut(node);

    fireEvent.click(screen.getByTestId('dm-export'));
    const field = screen.getByTestId<HTMLTextAreaElement>('dm-export-text');
    const exported = JSON.parse(field.value) as { copy: unknown; version: number };
    expect(exported.version).toBe(1);
    expect(exported.copy).toEqual({ clinical: { 'button.reload': 'Reload Now' } });
  });

  it('takes every attribute back off when the panel unmounts', () => {
    const view = render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    expect(editableNode('reload').getAttribute('data-copy-key')).toBe('button.reload');

    view.unmount();
    expect(document.querySelectorAll('[data-copy-key]')).toHaveLength(0);
    expect(document.querySelectorAll('[contenteditable]')).toHaveLength(0);
  });
});

describe('the store is still never written', () => {
  it('leaves useAppStore.getState() the identical object across a copy edit', () => {
    setSearch('?design=1');
    setCopyKeyMarking(true);
    const before = useAppStore.getState();

    render(
      <>
        <Page />
        <DesignGate />
      </>,
    );
    const node = editableNode('reload');
    fireEvent.focusIn(node);
    typeInto(node, 'Reload Now');
    fireEvent.focusOut(node);
    fireEvent.click(screen.getByTestId('dm-export'));

    expect(useAppStore.getState()).toBe(before);
  });
});

/*
 * ------------------------------------------------------------------------------------------
 * LONG-FORM TEXT, the modules `copy()` never reaches.
 *
 * The defect these cases exist to prevent is the one that produced this work: the owner opened
 * the tool on his own intro and found nothing would take an edit, because a rule aimed at
 * `guidanceReferences.ts` had swept up `introSlides.ts` with it. So the two halves are asserted
 * together and against each other - the intro takes an edit, the reference list does not and says
 * why - because either one alone would pass while the rule was wrong.
 * ------------------------------------------------------------------------------------------
 */

/** A slide heading and a bullet lead, rendered exactly as IntroSequence renders them. */
function IntroPage(): ReactElement {
  const slide = INTRO_SLIDES[1];
  const bullet = slide?.bullets[1];
  return (
    <main>
      <h2 data-testid="intro-heading">{slide?.heading}</h2>
      <p data-testid="intro-lead">{slide?.lead}</p>
      <span data-testid="intro-bullet-lead">{bullet?.lead}</span>
    </main>
  );
}

/** One reference lead line, rendered whole, exactly as GuidanceScreen renders it. */
function ReferencePage(): ReactElement {
  return <p data-testid="reference">{GUIDANCE_REFERENCES[0]?.lead}</p>;
}

/** The stored body's long-form half. */
function storedR10(map: Map<string, string>): Record<string, string> {
  const body = JSON.parse(map.get(DESIGN_STORAGE_KEY) ?? '{}') as { r10?: Record<string, string> };
  return body.r10 ?? {};
}

describe('long-form text in design mode', () => {
  beforeEach(() => {
    setSearch('?design=1');
    setCopyKeyMarking(true);
  });

  it('makes an intro slide editable, and names the module and field on the node', () => {
    render(
      <>
        <IntroPage />
        <DesignGate />
      </>,
    );

    const lead = screen.getByTestId('intro-lead');
    expect(lead.getAttribute('data-r10-field')).toBe('introSlides:INTRO_SLIDES.1.lead');
    expect(lead.getAttribute('data-r10-editable')).toBe('true');
    expect(lead.getAttribute('contenteditable')).toBe('plaintext-only');
    // The heading too, and it is the kind R14 binds.
    expect(screen.getByTestId('intro-heading').getAttribute('data-r10-field')).toBe(
      'introSlides:INTRO_SLIDES.1.heading',
    );
  });

  it('stores an edit to a slide under the field, with no skin involved', () => {
    render(
      <>
        <IntroPage />
        <DesignGate />
      </>,
    );

    const lead = screen.getByTestId('intro-lead');
    fireEvent.focusIn(lead);
    typeInto(lead, 'The creator of this application:');
    fireEvent.focusOut(lead);

    expect(storedR10(store)).toEqual({
      'introSlides:INTRO_SLIDES.1.lead': 'The creator of this application:',
    });
    // And nothing reached the copy half, which is where a skin would have appeared.
    const body = JSON.parse(store.get(DESIGN_STORAGE_KEY) ?? '{}') as { copy?: unknown };
    expect(body.copy).toEqual({});
  });

  it('refuses a guidanceReferences string and says why when it is tapped', () => {
    render(
      <>
        <ReferencePage />
        <DesignGate />
      </>,
    );

    const reference = screen.getByTestId('reference');
    expect(reference.getAttribute('data-r10-field')).toMatch(/^guidanceReferences:/);
    expect(reference.getAttribute('data-r10-editable')).toBe('false');
    expect(reference.hasAttribute('contenteditable')).toBe(false);

    fireEvent.click(reference);

    const lock = screen.getByTestId('dm-r10-lock');
    expect(lock.textContent).toContain('guidanceReferences is locked');
    expect(lock.textContent).toContain('DOI');
  });

  it('flags a heading retyped in lower case live, by rule id, as he types', () => {
    render(
      <>
        <IntroPage />
        <DesignGate />
      </>,
    );

    const heading = screen.getByTestId('intro-heading');
    fireEvent.focusIn(heading);
    typeInto(heading, 'who i am');

    expect(screen.getByTestId('dm-copy-violation-R14').textContent).toContain('Title Case');
  });

  it('flags an edit that would introduce a citation, because it would lock the module', () => {
    render(
      <>
        <IntroPage />
        <DesignGate />
      </>,
    );

    const lead = screen.getByTestId('intro-lead');
    fireEvent.focusIn(lead);
    typeInto(lead, 'The creator of this app, see 10.1519/JSC.0000000000002200:');

    expect(screen.getByTestId('dm-copy-violation-EVIDENCE').textContent).toContain('locks itself');
  });

  it('records a structural intent as a note, and the panel can take it back', () => {
    render(
      <>
        <IntroPage />
        <DesignGate />
      </>,
    );

    const bullet = screen.getByTestId('intro-bullet-lead');
    fireEvent.focusIn(bullet);
    fireEvent.pointerDown(screen.getByTestId('dm-note-delete'));

    expect(screen.getByTestId('dm-note-row-0').textContent).toContain(
      'introSlides:INTRO_SLIDES.1.bullets.1.lead',
    );
    // Nothing was destroyed, so Undo is the whole of the reversal.
    fireEvent.click(screen.getByTestId('dm-note-undo-0'));
    expect(screen.queryByTestId('dm-note-row-0')).toBeNull();
  });

  it('leaves the page untouched with the parameter absent', () => {
    setSearch('');
    setCopyKeyMarking(false);
    render(
      <>
        <IntroPage />
        <DesignGate />
      </>,
    );

    expect(document.querySelectorAll('[data-r10-field]')).toHaveLength(0);
    expect(document.querySelectorAll('[contenteditable]')).toHaveLength(0);
  });
});
