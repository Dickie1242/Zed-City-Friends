// Chat settings → General (0.7 spec Part 2): notifications, sounds and volume, mentions, time and quick
// actions. Every control is built once and kept, so a redraw never loses what you were doing in it.
import { h } from '../dom.js';
import { section, checkRow, soundRow } from './controls.js';

export function createGeneralTab({ services, doc = document }) {
  const { settings, actions, sound, toast } = services;
  let marking = null; // { done, total } while Mark all as read runs

  const play = (name) => sound.play(name, { fromUser: true, volume: settings.get().volume });

  const notify = checkRow({ label: 'Desktop notifications', sub: 'Pop up outside the game when a PM arrives', focus: 'notify', onChange: (on) => actions.setNotify(on) });
  const test = h('button', { class: 'zcf-mini', type: 'button', 'data-zcf-focus': 'notify-test', onclick: sendTest }, 'Test');
  notify.row.appendChild(test);
  const note = h('div', { class: 'zcf-set-note', hidden: true });
  const friendsOnly = checkRow({ label: 'Friends only', focus: 'notify-friends', indent: true, onChange: (on) => actions.setNotifyFriendsOnly(on) });
  const titleCount = checkRow({ label: 'Unread count in the browser tab', sub: 'Like (2) Zed City', focus: 'title-count', onChange: (on) => actions.setTitleCount(on) });

  const pmSound = soundRow({ label: 'New private message', aria: 'New private message sound', focus: 'sound', onPick: (name) => actions.setSound(name), onPlay: play });
  const mentionSound = soundRow({ label: 'Mention', aria: 'Mention sound', focus: 'mention-sound', onPick: (name) => actions.setMentionSound(name), onPlay: play });
  const volume = h('input', { type: 'range', class: 'zcf-set-range', min: 0, max: 100, step: 5, 'aria-label': 'Volume', 'data-zcf-focus': 'volume' });
  volume.addEventListener('change', () => {
    actions.setVolume(Number(volume.value));
    const s = settings.get();
    const name = s.sound !== 'off' ? s.sound : s.mentionSound;
    if (name !== 'off') sound.play(name, { fromUser: true, volume: s.volume });
  });

  const mentions = checkRow({ label: 'Highlight messages that mention you', focus: 'mentions', onChange: (on) => actions.setMentions(on) });
  const words = h('input', { type: 'text', class: 'zcf-set-input', 'aria-label': 'Also highlight these words', placeholder: 'e.g. your faction tag', maxlength: 400, 'data-zcf-focus': 'mention-words' });
  words.addEventListener('change', () => {
    words.value = actions.setMentionWords(words.value).join(', ');
  });

  const clock12 = checkRow({ label: '12-hour clock', sub: '2:27 PM instead of 14:27', focus: 'clock12', onChange: (on) => actions.setClock12(on) });
  const hoverLocal = checkRow({ label: 'Your own time in the time hover', sub: 'Under ZCT, when you rest on a chat time', focus: 'hover-local', onChange: (on) => actions.setHoverLocal(on) });

  const markBtn = h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'mark', onclick: markAll }, 'Mark all as read');
  const closeBtn = h('button', { class: 'zcf-page-btn', type: 'button', 'data-zcf-focus': 'closeall', onclick: () => actions.closeAllDms() }, 'Close all private chats');

  const nodes = [
    section({ icon: 'bell', label: 'Notifications' }, notify.row, note, friendsOnly.row, titleCount.row),
    section({ icon: 'volume-up', label: 'Sounds' }, pmSound.row, mentionSound.row,
      h('label', { class: 'zcf-set-line' }, h('span', { class: 'zcf-set-label zcf-grow' }, 'Volume'), volume)),
    section({ icon: 'at', label: 'Mentions' }, mentions.row,
      h('label', { class: 'zcf-set-line zcf-set-ind' }, h('span', { class: 'zcf-set-also' }, 'Also:'), words),
      h('div', { class: 'zcf-set-hint zcf-set-ind' }, 'Words or names, separated by commas')),
    section({ icon: 'clock', label: 'Time' }, clock12.row, hoverLocal.row),
    section({ icon: 'bolt', label: 'Quick actions' }, h('div', { class: 'zcf-set-btns' }, markBtn, closeBtn)),
  ];

  // Its own tag, popping up again each time: a notification with the tag of one still in the system's
  // notification centre would replace it without showing. Clickable with notifications off too, so a click
  // always answers.
  function sendTest() {
    if (!settings.get().notify) {
      toast('Tick Desktop notifications first, then Test shows you one.');
      return;
    }
    const n = services.notifier;
    const shown = n && n.show({ id: 0, title: 'Zed City Friends', body: 'This is how a new private message will show up.', tag: 'zcf-test', renotify: true });
    if (!shown) toast("Your browser didn't show it. Check its notification settings.", { error: true });
    else toast("Test notification sent. If it didn't pop up, your computer may be blocking this browser's notifications, or Do not disturb is on.");
  }

  async function markAll() {
    if (marking) return;
    marking = { done: 0, total: 0 };
    sync();
    try {
      await actions.markAllRead((done, total) => {
        marking = { done, total };
        sync();
      });
    } finally {
      marking = null;
      sync();
    }
  }

  // What the browser allows, in words, or '' when notifications can simply be switched on.
  function blockedNote() {
    const n = services.notifier;
    if (!n || !n.supported) return 'Not supported in this browser.';
    return n.permission() === 'denied' ? "Notifications are blocked for zed.city in your browser's site settings." : '';
  }

  function sync() {
    const s = settings.get();
    const supported = !!(services.notifier && services.notifier.supported);
    notify.input.checked = s.notify;
    notify.input.disabled = !supported;
    test.disabled = !supported;
    const blocked = blockedNote();
    note.textContent = blocked;
    note.hidden = !blocked;
    friendsOnly.input.checked = s.notifyFriendsOnly;
    friendsOnly.input.disabled = !s.notify;
    titleCount.input.checked = s.titleCount;
    pmSound.sync(s.sound);
    mentionSound.sync(s.mentionSound);
    if (doc.activeElement !== volume) volume.value = String(s.volume);
    mentions.input.checked = s.mentions;
    mentions.setSub(services.myName ? `In Global and Faction: your name, ${services.myName}` : 'In Global and Faction: your name');
    words.disabled = !s.mentions;
    if (doc.activeElement !== words) words.value = s.mentionWords.join(', ');
    clock12.input.checked = s.clock12;
    hoverLocal.input.checked = s.hoverLocal;
    markBtn.disabled = !!marking;
    markBtn.textContent = marking ? `Marking… ${marking.done}/${marking.total}` : 'Mark all as read';
  }

  return {
    sync,
    model: () => null, // nothing here is rebuilt: sync() keeps it current
    build: () => nodes,
  };
}
