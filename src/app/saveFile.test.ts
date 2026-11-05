import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download';
import { saveFile, shareableFile, shareFile } from './saveFile';

vi.mock('./download', () => ({ downloadText: vi.fn() }));

/** Installs a share stub and returns its mock (read directly: `navigator.share` is a method). */
function stubShare(
  share: () => Promise<void>,
  canShare = true,
): ReturnType<typeof vi.fn<(data: ShareData) => Promise<void>>> {
  const mock = vi.fn<(data: ShareData) => Promise<void>>(share);
  Object.defineProperty(navigator, 'canShare', { value: vi.fn(() => canShare), configurable: true });
  Object.defineProperty(navigator, 'share', { value: mock, configurable: true });
  return mock;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
  vi.clearAllMocks();
});

describe('saveFile (audit B07)', () => {
  it('downloads where the browser cannot share files (jsdom, most desktops)', () => {
    expect(shareableFile('a.json', '{}', 'application/json')).toBeNull();
    expect(saveFile('a.json', '{}')).toEqual({ route: 'download' });
    expect(downloadText).toHaveBeenCalledWith('a.json', '{}', 'application/json');
  });

  it('downloads when the browser refuses this file type (Chromium and JSON)', () => {
    stubShare(() => Promise.resolve(), false);
    expect(saveFile('a.json', '{}').route).toBe('download');
  });

  it('shares when it can, and downloads nothing', async () => {
    const share = stubShare(() => Promise.resolve());
    const result = saveFile('a.json', '{"x":1}');
    expect(result.route).toBe('share');
    if (result.route === 'share') await expect(result.outcome).resolves.toBe('shared');
    expect(downloadText).not.toHaveBeenCalled();
    const shared = share.mock.calls[0]?.[0];
    expect(shared?.files?.[0]?.name).toBe('a.json');
  });

  it('reports a closed sheet as cancelled, and does not download behind the user', async () => {
    stubShare(() => Promise.reject(new DOMException('closed', 'AbortError')));
    const result = saveFile('a.json', '{}');
    if (result.route === 'share') await expect(result.outcome).resolves.toBe('cancelled');
    expect(downloadText).not.toHaveBeenCalled();
  });

  it('falls back to the download when the share itself fails', async () => {
    stubShare(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const result = saveFile('a.json', '{}');
    if (result.route === 'share') await expect(result.outcome).resolves.toBe('failed');
    expect(downloadText).toHaveBeenCalledWith('a.json', '{}', 'application/json');
  });

  it('shareFile maps AbortError to cancelled and anything else to failed', async () => {
    stubShare(() => Promise.reject(new Error('boom')));
    await expect(shareFile(new File(['x'], 'x.json'))).resolves.toBe('failed');
  });
});
