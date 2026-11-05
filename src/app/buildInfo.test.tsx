import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import viteConfigSource from '../../vite.config.ts?raw';
import { FORMAT, copyFor } from '../content/copy';
import { SiteFooter } from '../ui/components/SiteFooter';
import { installFakeStorage } from '../store/testStorage';
import { parseBuildInfo, resetBuildInfoForTest } from './buildInfo';

afterEach(() => {
  resetBuildInfoForTest();
  vi.unstubAllGlobals();
});

describe('runtime build stamp (audit E06)', () => {
  it('accepts exactly the shape build/buildInfo.ts writes', () => {
    expect(parseBuildInfo({ commit: 'a1b2c3d', date: '2026-11-04' })).toEqual({ commit: 'a1b2c3d', date: '2026-11-04' });
    expect(parseBuildInfo({ commit: 'local', date: '2026-11-04' })).not.toBeNull();
    expect(parseBuildInfo({ commit: '<script>', date: '2026-11-04' })).toBeNull();
    expect(parseBuildInfo({ commit: 'a1b2c3d' })).toBeNull();
    expect(parseBuildInfo(null)).toBeNull();
  });

  it('the footer shows version, commit and date from build-info.json', async () => {
    installFakeStorage();
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ commit: 'a1b2c3d', date: '2026-11-04' }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<SiteFooter />);
    const version = FORMAT.footerVersion(__APP_VERSION__, 'a1b2c3d');
    await waitFor(() => {
      expect(screen.getByText(version)).toBeInTheDocument();
    });
    expect(screen.getByText(FORMAT.footerUpdated('2026-11-04'))).toBeInTheDocument();
    // `${BASE_URL}build-info.json`: BASE_URL is '/' under vitest, '/FixThisInjustice/' in the build.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/build-info\.json$/), { cache: 'no-store' });
  });

  it('omits the two lines when the stamp cannot be read (offline), and invents nothing', async () => {
    installFakeStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    const { container } = render(<SiteFooter />);
    await waitFor(() => {
      expect(screen.getByText(copyFor('limelight', 'footer.licence'))).toBeInTheDocument();
    });
    expect(screen.queryByText(FORMAT.footerVersion(__APP_VERSION__, 'local'))).toBeNull();
    expect(container.querySelectorAll('.site-footer p')).toHaveLength(6); // 8 lines minus the two
  });

  it('keeps the commit and date out of the hashed main chunk', () => {
    expect(viteConfigSource).not.toContain('__BUILD_COMMIT__');
    expect(viteConfigSource).not.toContain('__BUILD_DATE__');
    expect(viteConfigSource).toContain('buildInfoPlugin()');
    // build-info.json must never be precached, or sw.js would change on every commit.
    expect(viteConfigSource).toMatch(/globPatterns: \['\*\*\/\*\.\{js,css,html,ico,png,svg,woff,woff2\}'\]/);
  });
});
