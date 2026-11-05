import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { copyFor } from '../content/copy';
import { checkStorageEstimate, defaultState, useAppStore } from '../store';
import { installFakeStorage } from '../store/testStorage';
import { App } from './App';
import { preloadRoutes } from './routes';

// Audit E09: App's split screens render on their first frame only once loaded.
beforeAll(async () => {
  await preloadRoutes();
});

beforeEach(() => {
  installFakeStorage();
  useAppStore.setState({
    ...defaultState(),
    status: { lastSaveError: null, lastLoadError: null, lastLoadRaw: null, hydrated: true, lastActionError: null },
  });
});

describe('the near-quota banner (B05)', () => {
  it('appears once usage reaches the ratio and goes when it falls', async () => {
    render(<App />);
    expect(screen.queryByText(copyFor('limelight', 'banner.storageNearlyFull.body'))).toBeNull();
    await act(async () => {
      await checkStorageEstimate(() => Promise.resolve({ usageBytes: 90, quotaBytes: 100 })); // [bytes]
    });
    expect(screen.getByText(copyFor('limelight', 'banner.storageNearlyFull.body'))).toBeInTheDocument();
    await act(async () => {
      await checkStorageEstimate(() => Promise.resolve({ usageBytes: 10, quotaBytes: 100 })); // [bytes]
    });
    expect(screen.queryByText(copyFor('limelight', 'banner.storageNearlyFull.body'))).toBeNull();
  });
});
