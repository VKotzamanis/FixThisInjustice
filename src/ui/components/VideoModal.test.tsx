// @vitest-environment jsdom
//
// P4 Task 8. The modal is reached only through the context provider, so every test here
// opens it the way the app does: a child component calls useVideoModal().open(). Nothing
// touches window.__videoModal, because it no longer exists (code review A53).
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { TrainingModalsProvider } from './TrainingModalsProvider';
import { useVideoModal } from './VideoModal';
import { VIDEO_INSTANCES } from '../../config/videoInstances';
import { copy } from '../../content/copy';
import { EXERCISE_BY_ID } from '../../domain/plan/library';
import { useAppStore } from '../../store';

/** The host at a position in the allowlist, without an unchecked index. */
function hostAt(index: number): string {
  const instance = VIDEO_INSTANCES[index];
  if (instance === undefined) throw new Error(`videoInstances has no entry ${index}`);
  return instance.host;
}

/**
 * The search string the shipped library carries for an exercise. Read from the library
 * rather than hand-written so a drift there fails this test instead of leaving it asserting
 * a string the app never builds.
 */
function libraryQuery(id: string): string | null {
  const exercise = EXERCISE_BY_ID[id];
  if (exercise === undefined) throw new Error(`library no longer defines ${id}`);
  return exercise.videoQuery;
}

function Opener(props: { query: string | null; title: string }): ReactElement {
  const modal = useVideoModal();
  return (
    <button
      type="button"
      onClick={() => {
        modal.open({ query: props.query, title: props.title });
      }}
    >
      open
    </button>
  );
}

function renderWith(query: string | null, title: string): void {
  render(
    <TrainingModalsProvider>
      <Opener query={query} title={title} />
    </TrainingModalsProvider>,
  );
}

/** Opens the modal from a focused opener, as a keyboard user would. */
function openFrom(): HTMLElement {
  const opener = screen.getByText('open');
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

const TITLE = 'Barbell bench press';
const VIDEO_ID = 'dQw4w9WgXcQ'; // 11 URL-safe base64 characters: the legacy embed branch

beforeEach(() => {
  useAppStore.setState({ ui: { ...useAppStore.getState().ui, videoInstanceHost: null } });
});

describe('VideoModal', () => {
  it('renders nothing until it is opened', () => {
    renderWith(VIDEO_ID, TITLE);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTitle(TITLE)).toBeNull();
  });

  it('builds the search URL for a library query and frames nothing', () => {
    const query = libraryQuery('barbell-bench-press');
    expect(query).not.toBeNull();
    renderWith(query, TITLE);
    openFrom();

    expect(screen.queryByTitle(TITLE)).toBeNull();
    const link = screen.getByRole('link', { name: copy('button.searchInstance') });
    expect(link.getAttribute('href')).toBe(
      `https://${hostAt(0)}/search?q=${encodeURIComponent(query ?? '')}`,
    );
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('embeds an 11-character video id with the sandbox and referrer hardening', () => {
    renderWith(VIDEO_ID, TITLE);
    openFrom();

    const frame = screen.getByTitle(TITLE);
    expect(frame.getAttribute('src')).toBe(`https://${hostAt(0)}/embed/${VIDEO_ID}?autoplay=1`);
    // Master plan section 8 and security review M2 / constraint 20, verbatim.
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('loading')).toBe('lazy');
    // The search link falls back to the exercise title when the query is an id (legacy branch).
    const search = screen.getByRole('link', { name: copy('button.searchInstance') });
    expect(search.getAttribute('href')).toBe(
      `https://${hostAt(0)}/search?q=${encodeURIComponent(TITLE)}`,
    );
    const watch = screen.getByRole('link', { name: copy('button.openClip') });
    expect(watch.getAttribute('href')).toBe(`https://${hostAt(0)}/watch?v=${VIDEO_ID}`);
    expect(watch.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows the no-clip line and no iframe for an exercise with no video query', () => {
    expect(libraryQuery('lat-pulldown')).toBeNull();
    renderWith(null, 'Lat pulldown');
    openFrom();

    expect(screen.queryByTitle('Lat pulldown')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText(copy('advice.noClipRecorded'))).toBeTruthy();
    // With no query the search falls back to the title, so the control is never dead.
    expect(
      screen.getByRole('link', { name: copy('button.searchInstance') }).getAttribute('href'),
    ).toBe(`https://${hostAt(0)}/search?q=${encodeURIComponent('Lat pulldown')}`);
  });

  it('rotates through every instance and wraps to the first', () => {
    renderWith(VIDEO_ID, TITLE);
    openFrom();

    const next = screen.getByRole('button', { name: copy('button.nextInstance') });
    for (let i = 1; i < VIDEO_INSTANCES.length; i += 1) {
      fireEvent.click(next);
      expect(screen.getByTitle(TITLE).getAttribute('src')).toContain(`https://${hostAt(i)}/`);
    }
    fireEvent.click(next); // one past the end
    expect(screen.getByTitle(TITLE).getAttribute('src')).toContain(`https://${hostAt(0)}/`);
  });

  it('persists the host that loaded, through setUi, on the iframe load event', () => {
    renderWith(VIDEO_ID, TITLE);
    openFrom();

    fireEvent.load(screen.getByTitle(TITLE));
    expect(useAppStore.getState().ui.videoInstanceHost).toBe(hostAt(0));

    fireEvent.click(screen.getByRole('button', { name: copy('button.nextInstance') }));
    fireEvent.load(screen.getByTitle(TITLE));
    expect(useAppStore.getState().ui.videoInstanceHost).toBe(hostAt(1));
  });

  it('opens at the persisted instance', () => {
    useAppStore.setState({ ui: { ...useAppStore.getState().ui, videoInstanceHost: hostAt(2) } });
    renderWith(VIDEO_ID, TITLE);
    openFrom();
    expect(screen.getByTitle(TITLE).getAttribute('src')).toContain(`https://${hostAt(2)}/`);
  });

  it('falls back to the first instance when the persisted host has been dropped', () => {
    useAppStore.setState({
      ui: { ...useAppStore.getState().ui, videoInstanceHost: 'dropped.example' },
    });
    renderWith(VIDEO_ID, TITLE);
    openFrom();
    expect(screen.getByTitle(TITLE).getAttribute('src')).toContain(`https://${hostAt(0)}/`);
  });

  it('moves focus into the dialog, closes on Escape and returns focus to the opener', () => {
    renderWith(VIDEO_ID, TITLE);
    const opener = openFrom();

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps Tab inside the dialog', () => {
    renderWith(VIDEO_ID, TITLE);
    openFrom();
    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button'));
    const last = focusable[focusable.length - 1];
    const first = focusable[0];
    if (first === undefined || last === undefined) throw new Error('dialog has no focusable child');

    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('closes on a backdrop click and on the close control', () => {
    renderWith(VIDEO_ID, TITLE);
    openFrom();
    const backdrop = screen.getByTestId('video-modal-backdrop');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();

    openFrom();
    fireEvent.click(screen.getByRole('button', { name: copy('button.closeModal') }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
