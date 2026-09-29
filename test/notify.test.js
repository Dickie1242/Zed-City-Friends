import { describe, it, expect, vi } from 'vitest';
import { createNotifier } from '../src/notify.js';

function fakeWin(permission = 'default') {
  const shown = [];
  class N {
    constructor(title, opts) {
      this.title = title;
      this.opts = opts;
      this.close = vi.fn();
      shown.push(this);
    }
  }
  N.permission = permission;
  N.requestPermission = vi.fn(async () => {
    N.permission = 'granted';
    return 'granted';
  });
  return { win: { Notification: N, focus: vi.fn() }, shown, N };
}

describe('notifier', () => {
  it('reports no support without the Notification API', async () => {
    const n = createNotifier({ win: {} });
    expect(n.supported).toBe(false);
    expect(n.permission()).toBe('unsupported');
    expect(await n.request()).toBe('unsupported');
    expect(n.show({ id: 1, title: 'x' })).toBeNull();
  });

  it('asks for permission only when it has not been decided', async () => {
    const { win, N } = fakeWin('default');
    const n = createNotifier({ win });
    expect(await n.request()).toBe('granted');
    expect(N.requestPermission).toHaveBeenCalledTimes(1);
    const denied = fakeWin('denied');
    expect(await createNotifier({ win: denied.win }).request()).toBe('denied');
    expect(denied.N.requestPermission).not.toHaveBeenCalled();
  });

  it('shows one notification per player, and a click focuses the game and opens the DM', () => {
    const { win, shown } = fakeWin('granted');
    const onOpen = vi.fn();
    const n = createNotifier({ win, onOpen });
    n.show({ id: 5, title: 'Spike', body: 'see you at the bunker', icon: 'a.png' });
    expect(shown[0].title).toBe('Spike');
    expect(shown[0].opts).toEqual({ body: 'see you at the bunker', icon: 'a.png', tag: 'zcf-dm-5' });
    shown[0].onclick();
    expect(win.focus).toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledWith(5);
    expect(shown[0].close).toHaveBeenCalled();
  });

  it('shows nothing without permission', () => {
    const { win, shown } = fakeWin('denied');
    expect(createNotifier({ win }).show({ id: 5, title: 'Spike' })).toBeNull();
    expect(shown).toHaveLength(0);
  });
});
