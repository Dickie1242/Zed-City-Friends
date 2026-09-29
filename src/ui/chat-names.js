// "+ friend" next to a sender's name in the game's Global/Faction chat, via one delegated listener.
import { h, icon } from './dom.js';
import { safe } from '../util.js';

export function createChatNames({ doc = document, store, myName, players, actions, toast }) {
  let currentName = null;
  let busy = false;
  let friendNames = new Set();

  const btn = h('button', { class: 'zcf-addname', type: 'button', title: 'Add friend' }, icon('user-plus'), ' friend');

  function refresh() {
    friendNames = new Set(Object.values(store.get().friends).map((f) => String(f.username).toLowerCase()));
    if (currentName && friendNames.has(currentName.toLowerCase())) btn.remove();
  }

  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  btn.addEventListener('click', safe('chat-add-click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const name = currentName;
    if (!name || busy) return;
    busy = true;
    try {
      const p = await players.resolveExact(name);
      if (!p) {
        toast(`Couldn't find ${name}`, { error: true });
        return;
      }
      actions.addFriend(p);
      toast(`${p.username} added to friends`);
      btn.remove();
    } finally {
      busy = false;
    }
  }));

  const onOver = safe('chat-names-over', (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function' || btn.contains(t)) return;
    const row = t.closest('.msg-cont');
    if (!row) return;
    const container = row.closest('.chat-container');
    if (!container || container.classList.contains('zcf')) return;
    const nameEl = row.querySelector('.sender-name');
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    if (!name || name.toLowerCase() === String(myName).toLowerCase() || friendNames.has(name.toLowerCase())) {
      btn.remove();
      return;
    }
    currentName = name;
    if (nameEl.nextSibling !== btn) nameEl.after(btn);
  });

  return {
    button: btn,
    refresh,
    start() {
      refresh();
      doc.addEventListener('mouseover', onOver);
    },
    stop() {
      doc.removeEventListener('mouseover', onOver);
      btn.remove();
    },
  };
}
