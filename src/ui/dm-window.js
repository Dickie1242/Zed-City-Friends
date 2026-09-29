// One DM window/tab in the dock, styled like the game's chat (name · time · text, grouped).
import { h, clear, icon, avatar, badge, setBadge } from './dom.js';
import { buildLog } from '../mail.js';
import { formatMessageTime, statusText } from '../time.js';

const BUSY_TEXT = {
  fight: 'Mail is unavailable while you are in a fight.',
  traveling: 'Mail is unavailable while you are traveling.',
  exploring: 'Mail is unavailable while you are exploring.',
  offline: 'Mail is unavailable while the game is offline.',
};

export function createDmWindow(services, userId) {
  const { store, actions, conversations, presence, router, myId, myName } = services;
  const conv = conversations.acquire(userId);
  let renderedKeys = [];
  let atBottom = true;
  let wasOpen = false;

  const avatarSlot = h('span', { class: 'zcf-dm-avatar' });
  const nameEl = h('span', { class: 'zcf-dm-name', title: 'View profile' });
  const statusEl = h('span', { class: 'zcf-dm-status' });
  const unreadBadge = badge();
  const title = h('div', { class: 'chat-title' }, avatarSlot, nameEl, statusEl, unreadBadge);
  const inboxBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'Open in inbox', 'aria-label': 'Open in inbox' }, icon('external-link-alt'));
  const minBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'Minimize', 'aria-label': 'Minimize' }, icon('minus'));
  const closeBtn = h('button', { class: 'zcf-hbtn zcf-close', type: 'button', title: 'Close', 'aria-label': 'Close' }, icon('times'));
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleDm(userId) }, title, inboxBtn, minBtn, closeBtn);

  const notice = h('div', { class: 'zcf-notice', hidden: true });
  const loader = h('div', { class: 'zcf-loader', hidden: true }, 'Loading…');
  const log = h('div', { class: 'zcf-log' });
  const pendingEl = h('div', { class: 'zcf-pending' });
  const scroller = h('div', { class: 'zcf-scroll' }, loader, log, pendingEl);
  const newChip = h('button', { class: 'zcf-newchip', type: 'button', hidden: true }, 'New messages ↓');
  const input = h('textarea', { class: 'zcf-input zcf-compose', rows: 1, placeholder: 'Message…', 'aria-label': 'Message' });
  const sendBtn = h('button', { class: 'zcf-send', type: 'button' }, 'Send');
  const body = h('div', { class: 'chat-content zcf-body zcf-dm-body' }, notice, scroller, newChip, h('div', { class: 'zcf-composer' }, input, sendBtn));
  const el = h('div', { class: 'chat-container zcf zcf-dm', dataset: { zcfDm: String(userId) } }, header, body);

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn(e);
  };
  nameEl.addEventListener('click', stop(() => router.navigate(`/profile/${userId}`)));
  inboxBtn.addEventListener('click', stop(() => router.navigate(`/mail/${userId}`)));
  minBtn.addEventListener('click', stop(() => actions.minimizeDm(userId)));
  closeBtn.addEventListener('click', stop(() => actions.closeDm(userId)));
  newChip.addEventListener('click', () => scrollToBottom());
  sendBtn.addEventListener('click', () => submit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener('focus', () => actions.setActiveDm(userId));
  body.addEventListener('mousedown', () => actions.setActiveDm(userId));
  scroller.addEventListener('scroll', () => {
    atBottom = isAtBottom();
    if (atBottom) newChip.hidden = true;
    if (scroller.scrollTop < 40 && conv.state.hasMore && !conv.state.loadingOlder) conv.loadOlder();
  });

  const unsubscribe = conv.subscribe(() => renderConversation());

  function isAtBottom() {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24;
  }

  function scrollToBottom() {
    scroller.scrollTop = scroller.scrollHeight;
    atBottom = true;
    newChip.hidden = true;
  }

  function submit() {
    if (!input.value.trim() || conv.state.blocked) return;
    const text = input.value;
    input.value = '';
    atBottom = true;
    conv.send(text);
  }

  function displayName() {
    const s = store.get();
    const entry = s.dock.dms.find((d) => d.id === userId);
    return (conv.state.info && conv.state.info.username) || (s.friends[userId] && s.friends[userId].username) || (entry && entry.username) || `#${userId}`;
  }

  function avatarPath() {
    const s = store.get();
    const entry = s.dock.dms.find((d) => d.id === userId);
    return (conv.state.info && conv.state.info.avatar) || (s.friends[userId] && s.friends[userId].avatar) || (entry && entry.avatar) || null;
  }

  function renderItem(item) {
    if (item.type === 'divider') return h('div', { class: 'zcf-divider' }, item.label);
    const m = item.msg;
    const cls = `zcf-msg${item.grouped ? ' zcf-grouped' : ''}${m.isSystem ? ' zcf-system' : ''}`;
    const time = m.ts ? formatMessageTime(m.ts) : '';
    if (item.grouped) return h('div', { class: cls, title: time }, h('div', { class: 'zcf-text' }, m.text));
    const mine = m.senderId === myId;
    const sender = mine
      ? h('span', { class: 'zcf-sender' }, myName)
      : h('span', { class: 'zcf-sender zcf-them', onclick: () => router.navigate(`/profile/${userId}`) }, displayName());
    return h('div', { class: cls }, sender, h('span', { class: 'zcf-time' }, time), h('div', { class: 'zcf-text' }, m.text));
  }

  function renderPending() {
    clear(pendingEl);
    for (const p of conv.pending()) {
      pendingEl.appendChild(h('div', { class: `zcf-msg zcf-pending-msg${p.error ? ' zcf-failed' : ''}` },
        h('div', { class: 'zcf-text' }, p.text),
        p.error
          ? h('div', { class: 'zcf-error' }, 'Failed to send · ', h('button', { class: 'zcf-link', type: 'button', onclick: () => conv.retry(p.localId) }, 'Retry'))
          : null));
    }
  }

  function renderNotice() {
    const text = conv.state.blocked ? "You can't message this player." : conv.state.busy ? BUSY_TEXT[conv.state.busy] || 'Mail is unavailable right now.' : '';
    notice.textContent = text;
    notice.hidden = !text;
    input.disabled = conv.state.blocked;
    sendBtn.disabled = conv.state.blocked || !!conv.state.busy;
  }

  // Appends when the new log only extends the old one; otherwise redraws (older page loaded, trimmed).
  function renderConversation() {
    renderNotice();
    loader.hidden = !(conv.state.loading || conv.state.loadingOlder);
    const items = buildLog(conv.messages());
    const keys = items.map((i) => i.key);
    const isAppend = renderedKeys.length > 0 && keys.length >= renderedKeys.length && renderedKeys.every((k, i) => keys[i] === k);
    const prepended = !isAppend && renderedKeys.length > 0 && keys[keys.length - 1] === renderedKeys[renderedKeys.length - 1];
    const grew = keys.length > renderedKeys.length;
    const prevHeight = scroller.scrollHeight;
    const prevTop = scroller.scrollTop;
    if (isAppend) {
      for (const item of items.slice(renderedKeys.length)) log.appendChild(renderItem(item));
    } else if (keys.join() !== renderedKeys.join()) {
      clear(log);
      for (const item of items) log.appendChild(renderItem(item));
    }
    renderedKeys = keys;
    renderPending();
    if (atBottom) {
      scrollToBottom();
      if (conv.trim()) return;
    } else if (prepended) {
      scroller.scrollTop = prevTop + (scroller.scrollHeight - prevHeight);
    } else if (grew) {
      newChip.hidden = false;
    }
  }

  function update() {
    const s = store.get();
    const entry = s.dock.dms.find((d) => d.id === userId);
    if (!entry) return;
    const open = !!entry.open;
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    body.hidden = !open;
    nameEl.hidden = !open;
    statusEl.hidden = !open;
    inboxBtn.hidden = !open;
    minBtn.hidden = !open;
    const p = presence.get(userId);
    clear(avatarSlot).appendChild(avatar({ avatar: avatarPath(), online: p ? p.online : undefined, size: open ? 18 : 24 }));
    nameEl.textContent = displayName();
    statusEl.textContent = statusText(p);
    statusEl.classList.toggle('zcf-status-on', !!(p && p.online));
    el.title = open ? '' : displayName();
    const unread = (s.threads[userId] && s.threads[userId].unread) || 0;
    setBadge(unreadBadge, unread, !open);
    if (open && !wasOpen) {
      conv.ensureLoaded();
      atBottom = true;
      renderConversation();
    }
    wasOpen = open;
  }

  return {
    el,
    update,
    destroy() {
      unsubscribe();
      conversations.release(userId);
    },
  };
}
