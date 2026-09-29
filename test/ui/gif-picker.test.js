import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGifPicker } from '../../src/ui/gif-picker.js';

const KLIPY_KEY = 'XnaONUEjqFvkZSqJx0ouuO17Og1kVP1VCiNXYMeQixllGKwC5xzjdshlvoMwGfYa';

function klipyResult(title, id) {
  return {
    content_description: title,
    media_formats: {
      tinygif: { url: `https://static.klipy.com/${id}/tiny.gif` },
      gif: { url: `https://static.klipy.com/${id}/full.gif` },
    },
  };
}

function okFetch(results = []) {
  return vi.fn().mockResolvedValue({ json: async () => ({ results }) });
}

describe('gif picker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opening fetches featured with the exact Klipy params and no q', () => {
    const fetchImpl = okFetch([]);
    const picker = createGifPicker({ doc: document, fetchImpl, onPick: vi.fn() });
    picker.open();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      `https://api.klipy.com/v2/featured?key=${KLIPY_KEY}&client_key=zed-ui&limit=24&media_filter=gif%2Ctinygif&contentfilter=medium`,
    );
    expect(url).not.toContain('q=');
    expect(opts.credentials).toBe('omit');
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('debounces search typing, then fetches search with q', async () => {
    const fetchImpl = okFetch([]);
    const picker = createGifPicker({ doc: document, fetchImpl, onPick: vi.fn() });
    picker.open();
    await vi.advanceTimersByTimeAsync(0);
    fetchImpl.mockClear();
    const input = picker.el.querySelector('.zcf-gif-search');
    input.value = 'cat fail';
    input.dispatchEvent(new Event('input'));
    expect(fetchImpl).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(249);
    expect(fetchImpl).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain('https://api.klipy.com/v2/search?');
    expect(url).toContain('q=cat+fail');
  });

  it('does not let an earlier slow response overwrite a later one', async () => {
    let resolveFirst;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => first.then(() => ({ json: async () => ({ results: [klipyResult('Old', 'old')] }) })))
      .mockImplementationOnce(() => Promise.resolve({ json: async () => ({ results: [klipyResult('New', 'new')] }) }));
    const picker = createGifPicker({ doc: document, fetchImpl, onPick: vi.fn() });
    picker.open(); // slow featured request, still pending
    picker.el.querySelectorAll('.zcf-gif-chip')[1].click(); // Reactions: fast, resolves immediately
    await vi.advanceTimersByTimeAsync(0);
    resolveFirst(); // the slow one finally resolves, after the newer one already rendered
    await vi.advanceTimersByTimeAsync(0);
    const titles = [...picker.el.querySelectorAll('.zcf-gif-thumb')].map((img) => img.title);
    expect(titles).toEqual(['New']);
  });

  it('proxies Klipy results through cdn.zed.city and drops a non-Klipy host', async () => {
    const fetchImpl = okFetch([
      klipyResult('Good', 'ok'),
      { content_description: 'Bad', media_formats: { tinygif: { url: 'https://evil.example/tiny.gif' }, gif: { url: 'https://evil.example/full.gif' } } },
    ]);
    const picker = createGifPicker({ doc: document, fetchImpl, onPick: vi.fn() });
    picker.open();
    await vi.advanceTimersByTimeAsync(0);
    const imgs = [...picker.el.querySelectorAll('.zcf-gif-thumb')];
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe(`https://cdn.zed.city/?url=${encodeURIComponent('https://static.klipy.com/ok/tiny.gif')}`);
    expect(imgs[0].alt).toBe('Good');
  });

  it('clicking a result sends the proxied full URL and title to onPick, then closes', async () => {
    const onPick = vi.fn();
    const fetchImpl = okFetch([klipyResult('Nice', 'ok')]);
    const picker = createGifPicker({ doc: document, fetchImpl, onPick });
    picker.open();
    await vi.advanceTimersByTimeAsync(0);
    picker.el.querySelector('.zcf-gif-thumb').click();
    expect(onPick).toHaveBeenCalledWith({ title: 'Nice', url: `https://cdn.zed.city/?url=${encodeURIComponent('https://static.klipy.com/ok/full.gif')}` });
    expect(picker.el.hidden).toBe(true);
  });

  it('shows an error message when the fetch fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const picker = createGifPicker({ doc: document, fetchImpl, onPick: vi.fn() });
    picker.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(picker.el.querySelector('.zcf-gif-status').textContent).toBe('Unable to load GIFs right now.');
  });

  it('shows a "no results" message for an empty response', async () => {
    const fetchImpl = okFetch([]);
    const picker = createGifPicker({ doc: document, fetchImpl, onPick: vi.fn() });
    picker.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(picker.el.querySelector('.zcf-gif-status').textContent).toBe('No GIFs found.');
  });

  it('closes on Escape', () => {
    const fetchImpl = okFetch([]);
    const picker = createGifPicker({ doc: document, fetchImpl, onPick: vi.fn() });
    picker.open();
    expect(picker.el.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(picker.el.hidden).toBe(true);
  });
});
