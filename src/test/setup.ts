import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// vitest runs with globals: false, so Testing Library's automatic cleanup does
// not register itself. Without this, rendered trees accumulate across tests in
// a file and every query finds duplicates.
afterEach(() => {
  cleanup();
});
