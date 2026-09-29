// The debounced player lookup behind the add pop-out and the Private Messages search box: it asks the
// game 300ms after typing stops, for 2+ characters or any all-digit ID, and drops a reply that arrives
// after the query moved on.
import { debounce } from '../util.js';

export const MAX_RESULTS = 8;
export const SEARCH_MS = 300;

// onState({ kind: 'idle' | 'short' | 'searching' | 'error' | 'results', text?, results? })
export function createPlayerSearch({ players, onState }) {
  let seq = 0;
  // `mine` is snapshotted per keystroke, not per debounced call, so a request already in flight is
  // dropped as soon as the query moves on, even before the next debounce fires.
  const run = debounce(async (mine, q) => {
    let r;
    try {
      r = await players.search(q);
    } catch {
      r = { ok: false };
    }
    if (mine !== seq) return;
    if (!r.ok) onState({ kind: 'error', text: 'Search failed. Try again.' });
    else onState({ kind: 'results', results: r.data.slice(0, MAX_RESULTS) });
  }, SEARCH_MS);

  return {
    set(value) {
      const q = String(value || '').trim();
      seq += 1;
      const mine = seq;
      if (q.length >= 2 || /^\d+$/.test(q)) {
        onState({ kind: 'searching' });
        run(mine, q);
      } else {
        run.cancel();
        onState({ kind: q ? 'short' : 'idle' });
      }
    },
    cancel() {
      run.cancel();
      seq += 1;
    },
  };
}
