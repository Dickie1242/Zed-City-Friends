// Finds every chat in the dock right now (spec §B.2): the game's by class, ours by data-zcf-chat.
import { GAME_CHATS } from '../../chat-custom/chats.js';

const info = (key, el) => ({
  key,
  el,
  header: el.querySelector(':scope > .chat-header'),
  minimized: el.classList.contains('chat-minimized'),
});

export function findChats(doc = document) {
  const dock = doc.querySelector('.chat-containers');
  if (!dock) return [];
  const out = [];
  for (const g of GAME_CHATS) {
    const el = dock.querySelector(`:scope > .chat-container.${g.cls}`);
    if (el) out.push(info(g.key, el));
  }
  for (const el of dock.querySelectorAll('.chat-container[data-zcf-chat]')) out.push(info(el.dataset.zcfChat, el));
  return out;
}
