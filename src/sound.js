// The new-private-message sound (spec §B.4): short tones synthesized with WebAudio, so there are no files
// and no network requests. The AudioContext is made on first use and resumed then; browsers only let it
// start once the player has interacted with the page, so unlock() is also called from clicks.
export const TONES = {
  chirp: [{ f: 1800, to: 2700, at: 0, dur: 0.07 }, { f: 2200, to: 3100, at: 0.09, dur: 0.07 }],
  ping: [{ f: 1320, at: 0, dur: 0.28 }],
  bell: [{ f: 880, at: 0, dur: 0.7 }, { f: 1760, at: 0, dur: 0.45, gain: 0.08 }],
};

export function createSound({ win = window } = {}) {
  let ctx = null;

  function context() {
    if (!ctx) {
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume().catch(() => {});
    return ctx;
  }

  // Plays a named sound; 'off' (or any unknown name) is silent. Returns whether anything was (or will be)
  // scheduled. A suspended context is only waited for when the call comes from a click (`fromUser`):
  // otherwise tones queued in it would all play at once on the player's first click.
  function play(name, { fromUser = false } = {}) {
    const tones = TONES[name];
    if (!tones) return false;
    const ac = context();
    if (!ac) return false;
    if (ac.state === 'running') {
      schedule(ac, tones);
      return true;
    }
    if (!fromUser || typeof ac.resume !== 'function') return false;
    ac.resume().then(() => schedule(ac, tones), () => {});
    return true;
  }

  function schedule(ac, tones) {
    const t0 = ac.currentTime;
    for (const tone of tones) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const start = t0 + tone.at;
      const end = start + tone.dur;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.f, start);
      if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.gain || 0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }

  return {
    play,
    unlock() {
      context();
    },
  };
}
