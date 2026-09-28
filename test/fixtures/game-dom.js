// Markup copied from the live Zed City client (Vue/Quasar build of 2026-09-26), trimmed to what the script touches.

const msg = (name, time, text) =>
  `<div class="msg-cont"><div><div><div><div><span class="sender-name">${name}</span><span>${time}</span></div><div>${text}</div></div></div></div></div>`;

export const DOCK_HTML = `
<div class="chat-containers">
  <!--v-if-->
  <div class="chat-container faction-chat chat-minimized">
    <div class="chat-header"><div class="chat-title"><i class="fas fa-users chat-icon" aria-hidden="true"></i></div></div>
    <div class="chat-content chat-hidden"></div>
  </div>
  <div class="chat-container general-chat">
    <div class="chat-header"><div class="chat-title"><i class="fas fa-comments chat-icon" aria-hidden="true"></i><span>Chat</span></div><div class="chat-toggle" aria-hidden="true"><i class="fas fa-chevron-down"></i></div></div>
    <div class="chat-content">
      <div class="message-panel">
        ${msg('Gravedigger', '14:10', 'anyone doing the bunker tonight?')}
        ${msg('Nyx', '14:11', 'ya, need 2 more')}
        ${msg('Me', '14:12', 'me too')}
      </div>
    </div>
  </div>
</div>`;

// Simulates Vue toggling a game chat when its header is clicked.
export function wireGameHeaders(root = document) {
  for (const header of root.querySelectorAll('.chat-containers > .chat-container > .chat-header')) {
    header.addEventListener('click', () => header.parentElement.classList.toggle('chat-minimized'));
  }
}

const qbtn = (iconClass, label, color = 'text-grey-4') =>
  `<div><button class="q-btn q-btn-item non-selectable no-outline q-btn--outline q-btn--rectangle ${color} q-btn--actionable q-focusable q-hoverable q-btn--wrap" tabindex="0" type="button"><span class="q-focus-helper" tabindex="-1"></span><span class="q-btn__content text-center col items-center q-anchor--skip justify-center row"><i class="q-icon fas ${iconClass} on-left" aria-hidden="true" role="img"></i><span class="block">${label}</span></span></button></div>`;

// The top bar's round mail icon must never be mistaken for the profile's Mail button.
export const TOP_BAR_HTML =
  '<div class="top-bar"><a class="q-btn q-btn-item non-selectable no-outline q-btn--flat q-btn--round text-grey-4" href="/mail"><span class="q-btn__content"><i class="q-icon fal fa-envelope" aria-hidden="true"></i></span></a></div>';

export const PROFILE_OTHER_HTML = `${TOP_BAR_HTML}<div class="profile-head"><div class="profile-actions">${qbtn('fa-ban', 'Block', 'text-red-4')}${qbtn('fa-exchange', 'Trade')}${qbtn('fa-envelope', 'Mail')}</div></div>`;

export const PROFILE_BLOCKED_HTML = `${TOP_BAR_HTML}<div class="profile-head"><div class="profile-actions">${qbtn('fa-ban', 'Unblock', 'text-red-4')}</div></div>`;

export const PROFILE_OWN_HTML = `${TOP_BAR_HTML}<div class="profile-head"><div>${qbtn('fa-cog', 'Settings')}</div></div>`;
