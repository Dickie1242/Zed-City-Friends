// Small inline markers shared by the Private Messages, DM and game chats.
import { h } from './dom.js';

// The red skull before an enemy's name (spec §C.5).
export const enemyMark = () => h('i', { class: 'fas fa-skull zcf-enemy-mark', role: 'img', title: 'Enemy', 'aria-label': 'Enemy' });

// After a muted conversation's name in the Chats tab (spec §D.1).
export const mutedMark = () => h('i', { class: 'fas fa-bell-slash zcf-muted-mark', role: 'img', title: 'Muted', 'aria-label': 'Muted' });
