import { describe, it, expect, afterEach } from 'vitest';
import { createTitleCount } from '../../src/ui/title-count.js';
import { flush } from '../helpers.js';

describe('title count', () => {
  let tc = null;
  afterEach(() => {
    if (tc) tc.destroy();
    tc = null;
  });

  it('puts the unread count in front of the title, and takes it away at zero or when turned off', () => {
    document.title = 'Zed City';
    tc = createTitleCount();
    tc.set(2, true);
    expect(document.title).toBe('(2) Zed City');
    tc.set(5, true);
    expect(document.title).toBe('(5) Zed City');
    tc.set(0, true);
    expect(document.title).toBe('Zed City');
    tc.set(3, false);
    expect(document.title).toBe('Zed City');
  });

  it('puts it back when the game rewrites the title', async () => {
    document.title = 'Zed City';
    tc = createTitleCount();
    tc.set(1, true);
    document.title = 'Inventory | Zed City';
    await flush();
    expect(document.title).toBe('(1) Inventory | Zed City');
  });
});
