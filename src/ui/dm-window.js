// One DM window/tab in the dock, styled like the game's chat (name · time · text, grouped).
import { h, clear, icon, avatar, badge, setBadge } from './dom.js';
import { createGifPicker } from './gif-picker.js';
import { createEmojiPicker } from './emoji-picker.js';
import { enemyMark } from './marks.js';
import { createStand } from './stand.js';
import { buildLog, messageParts } from '../mail.js';
import { formatMessageTime, statusText } from '../time.js';

const BUSY_TEXT = {
  fight: 'Mail is unavailable while you are in a fight.',
  traveling: 'Mail is unavailable while you are traveling.',
  exploring: 'Mail is unavailable while you are exploring.',
  offline: 'Mail is unavailable while the game is offline.',
};
// An invite's line ending and button, by kind (the game's own words).
const INVITE_WORDS = { trade: ['to trade!', 'View Trade'], activity: ['to an activity!', 'View Activity'] };

export function createDmWindow(services, userId) {
  const { store, actions, conversations, presence, router, myId, myName, fetchImpl, storage } = services;
  const isEnemy = services.isEnemy || (() => false);
  const isMuted = services.isMuted || (() => false);
  // The 12-hour clock switch in Chat settings (0.7 spec Part 6).
  const clock12 = () => !!(services.settings && services.settings.get().clock12);
  let shownClock12 = clock12();
  const conv = conversations.acquire(userId);
  let renderedKeys = [];
  let atBottom = true;
  // Unread count when the window opened: once messages are in, a "New" line goes above the first of them.
  let unreadAtOpen = 0;
  let newFrom = null;
  let showNewLine = false;
  let wasOpen = false;

  const avatarSlot = h('span', { class: 'zcf-dm-avatar' });
  const nameEl = h('span', { class: 'zcf-dm-name' });
  const statusEl = h('span', { class: 'zcf-dm-status' });
  const unreadBadge = badge();
  const headMark = enemyMark();
  headMark.hidden = true;
  const title = h('div', { class: 'chat-title' }, avatarSlot, headMark, nameEl, statusEl, unreadBadge);
  const inboxBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'Open in inbox', 'aria-label': 'Open in inbox' }, icon('external-link-alt'));
  const minBtn = h('button', { class: 'zcf-hbtn', type: 'button', title: 'Minimize', 'aria-label': 'Minimize' }, icon('minus'));
  const closeBtn = h('button', { class: 'zcf-hbtn zcf-close', type: 'button', title: 'Close', 'aria-label': 'Close' }, icon('times'));
  const bellIcon = h('i', { class: 'fas fa-bell', 'aria-hidden': 'true' });
  const bellBtn = h('button', { class: 'zcf-hbtn zcf-bell', type: 'button' }, bellIcon);
  const header = h('div', { class: 'chat-header', onclick: () => actions.toggleDm(userId) }, title, bellBtn, inboxBtn, minBtn, closeBtn);
  // Its tab in the bar while the window is open above it (0.8 spec §2).
  const standAvatar = h('span', { class: 'zcf-dm-avatar' });
  const standName = h('span', { class: 'zcf-dm-name' });
  const stand = createStand(`dm:${userId}`, { className: 'zcf-stand-dm', onClick: () => actions.minimizeDm(userId) }, standAvatar, standName);

  const notice = h('div', { class: 'zcf-notice', hidden: true });
  const loader = h('div', { class: 'zcf-loader', hidden: true }, 'Loading…');
  const log = h('div', { class: 'zcf-log' });
  const pendingEl = h('div', { class: 'zcf-pending' });
  const scroller = h('div', { class: 'zcf-scroll zcf-zoom' }, loader, log, pendingEl);
  const newChip = h('button', { class: 'zcf-newchip', type: 'button', hidden: true }, 'New messages ↓');
  const input = h('textarea', { class: 'zcf-input zcf-compose', rows: 1, placeholder: 'Message…', 'aria-label': 'Message' });
  const emojiBtn = h('button', { class: 'zcf-emojibtn', type: 'button', title: 'Insert an emoji', 'aria-label': 'Insert an emoji', 'aria-expanded': 'false' }, h('i', { class: 'far fa-smile', 'aria-hidden': 'true' }));
  const gifBtn = h('button', { class: 'zcf-gifbtn', type: 'button', title: 'Send a GIF', 'aria-label': 'Send a GIF', 'aria-expanded': 'false' }, 'GIF');
  const sendBtn = h('button', { class: 'zcf-send', type: 'button' }, 'Send');
  const gifPicker = createGifPicker({
    doc: document,
    fetchImpl,
    onPick: ({ title, url }) => {
      gifBtn.setAttribute('aria-expanded', 'false');
      if (conv.state.blocked) return;
      atBottom = true;
      conv.send(`![${title || 'GIF'}](${url})`);
    },
  });
  const emojiPicker = createEmojiPicker({
    doc: document,
    storage,
    onPick: (picked) => {
      emojiBtn.setAttribute('aria-expanded', 'false');
      insertAtCaret(picked.src ? `:${picked.name}:` : picked.emoji);
    },
  });
  const composer = h('div', { class: 'zcf-composer zcf-zoom' }, input, emojiBtn, gifBtn, sendBtn);
  const body = h('div', { class: 'chat-content zcf-body zcf-dm-body' }, notice, scroller, newChip, emojiPicker.el, gifPicker.el, composer);
  const el = h('div', { class: 'chat-container zcf zcf-dm', dataset: { zcfDm: String(userId), zcfChat: `dm:${userId}` } }, header, body);

  // Safety net for close paths we don't call directly (Esc); the click/pick handlers below set
  // aria-expanded synchronously so tests don't need to wait on this.
  const syncGifBtn = () => gifBtn.setAttribute('aria-expanded', String(!gifPicker.el.hidden));
  const gifObserver = new MutationObserver(syncGifBtn);
  gifObserver.observe(gifPicker.el, { attributes: true, attributeFilter: ['hidden'] });
  const syncEmojiBtn = () => emojiBtn.setAttribute('aria-expanded', String(!emojiPicker.el.hidden));
  const emojiObserver = new MutationObserver(syncEmojiBtn);
  emojiObserver.observe(emojiPicker.el, { attributes: true, attributeFilter: ['hidden'] });

  // Caret-insertion for a picked emoji: a standard emoji drops in its unicode character (shown as
  // typed), a Zed City (or flag) one drops in its ":name:" shortcode, which renders as an image once sent.
  function insertAtCaret(text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.focus();
    input.selectionStart = input.selectionEnd = pos;
  }

  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn(e);
  };
  // Minimized: the name is just part of the tab, so let the click bubble to the header's
  // toggle (same as clicking anywhere else on a minimized tab). Open: it's a profile link,
  // and must not also toggle the header underneath it.
  nameEl.addEventListener('click', (e) => {
    const entry = store.get().dock.dms.find((d) => d.id === userId);
    if (entry && !entry.open) return;
    e.stopPropagation();
    router.navigate(`/profile/${userId}`);
  });
  bellBtn.addEventListener('click', stop(() => actions.toggleMute(userId)));
  inboxBtn.addEventListener('click', stop(() => router.navigate(`/mail/${userId}`)));
  minBtn.addEventListener('click', stop(() => actions.minimizeDm(userId)));
  closeBtn.addEventListener('click', stop(() => actions.closeDm(userId)));
  newChip.addEventListener('click', () => scrollToBottom());
  sendBtn.addEventListener('click', () => submit());
  gifBtn.addEventListener('click', () => {
    emojiPicker.close();
    syncEmojiBtn();
    gifPicker.toggle();
    syncGifBtn();
  });
  emojiBtn.addEventListener('click', () => {
    gifPicker.close();
    syncGifBtn();
    emojiPicker.toggle();
    syncEmojiBtn();
  });
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
    newFrom = null; // you've answered: the "New" line has done its job
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

  // A GIF loading after render grows the log; if we were pinned to the bottom, follow it back down.
  // Uses the same `atBottom`/scrollToBottom the scroll handler and renderConversation share.
  function renderGif(part) {
    const img = h('img', { class: 'zcf-gif', src: part.src, alt: part.alt, title: part.alt, loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('load', () => {
      if (atBottom) scrollToBottom();
    });
    // A dead GIF degrades to its alt text instead of showing a broken-image icon.
    img.addEventListener('error', () => img.replaceWith(document.createTextNode(part.alt)));
    return img;
  }

  // Same shape the game renders emoji as: an inline image sized to the text line, whether it's a
  // Zed City item or a flag (Windows can't draw flag glyphs, so those are images too).
  function renderEmoji(part) {
    const alt = `:${part.name}:`;
    const img = h('img', { class: 'zcf-emoji', src: part.src, alt, title: alt, draggable: 'false', loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(document.createTextNode(alt)));
    return img;
  }

  function renderText(text) {
    return messageParts(text).map((part) => {
      if (part.type === 'image') return renderGif(part);
      if (part.type === 'emoji') return renderEmoji(part);
      return document.createTextNode(part.text);
    });
  }

  // A trade or activity invite, as the game's Mail page shows it: who invited whom, and a button to its page
  // (0.7.2 spec). On a phone the window shrinks to its tab, so the page isn't behind it.
  function renderInvite(m) {
    const [what, label] = INVITE_WORDS[m.invite.kind];
    const line = m.senderId === myId ? `You invited ${displayName()} ${what}` : `${displayName()} invited you ${what}`;
    const open = () => {
      router.navigate(`/${m.invite.kind}/${m.invite.id}`);
      if (services.isSmall && services.isSmall()) actions.minimizeDm(userId);
    };
    return h('div', { class: 'zcf-text zcf-invite' },
      h('span', { class: 'zcf-invite-line' }, line), ' ',
      h('button', { class: 'zcf-invite-btn', type: 'button', onclick: open }, label));
  }

  const renderBody = (m) => (m.invite ? renderInvite(m) : h('div', { class: 'zcf-text' }, ...renderText(m.text)));

  function renderItem(item) {
    if (item.type === 'divider') return h('div', { class: 'zcf-divider' }, item.label);
    if (item.type === 'new') return h('div', { class: 'zcf-new-line' }, 'New');
    const m = item.msg;
    const cls = `zcf-msg${item.grouped ? ' zcf-grouped' : ''}${m.isSystem ? ' zcf-system' : ''}`;
    const time = m.ts ? formatMessageTime(m.ts, Date.now(), false, clock12()) : '';
    // data-zcf-ts: hovering shows the full timestamp (ui/time-hover.js).
    if (item.grouped) return h('div', { class: cls, 'data-zcf-ts': m.ts || null }, renderBody(m));
    const mine = m.senderId === myId;
    const sender = mine
      ? h('span', { class: 'zcf-sender' }, myName)
      : h('span', { class: 'zcf-sender zcf-them', onclick: () => router.navigate(`/profile/${userId}`) }, enemyMark(), displayName());
    return h('div', { class: cls }, sender, h('span', { class: 'zcf-time', 'data-zcf-ts': m.ts || null }, time), renderBody(m));
  }

  function renderPending() {
    clear(pendingEl);
    for (const p of conv.pending()) {
      pendingEl.appendChild(h('div', { class: `zcf-msg zcf-pending-msg${p.error ? ' zcf-failed' : ''}` },
        h('div', { class: 'zcf-text' }, ...renderText(p.text)),
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
    gifBtn.disabled = conv.state.blocked || !!conv.state.busy;
    emojiBtn.disabled = conv.state.blocked || !!conv.state.busy;
  }

  // Appends when the new log only extends the old one; otherwise redraws (older page loaded, trimmed).
  function renderConversation() {
    renderNotice();
    loader.hidden = !(conv.state.loading || conv.state.loadingOlder);
    placeNewLine();
    const items = buildLog(conv.messages(), { newFrom });
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
      if (showNewLine) revealNewLine();
      if (conv.trim()) return;
    } else if (prepended) {
      scroller.scrollTop = prevTop + (scroller.scrollHeight - prevHeight);
    } else if (grew) {
      newChip.hidden = false;
    }
  }

  function placeNewLine() {
    if (!unreadAtOpen || !conv.state.loaded) return;
    const theirs = conv.messages().filter((m) => m.senderId !== myId).sort((a, b) => a.id - b.id);
    const first = theirs[Math.max(0, theirs.length - unreadAtOpen)];
    unreadAtOpen = 0;
    newFrom = first ? first.id : null;
    showNewLine = !!first;
  }

  // More unread than fits: start at the "New" line rather than the bottom.
  function revealNewLine() {
    showNewLine = false;
    const line = log.querySelector('.zcf-new-line');
    if (!line) return;
    const off = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    if (off >= 0) return;
    scroller.scrollTop += off - 8;
    atBottom = isAtBottom();
  }

  function update() {
    const s = store.get();
    const entry = s.dock.dms.find((d) => d.id === userId);
    if (!entry) return;
    const h12 = clock12();
    if (h12 !== shownClock12) {
      shownClock12 = h12;
      for (const t of log.querySelectorAll('.zcf-time[data-zcf-ts]')) t.textContent = formatMessageTime(Number(t.getAttribute('data-zcf-ts')), Date.now(), false, h12);
    }
    const open = !!entry.open;
    el.classList.toggle('chat-minimized', !open);
    el.classList.toggle('zcf-open', open);
    body.hidden = !open;
    statusEl.hidden = !open;
    inboxBtn.hidden = !open;
    minBtn.hidden = !open;
    bellBtn.hidden = !open;
    const p = presence.get(userId);
    clear(avatarSlot).appendChild(avatar({ avatar: avatarPath(), online: p ? p.online : undefined, size: open ? 18 : 24 }));
    nameEl.textContent = displayName();
    nameEl.title = displayName();
    stand.hidden = !open;
    if (open) {
      clear(standAvatar).appendChild(avatar({ avatar: avatarPath(), online: p ? p.online : undefined, size: 24 }));
      standName.textContent = displayName();
      stand.title = displayName();
    }
    const enemy = isEnemy(userId);
    headMark.hidden = !enemy;
    el.classList.toggle('zcf-enemy', enemy);
    const muted = isMuted(userId);
    bellIcon.className = `fas ${muted ? 'fa-bell-slash' : 'fa-bell'}`;
    bellBtn.title = `${muted ? 'Unmute' : 'Mute'} ${displayName()}`;
    bellBtn.setAttribute('aria-label', bellBtn.title);
    bellBtn.setAttribute('aria-pressed', String(muted));
    statusEl.textContent = statusText(p);
    statusEl.classList.toggle('zcf-status-on', !!(p && p.online));
    el.title = open ? '' : displayName();
    const unread = (s.threads[userId] && s.threads[userId].unread) || 0;
    setBadge(unreadBadge, unread, !open);
    if (open && !wasOpen) {
      unreadAtOpen = unread;
      newFrom = null;
      conv.ensureLoaded();
      atBottom = true;
      renderConversation();
    }
    if (!open) {
      unreadAtOpen = 0;
      newFrom = null;
      gifPicker.close();
      syncGifBtn();
      emojiPicker.close();
      syncEmojiBtn();
    }
    wasOpen = open;
  }

  return {
    el,
    stand,
    update,
    destroy() {
      unsubscribe();
      conversations.release(userId);
      gifObserver.disconnect();
      gifPicker.destroy();
      emojiObserver.disconnect();
      emojiPicker.destroy();
    },
  };
}
