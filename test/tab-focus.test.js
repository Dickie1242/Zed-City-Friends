import { describe, it, expect, vi } from 'vitest';
import { createTabFocus, FRESH_MS } from '../src/tab-focus.js';
import { memoryStorage } from './helpers.js';

const KEY = 'zcf:v1:1:focus';

function tab(storage, id, { focused = false, t = { now: 1000 } } = {}) {
  const doc = { hasFocus: vi.fn(() => focused) };
  const tf = createTabFocus({ storage, key: KEY, doc, win: window, now: () => t.now, id });
  return { tf, doc, setFocus: (on) => { focused = on; } };
}

describe('tab focus', () => {
  it('tells a background tab another game tab has focus, until that goes stale', () => {
    const storage = memoryStorage();
    const t = { now: 1000 };
    const a = tab(storage, 'a', { focused: true, t });
    const b = tab(storage, 'b', { t });
    expect(b.tf.elsewhere()).toBe(true);
    expect(a.tf.elsewhere()).toBe(false);
    t.now += FRESH_MS - 1;
    expect(b.tf.elsewhere()).toBe(true);
    t.now += 1;
    expect(b.tf.elsewhere()).toBe(false);
    a.tf.beat();
    expect(b.tf.elsewhere()).toBe(true);
    a.tf.destroy();
    b.tf.destroy();
  });

  it("lets go when the focused tab loses focus, and ignores this tab's own record", () => {
    const storage = memoryStorage();
    const a = tab(storage, 'a', { focused: true });
    const b = tab(storage, 'b');
    a.setFocus(false);
    window.dispatchEvent(new Event('blur'));
    expect(storage.getItem(KEY)).toBeNull();
    expect(b.tf.elsewhere()).toBe(false);
    storage.setItem(KEY, JSON.stringify({ tab: 'b', at: 1000 }));
    expect(b.tf.elsewhere()).toBe(false);
    a.tf.destroy();
    b.tf.destroy();
  });

  it('never writes from an unfocused tab and survives junk in storage', () => {
    const storage = memoryStorage();
    const b = tab(storage, 'b');
    b.tf.beat();
    expect(storage.getItem(KEY)).toBeNull();
    storage.setItem(KEY, '{nope');
    expect(b.tf.elsewhere()).toBe(false);
    b.tf.destroy();
  });
});
