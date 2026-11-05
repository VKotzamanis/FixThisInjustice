// Spec R13: until the stored records are read, #root shows one static loading line (main.tsx
// renders the app only after hydrate). It is the copy table's own line (rule 2).
import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import { copyFor } from '../content/copy';

describe('the boot loading line', () => {
  it('is the only content of #root, and it is shell.status.loading', () => {
    const line = copyFor('limelight', 'shell.status.loading');
    expect(indexHtml).toContain(`<div id="root"><p role="status">${line}</p></div>`);
  });
});
