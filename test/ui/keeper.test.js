import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKeeper } from '../../src/ui/keeper.js';
import { flush } from '../helpers.js';

describe('keeper', () => {
  let keeper;
  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => setTimeout(cb, 0)));
  });
  afterEach(() => {
    keeper.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('re-attaches a detached mount once per frame, however many mutations', async () => {
    keeper = createKeeper();
    const node = document.createElement('span');
    const ensure = vi.fn(() => document.getElementById('host').appendChild(node));
    keeper.add({ name: 'x', attached: () => node.isConnected, ensure });
    for (let i = 0; i < 5; i += 1) document.body.appendChild(document.createElement('p'));
    await flush();
    await flush();
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(node.isConnected).toBe(true);
  });

  it('does no work while every mount is attached', async () => {
    keeper = createKeeper();
    keeper.add({ name: 'x', attached: () => true, ensure: vi.fn() });
    document.body.appendChild(document.createElement('p'));
    await flush();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('forgets a removed mount, and contains errors thrown by ensure()', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    keeper = createKeeper();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const gone = vi.fn();
    keeper.add({ name: 'bad-mount', attached: () => false, ensure: bad });
    const remove = keeper.add({ name: 'gone', attached: () => false, ensure: gone });
    remove();
    document.body.appendChild(document.createElement('p'));
    await flush();
    await flush();
    expect(bad).toHaveBeenCalled();
    expect(gone).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
