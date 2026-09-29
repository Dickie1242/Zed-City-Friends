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

const roundBtn = (href, iconClass, count) =>
  `<div><a class="q-btn q-btn-item non-selectable no-outline q-btn--flat q-btn--round ${count ? 'text-grey-4' : 'text-grey-7'} q-btn--actionable q-focusable q-hoverable" tabindex="0" href="${href}" style="font-size: 10px;"><span class="q-focus-helper"></span><span class="q-btn__content text-center col items-center q-anchor--skip justify-center row"><i class="q-icon fal ${iconClass}" aria-hidden="true" role="img"></i>${count ? `<div class="q-badge flex inline items-center no-wrap q-badge--single-line bg-red-5 text-white q-badge--floating q-badge--rounded" role="status">${count}</div>` : ''}</span></a></div>`;

// The logged-in layout's header, trimmed to the right-hand icon group: [Mail][Notifications][Profile menu].
export const HEADER_HTML = `
<header class="q-header q-layout__section--marginal fixed-top text-white q-pt-xs">
  <div class="q-toolbar row no-wrap items-center">
    <div class="col row items-center">
      <div class="no-wrap col-xs-4 order-xs-first order-sm-none col-sm-auto">
        <div class="full-width q-gutter-xs row items-center justify-end">
          ${roundBtn('/mail', 'fa-envelope', 2)}
          ${roundBtn('/notifications', 'fa-bell', 0)}
          <div><button class="q-btn q-btn-item non-selectable no-outline q-btn--flat q-btn--rectangle q-btn--dense profile-menu" type="button"><span class="q-btn__content"><i class="q-icon fas fa-caret-down" aria-hidden="true"></i></span></button></div>
        </div>
      </div>
    </div>
  </div>
</header>`;

// The page slot while the layout's catch-all 404 route is showing (any unknown path, e.g. /friends).
export const PAGE_404_HTML = '<div class="q-page-container"><div class="fixed-center text-center"><p class="text-faded">Sorry, nothing here...</p></div></div>';
