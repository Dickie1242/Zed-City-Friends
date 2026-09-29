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
      this.gains = [];
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
      const g = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
      this.gains.push(g);
      return g;
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

  it('never queues tones in a context the browser keeps suspended, but a click plays after resuming', async () => {
    const made = [];
    class Stuck {
      constructor() {
        this.state = 'suspended';
        this.currentTime = 0;
        this.destination = {};
        this.oscillators = [];
        this.resume = vi.fn(() => Promise.resolve()); // no user gesture yet: stays suspended
        made.push(this);
      }

      createOscillator() {
        const o = { frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
        this.oscillators.push(o);
        return o;
      }

      createGain() {
        return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
      }
    }
    const sound = createSound({ win: { AudioContext: Stuck } });
    expect(sound.play('ping')).toBe(false);
    expect(made[0].oscillators).toHaveLength(0);
    expect(sound.play('ping', { fromUser: true })).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(made[0].oscillators).toHaveLength(TONES.ping.length);
  });

  it('scales every tone by the volume, and stays silent at 0', () => {
    const { win, made } = fakeAudio();
    const sound = createSound({ win });
    expect(sound.play('ping', { volume: 0 })).toBe(false);
    expect(made).toHaveLength(0);
    expect(sound.play('ping', { volume: 50 })).toBe(true);
    expect(made[0].gains[0].gain.exponentialRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(0.09);
    sound.play('ping');
    expect(made[0].gains[1].gain.exponentialRampToValueAtTime.mock.calls[0][0]).toBeCloseTo(0.18);
  });
});
