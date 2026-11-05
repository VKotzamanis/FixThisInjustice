// @vitest-environment jsdom
//
// P4 Task 8, rewritten for ROADMAP L9 (audit E05). The modal is reached only through the context
// provider, so every test here opens it the way the app does: a child component calls
// useVideoModal().open(). Nothing touches window.__videoModal (code review A53).
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { TrainingModalsProvider } from './TrainingModalsProvider';
import { useVideoModal } from './VideoModal';
import type { VideoRequest } from './VideoModal';
import { VIDEO_INSTANCES } from '../../config/videoInstances';
import { copyFor } from '../../content/copy';
import { FORM_CUES } from '../../content/formCues';
import { EXERCISE_BY_ID } from '../../domain/plan/library';
import { useAppStore } from '../../store';

/** The host at a position in the allowlist, without an unchecked index. */
function hostAt(index: number): string {
  const instance = VIDEO_INSTANCES[index];
  if (instance === undefined) throw new Error(`videoInstances has no entry ${index}`);
  return instance.host;
}

/**
 * The request ExerciseCard builds for a library exercise. Read from the library rather than
 * hand-written, so a drift there fails here instead of leaving the test asserting an id the
 * app never frames.
 */
function libraryRequest(id: string): VideoRequest {
  const exercise = EXERCISE_BY_ID[id];
  if (exercise === undefined) throw new Error(`library no longer defines ${id}`);
  return { videoId: exercise.videoId, cueId: exercise.formCueId, title: exercise.name };
}

function Opener(props: { request: VideoRequest }): ReactElement {
  const modal = useVideoModal();
  return (
    <button
      type="button"
      onClick={() => {
        modal.open(props.request);
      }}
    >
      open
    </button>
  );
}

function renderWith(request: VideoRequest): void {
  render(
    <TrainingModalsProvider>
      <Opener request={request} />
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

const BENCH = libraryRequest('barbell-bench-press');
const TITLE = BENCH.title;
const ID = BENCH.videoId ?? '';
/** First line of the bench press setup cues: proof the cue body rendered. */
const BENCH_CUE = FORM_CUES['barbell-bench-press']?.setup[0] ?? '';

beforeEach(() => {
  useAppStore.setState({ ui: { ...useAppStore.getState().ui, videoInstanceHost: null } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VideoModal', () => {
  it('renders nothing until it is opened', () => {
    renderWith(BENCH);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it("frames the library clip in YouTube's privacy-enhanced player, inline and without autoplay", () => {
    expect(ID).toMatch(/^[A-Za-z0-9_-]{11}$/);
    renderWith(BENCH);
    openFrom();

    const frame = screen.getByTitle(TITLE);
    expect(frame.getAttribute('src')).toBe(`https://www.youtube-nocookie.com/embed/${ID}?playsinline=1`);
    expect(frame.getAttribute('src')).not.toContain('autoplay');
    expect(frame.getAttribute('allow')).not.toContain('autoplay');
    // Master plan section 8 and security review M2: no top navigation, no popups.
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    // YouTube's Required Minimum Functionality: the embed needs a Referer; origin only.
    expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
    expect(frame.getAttribute('loading')).toBe('lazy');
    // No outbound link: the clip plays here, the app is not left (audit E05).
    expect(screen.queryAllByRole('link')).toEqual([]);
  });

  it('steps through every mirror with no referrer, then wraps to YouTube', () => {
    renderWith(BENCH);
    openFrom();

    const other = screen.getByRole('button', { name: copyFor('limelight', 'button.otherMirror') });
    for (let i = 1; i < VIDEO_INSTANCES.length; i += 1) {
      fireEvent.click(other);
      const frame = screen.getByTitle(TITLE);
      expect(frame.getAttribute('src')).toBe(`https://${hostAt(i)}/embed/${ID}`);
      expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    }
    fireEvent.click(other); // one past the end
    expect(screen.getByTitle(TITLE).getAttribute('src')).toContain(`https://${hostAt(0)}/embed/`);
  });

  it('persists the host that loaded, through setUi, on the iframe load event', () => {
    renderWith(BENCH);
    openFrom();

    fireEvent.load(screen.getByTitle(TITLE));
    expect(useAppStore.getState().ui.videoInstanceHost).toBe(hostAt(0));

    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.otherMirror') }));
    fireEvent.load(screen.getByTitle(TITLE));
    expect(useAppStore.getState().ui.videoInstanceHost).toBe(hostAt(1));
  });

  it('opens at the persisted instance', () => {
    useAppStore.setState({ ui: { ...useAppStore.getState().ui, videoInstanceHost: hostAt(2) } });
    renderWith(BENCH);
    openFrom();
    expect(screen.getByTitle(TITLE).getAttribute('src')).toContain(`https://${hostAt(2)}/`);
  });

  it('falls back to the first instance when the persisted host has been dropped', () => {
    useAppStore.setState({
      ui: { ...useAppStore.getState().ui, videoInstanceHost: 'dropped.example' },
    });
    renderWith(BENCH);
    openFrom();
    expect(screen.getByTitle(TITLE).getAttribute('src')).toContain(`https://${hostAt(0)}/`);
  });

  it('offline: frames nothing, says why, shows the form cues, and frames the clip once online', () => {
    let online = false;
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    renderWith(BENCH);
    openFrom();

    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(copyFor('limelight', 'advice.videoOffline'));
    expect(screen.getByText(BENCH_CUE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: copyFor('limelight', 'button.otherMirror') })).toBeNull();

    online = true;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTitle(TITLE).getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/');
  });

  it('null id: frames nothing, says there is no clip, and shows the cues instead', () => {
    // Every library row now carries a clip (walk got one 2026-11-05), so the null case is the
    // walk row with its id removed: the path a custom exercise or a retired id takes.
    const walk = { ...libraryRequest('walk'), videoId: null };
    renderWith(walk);
    openFrom();

    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(copyFor('limelight', 'advice.noClipRecorded'));
    expect(screen.getByText(FORM_CUES['walk']?.setup[0] ?? '-')).toBeTruthy();
  });

  it('a malformed id is treated as no clip, never put into a frame URL', () => {
    renderWith({ videoId: 'a"><script>', cueId: null, title: 'Custom' });
    openFrom();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(copyFor('limelight', 'advice.noClipRecorded'));
  });

  it('moves focus into the dialog, closes on Escape and returns focus to the opener', () => {
    renderWith(BENCH);
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
    renderWith(BENCH);
    openFrom();
    const dialog = screen.getByRole('dialog');
    // ModalShell's trap counts the iframe (it can take focus), and here it is the last stop.
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button, iframe'));
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
    renderWith(BENCH);
    openFrom();
    const backdrop = screen.getByTestId('video-modal-backdrop');
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();

    openFrom();
    fireEvent.click(screen.getByRole('button', { name: copyFor('limelight', 'button.closeModal') }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
