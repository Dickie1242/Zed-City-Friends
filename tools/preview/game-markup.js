// The game's logged-in markup for the preview harness, trimmed from the live client (see also
// test/fixtures/game-dom.js): the header's icon group, a page, and the chat dock with Faction, Global and
// Activity chats.
const msg = (name, time, text) =>
  `<div class="msg-cont"><div><div><div><div><span class="sender-name">${name}</span><span class="text-grey-7" style="margin-left:8px;font-size:11px">${time}</span></div><div>${text}</div></div></div></div></div>`;

const roundBtn = (href, iconClass, count) =>
  `<div><a class="q-btn q-btn-item non-selectable no-outline q-btn--flat q-btn--round ${count ? 'text-grey-4' : 'text-grey-7'} q-btn--actionable q-focusable q-hoverable" tabindex="0" href="${href}" style="font-size: 10px;"><span class="q-focus-helper"></span><span class="q-btn__content text-center col items-center q-anchor--skip justify-center row"><i class="q-icon fas ${iconClass}" aria-hidden="true" role="img"></i>${count ? `<div class="q-badge flex inline items-center no-wrap q-badge--single-line bg-red-5 text-white q-badge--floating q-badge--rounded" role="status">${count}</div>` : ''}</span></a></div>`;

export const HEADER = `
<header class="q-header q-layout__section--marginal fixed-top text-white q-pt-xs" style="background:#090a0b;height:55px">
  <div class="q-toolbar row no-wrap items-center">
    <div class="col row items-center"><div class="text-h6" style="font-family:Oswald,sans-serif;letter-spacing:.05em">ZED CITY</div></div>
    <div class="no-wrap col-auto">
      <div class="full-width q-gutter-xs row items-center justify-end">
        ${roundBtn('/mail', 'fa-envelope', 2)}
        ${roundBtn('/notifications', 'fa-bell', 0)}
      </div>
    </div>
  </div>
</header>`;

export const CITY_PAGE = `<main class="q-page q-layout-padding" style="padding-top:24px;color:#d9d9d9">
  <div class="text-h4 text-uppercase text-no-bg" style="text-align:center">City</div>
  <div style="max-width:900px;margin:20px auto;background:#202327;border:1px solid #000;border-radius:4px;height:420px"></div>
</main>`;

export const PAGE_404 = '<div class="fixed-center text-center"><p class="text-faded">Sorry, nothing here...</p></div>';

const qbtn = (iconClass, label, color = 'text-grey-4') =>
  `<div><button class="q-btn q-btn-item non-selectable no-outline q-btn--outline q-btn--rectangle ${color} q-btn--actionable q-focusable q-hoverable q-btn--wrap" tabindex="0" type="button"><span class="q-focus-helper" tabindex="-1"></span><span class="q-btn__content text-center col items-center q-anchor--skip justify-center row"><i class="q-icon fas ${iconClass} on-left" aria-hidden="true" role="img"></i><span class="block">${label}</span></span></button></div>`;

export const PROFILE_PAGE = `<main class="q-page q-layout-padding" style="padding-top:24px;color:#d9d9d9">
  <div class="text-h4 text-uppercase text-no-bg" style="text-align:center">Rustbucket</div>
  <div class="profile-actions row justify-center q-gutter-sm" style="margin-top:16px">${qbtn('fa-ban', 'Block', 'text-red-4')}${qbtn('fa-exchange', 'Trade')}${qbtn('fa-envelope', 'Mail')}</div>
</main>`;

const composer = '<div style="padding:8px;border-top:1px solid #ffffff0f"><div style="background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:6px 8px;color:#ffffff4d;font-size:12px">Type a message…</div></div>';

export const DOCK_HTML_FULL = `
<div class="chat-containers">
  <!--v-if-->
  <div class="chat-container activity-chat chat-minimized">
    <div class="chat-header"><div class="chat-title"><i class="fas fa-radar chat-icon" aria-hidden="true"></i></div></div>
    <div class="chat-content chat-hidden"></div>
  </div>
  <div class="chat-container faction-chat chat-minimized">
    <div class="chat-header"><div class="chat-title"><i class="fas fa-users chat-icon" aria-hidden="true"></i></div></div>
    <div class="chat-content chat-hidden"></div>
  </div>
  <div class="chat-container general-chat">
    <div class="chat-header"><div class="chat-title"><i class="fas fa-comments chat-icon" aria-hidden="true"></i><span>Chat</span></div><div class="chat-toggle" aria-hidden="true"><i class="fas fa-chevron-down"></i></div></div>
    <div class="chat-content">
      <div class="live-chat" style="display:flex;flex-direction:column;height:100%">
        <div class="message-panel" style="flex:auto;min-height:0;overflow-y:auto;padding:4px 0 8px;font-size:13px;height:360px">
          ${msg('Gravedigger', '14:10', 'anyone doing the bunker tonight?')}
          ${msg('Nyx', '14:11', 'ya, need 2 more')}
          ${msg('Rustbucket', '14:11', 'I can bring the crowbars')}
          ${msg('Me', '14:12', 'me too')}
          ${msg('Hollow', '14:13', 'selling 40 nails, pm me')}
          ${msg('Gravedigger', '14:14', 'meet at the gate in 10')}
          ${msg('Moth', '14:15', 'omw')}
        </div>
        ${composer}
      </div>
    </div>
  </div>
</div>`;
