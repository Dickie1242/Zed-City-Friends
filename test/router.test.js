import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../src/router.js';

describe('router', () => {
  it('reports path changes from pushState, replaceState and popstate', async () => {
    const router = createRouter();
    const fn = vi.fn();
    router.onChange(fn);
    history.pushState({}, '', '/profile/5');
    await Promise.resolve();
    history.replaceState({}, '', '/profile/5');
    await Promise.resolve();
    history.replaceState({}, '', '/mail');
    await Promise.resolve();
    history.pushState({}, '', '/profile/6');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await Promise.resolve();
    expect(fn.mock.calls.map((c) => c[0])).toEqual(['/profile/5', '/mail', '/profile/6']);
    expect(router.path).toBe('/profile/6');
  });

  it('navigates through the game router when it is available', () => {
    const push = vi.fn();
    const app = document.createElement('div');
    app.id = 'q-app';
    app.__vue_app__ = { config: { globalProperties: { $router: { push } } } };
    document.body.appendChild(app);
    createRouter().navigate('/profile/9');
    expect(push).toHaveBeenCalledWith('/profile/9');
    app.remove();
  });
});
