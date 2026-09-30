// A chat's icon that stays in the bar while its window is open above the bar, like Torn's (0.8 spec §2):
// the chat's minimized bubble, highlighted in teal by styles.js. A click closes the window. It carries
// data-zcf-stand, never data-zcf-chat, so nothing that looks for chats (customization, marks, the phone
// rule) ever finds it.
import { h } from './dom.js';

// key: the chat's key. title: its name, for the tooltip. content: what the bubble shows (its icon, or a
// DM's avatar and name). Starts hidden; the window (or, for a game chat, the stylesheet) shows it.
export function createStand(key, { title, onClick, className = '' }, ...content) {
  return h('div', {
    class: `chat-container zcf chat-minimized zcf-stand${className ? ` ${className}` : ''}`,
    dataset: { zcfStand: key },
    title,
    hidden: true,
    onclick: onClick,
  }, h('div', { class: 'chat-header' }, h('div', { class: 'chat-title' }, ...content)));
}
