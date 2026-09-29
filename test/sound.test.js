import { describe, it, expect, vi } from 'vitest';
import { createSound, TONES } from '../src/sound.js';

function fakeAudio() {
  const made = [];
  class FakeContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 5;
      this.destination = {};
      this.oscillators = [];
      this.resume = vi.fn(() => {
        this.state = 'running';
        return Promise.resolve();
      });
      made.push(this);
    }

    createOscillator() {
      const o = { type: '', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      this.oscillators.push(o);
      return o;
    }

    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
    }
  }
  return { win: { AudioContext: FakeContext }, made };
}

describe('sound', () => {
  it('is silent when off, and makes no AudioContext for it', () => {
    const { win, made } = fakeAudio();
    const sound = createSound({ win });
    expect(sound.play('off')).toBe(false);
    expect(made).toHaveLength(0);
  });

  it('plays each tone through one lazily created, resumed AudioContext', () => {
    const { win, made } = fakeAudio();
    const sound = createSound({ win });
    expect(sound.play('ping')).toBe(true);
    expect(sound.play('chirp')).toBe(true);
    expect(made).toHaveLength(1);
    expect(made[0].resume).toHaveBeenCalled();
    expect(made[0].oscillators).toHaveLength(TONES.ping.length + TONES.chirp.length);
    expect(made[0].oscillators[0].start).toHaveBeenCalledWith(5);
  });

  it('does nothing where WebAudio is missing', () => {
    expect(createSound({ win: {} }).play('bell')).toBe(false);
  });
});
