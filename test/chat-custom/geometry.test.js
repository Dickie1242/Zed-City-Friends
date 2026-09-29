import { describe, it, expect } from 'vitest';
import { clampPosition, pastThreshold, gripsFor, resizeLimits, resizeRect, DRAG_THRESHOLD } from '../../src/chat-custom/geometry.js';

describe('chat geometry', () => {
  it('keeps a box fully on screen, pinning one that cannot fit', () => {
    expect(clampPosition({ x: 1200, y: 700, w: 350, h: 450, vw: 1280, vh: 800 })).toEqual({ x: 930, y: 350 });
    expect(clampPosition({ x: -20, y: -1, w: 350, h: 450, vw: 1280, vh: 800 })).toEqual({ x: 0, y: 0 });
    expect(clampPosition({ x: 50, y: 50, w: 2000, h: 450, vw: 1280, vh: 800 })).toEqual({ x: 0, y: 50 });
    expect(clampPosition({ x: 12.6, y: NaN, w: 10, h: 10, vw: 100, vh: 100 })).toEqual({ x: 13, y: 0 });
  });

  it('turns a press into a drag only past the threshold', () => {
    expect(DRAG_THRESHOLD).toBe(6);
    expect(pastThreshold(6, 0)).toBe(false);
    expect(pastThreshold(3, 4)).toBe(false);
    expect(pastThreshold(5, 4)).toBe(true);
  });

  it('gives docked chats the top grips, moved chats the bottom ones too, locked chats none', () => {
    expect(gripsFor({ locked: true, moved: true })).toEqual([]);
    expect(gripsFor({ locked: false, moved: false })).toEqual(['n', 'nw']);
    expect(gripsFor({ locked: false, moved: true })).toEqual(['n', 'nw', 's', 'se']);
  });

  it('resizes from each grip within the limits, anchoring the opposite edges', () => {
    const start = { left: 600, top: 300, width: 350, height: 450 };
    const docked = resizeLimits({ dir: 'nw', start, moved: false, vw: 1280, vh: 800 });
    expect(docked).toEqual({ minW: 270, maxW: 900, minH: 200, maxH: 740 });
    expect(resizeRect({ dir: 'nw', start, dx: -100, dy: -50, limits: docked, moved: false })).toEqual({ w: 450, h: 500 });
    expect(resizeRect({ dir: 'n', start, dx: -100, dy: 1000, limits: docked, moved: false })).toEqual({ h: 200 });
    const se = resizeLimits({ dir: 'se', start, moved: true, vw: 1280, vh: 800 });
    expect([se.maxW, se.maxH]).toEqual([680, 500]);
    expect(resizeRect({ dir: 'se', start, dx: 1000, dy: 1000, limits: se, moved: true })).toEqual({ w: 680, h: 500, x: 600, y: 300 });
    const nw = resizeLimits({ dir: 'nw', start, moved: true, vw: 1280, vh: 800 });
    expect(resizeRect({ dir: 'nw', start, dx: -50, dy: -40, limits: nw, moved: true })).toEqual({ w: 400, h: 490, x: 550, y: 260 });
  });
});
