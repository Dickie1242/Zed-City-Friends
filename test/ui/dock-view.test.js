import { describe, it, expect } from 'vitest';
import { createDockView, visibleDms, SMALL_MAX_DMS } from '../../src/ui/dock-view.js';
import { openDm } from '../../src/state.js';
import { makeServices } from './services.js';

describe('dock view', () => {
  it(`shows every DM on desktop but only the ${SMALL_MAX_DMS} most recent on phones`, () => {
    const dms = [{ id: 1, lastUsed: 3 }, { id: 2, lastUsed: 1 }, { id: 3, lastUsed: 2 }];
    expect(visibleDms(dms, false)).toBe(dms);
    expect(visibleDms(dms, true).map((d) => d.id)).toEqual([1, 3]);
  });

  it('keeps an open DM visible on phones even after two newer pop-ups would otherwise evict it', () => {
    // id 1 is open (the person is reading it) despite being the least recently used; ids 2 and 3
    // pop up afterward and would fill both SMALL_MAX_DMS slots on their own.
    const dms = [{ id: 1, lastUsed: 1, open: true }, { id: 2, lastUsed: 5 }, { id: 3, lastUsed: 4 }];
    expect(visibleDms(dms, true).map((d) => d.id).sort()).toEqual([1, 2]);
  });

  it('orders DM windows (store order) before the Friends tab and removes closed ones', () => {
    const services = makeServices();
    const root = document.createElement('div');
    const view = createDockView({ root, services });
    services.store.update((s) => {
      openDm(s, 7, { now: 1 });
      openDm(s, 8, { now: 2 });
    });
    view.render();
    expect([...root.children].map((c) => c.dataset.zcfDm || 'friends')).toEqual(['7', '8', 'friends']);
    services.store.update((s) => { s.dock.dms = s.dock.dms.filter((d) => d.id !== 7); });
    view.render();
    expect([...root.children].map((c) => c.dataset.zcfDm || 'friends')).toEqual(['8', 'friends']);
    expect(services.conversations.get(7)).toBeNull();
  });
});
