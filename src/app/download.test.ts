import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download';

/**
 * jsdom implements neither URL.createObjectURL nor HTMLAnchorElement.click's
 * navigation, so both are supplied here. The point of the test is the pairing:
 * every URL this helper creates is revoked, so a long session cannot leak one
 * blob per export.
 */
const createObjectURL = vi.fn<(o: Blob | MediaSource) => string>(() => 'blob:fti/1');
const revokeObjectURL = vi.fn<(u: string) => void>();

/** What the anchor carried at the moment it was clicked. */
let clicked: { href: string; download: string; inDocument: boolean } | null = null;

beforeEach(() => {
  clicked = null;
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked = {
      href: this.getAttribute('href') ?? '',
      download: this.download,
      inDocument: document.body.contains(this),
    };
  });
});

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

describe('downloadText', () => {
  it('creates an object URL, clicks a named link, then revokes the URL', () => {
    downloadText('fixthisinjustice-export.json', '{"a":1}');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe('application/json');

    // The click must happen while the anchor is in the document and already
    // carries both the URL and the filename; otherwise nothing downloads.
    expect(clicked).toEqual({
      href: 'blob:fti/1',
      download: 'fixthisinjustice-export.json',
      inDocument: true,
    });

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fti/1');
    // No anchor is left behind in the document.
    expect(document.body.querySelector('a')).toBeNull();
  });
});
