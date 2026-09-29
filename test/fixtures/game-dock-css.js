// The game's chat-dock rules, verbatim from its LoggedIn-D0NLSdcY.css (live build 1.4.4-live-cfe496c521c3-125,
// fetched 2026-09-28), one rule per line. Vite adds that stylesheet to <head> lazily, when the logged-in layout
// first loads, so it can land before or after ours: test/ui/styles.test.js checks our rules win either way.
export const GAME_DOCK_CSS = `
.fullscreen-chat-active .chat-containers,.fullscreen-chat-active .chat-container,.fullscreen-chat-active .chat-container *{transition:none!important;animation:none!important}
.fullscreen-chat-active .chat-header{height:40px}
.fullscreen-chat-active .chat-containers{inset:var(--zed-safe-area-top) 0 var(--zed-safe-area-bottom) 0;z-index:3000;background:#000000eb;flex-direction:column;justify-content:flex-start;align-items:stretch;gap:0;width:100vw;height:auto;margin:0;padding:0;position:fixed;overflow:hidden}
.fullscreen-chat-active .chat-containers.single-chat-mode{bottom:0}
.fullscreen-chat-active .chat-container{flex:auto;height:auto;max-height:none;border-radius:0!important;width:100%!important;min-width:100%!important;max-width:100%!important}
.fullscreen-chat-active .chat-container .chat-header{border-radius:0}
.fullscreen-chat-active .chat-container .chat-content{-webkit-overflow-scrolling:touch;flex-direction:column;flex:auto;min-height:0;display:flex;overflow-y:auto;height:auto!important;max-height:none!important}
.fullscreen-chat-active .chat-container.chat-open-full{width:100%!important;min-width:100%!important;max-width:100%!important}
.fullscreen-chat-active .chat-container.chat-minimized{display:none!important}
.fullscreen-chat-active .chat-containers{display:flex}
.fullscreen-chat-active .chat-container:not(.chat-minimized){flex:auto;height:100%;max-height:100%}
.chat-containers.fullscreen-mobile-chat{overscroll-behavior:none;touch-action:none;top:var(--zed-vv-offset-top,0px)!important;width:100vw!important;height:var(--zed-vv-height,100dvh)!important;padding:var(--zed-safe-area-top) 0 var(--zed-safe-area-bottom) 0!important;z-index:3000!important;background:#000000eb!important;flex-direction:column!important;align-items:stretch!important;gap:0!important;margin:0!important;display:flex!important;position:fixed!important;bottom:auto!important;left:0!important;right:0!important;overflow:hidden!important}
.chat-containers.fullscreen-mobile-chat .chat-header,.chat-containers.fullscreen-mobile-chat .chat-toolbar{touch-action:none}
.chat-containers.fullscreen-mobile-chat,.chat-containers.fullscreen-mobile-chat .chat-container,.chat-containers.fullscreen-mobile-chat .chat-container *{transition:none!important;animation:none!important}
.chat-containers.fullscreen-mobile-chat .chat-container.chat-minimized{display:none!important}
.chat-containers.fullscreen-mobile-chat .chat-container{border-radius:0!important;flex:auto!important;width:100%!important;min-width:100%!important;max-width:100%!important;height:auto!important;max-height:none!important}
.chat-containers.fullscreen-mobile-chat .chat-container.chat-open-full{width:100%!important;min-width:100%!important;max-width:100%!important}
.chat-containers.fullscreen-mobile-chat .chat-content{flex-direction:column!important;flex:auto!important;height:auto!important;min-height:0!important;max-height:none!important;display:flex!important;overflow:hidden!important}
.chat-containers.fullscreen-mobile-chat .message-panel{touch-action:pan-y;overscroll-behavior:contain}
.chat-containers{bottom:calc(-1px + var(--zed-safe-area-bottom));z-index:1000;box-sizing:border-box;pointer-events:none;align-items:end;gap:5px;transition:bottom .3s cubic-bezier(.4,0,.2,1);display:flex;position:fixed;right:20px}
@media (max-width:599.98px){
.chat-containers{width:auto;max-width:calc(100vw - 20px);left:auto;right:10px;bottom:calc(54px + var(--zed-safe-area-bottom));flex-direction:row;justify-content:flex-end;gap:5px}
.chat-containers.menu-hidden{bottom:var(--zed-safe-area-bottom)}
.chat-containers{transition:none}
}
.chat-containers.single-chat-mode{width:auto;left:auto;right:10px;bottom:calc(54px + var(--zed-safe-area-bottom));flex-flow:row;align-items:flex-end;padding:0;transition:bottom .3s cubic-bezier(.4,0,.2,1)}
@media (max-width:599.98px){
.chat-containers.single-chat-mode{width:auto;max-width:none;left:auto;right:10px}
}
.chat-containers.single-chat-mode.menu-hidden{bottom:var(--zed-safe-area-bottom)}
.chat-containers.single-chat-mode .chat-container{margin:0}
.chat-containers.single-chat-mode .chat-container.chat-minimized{flex:none}
.chat-containers.single-chat-mode .chat-container:not(.chat-minimized){flex:auto;min-width:0}
@media (max-width:599.98px){
.chat-containers.single-chat-mode.hide-minimized-tabs .chat-container.chat-minimized{display:none}
}
.chat-container{box-sizing:border-box;pointer-events:auto;flex-direction:column;width:350px;max-height:500px;transition:all .3s;display:flex}
.chat-container.faction-chat .chat-header{background:#090a0b}
.chat-container.faction-chat .chat-header .chat-title i{color:#9c27b0}
.chat-container.general-chat .chat-header{background:#090a0b}
.chat-container.general-chat .chat-header .chat-title i{color:#0a748f}
.chat-container.activity-chat .chat-header{background:#090a0b}
.chat-container.activity-chat .chat-header .chat-title i{color:#ff9800}
.chat-container.chat-minimized{width:44px;max-width:44px;max-height:40px;box-shadow:0 6px 14px #00000059}
.chat-container.chat-minimized .chat-header{background:#040505;border-color:#0f0f0f;border-radius:6px;justify-content:center;height:40px;padding:0}
.chat-container.chat-minimized .chat-header .chat-title{justify-content:center;gap:0;position:relative}
.chat-container.chat-minimized .unread-badge{min-height:12px;padding:0 3px;font-size:8px;line-height:12px;position:absolute;top:-6px;right:2px}
.chat-container .chat-header{text-align:left;white-space:nowrap;color:#a6a6a6;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;-webkit-user-select:none;-moz-user-select:none;user-select:none;border:1px solid #000;border-radius:4px 4px 0 0;justify-content:flex-start;align-items:center;width:100%;padding:8px 12px;font-size:11px;transition:background .2s;display:flex}
.chat-container .chat-header:hover{background-color:#0e0f11}
.chat-container .chat-header:hover .chat-toggle{color:#ffffffb3}
.chat-container .chat-header .chat-title{justify-content:flex-start;align-items:center;gap:6px;width:100%;font-weight:500;display:flex}
.chat-container .chat-header .chat-title .chat-icon{font-size:18px;line-height:1;color:currentColor!important}
.chat-container .chat-header .chat-title .unread-indicator{color:#fff;opacity:.45}
.chat-container .chat-header .chat-toggle{color:#ffffff4d;align-items:center;margin-left:auto;font-size:12px;display:flex}
.chat-container .chat-content{color:#d9d9d9;box-sizing:border-box;background-color:#202327;border-top:1px solid #ffffff0f;border-left:1px solid #000;border-right:1px solid #000;border-radius:0 0 4px 4px;flex:auto;width:100%;height:auto;min-height:0;transition:opacity .3s,visibility .3s;display:block;overflow:hidden}
.chat-container .chat-content.chat-hidden{opacity:0;visibility:hidden;height:0;overflow:hidden}
@media (max-width:1023.98px){
.chat-container{width:340px}
.chat-container .chat-content{height:calc(100% - 30px)}
}
@media (max-width:599.98px){
.chat-container{width:340px;max-width:340px;transition:none}
.chat-container .chat-content{height:calc(100% - 30px)}
.chat-container.chat-minimized{width:44px;max-width:44px;max-height:40px}
.chat-container .chat-header{padding:6px 10px}
.chat-container .chat-header .chat-title .chat-icon{font-size:20px}
.chat-container.chat-minimized .chat-header .chat-title{justify-content:center;gap:0;position:relative}
.chat-container.chat-minimized .chat-header .chat-title .unread-badge{min-height:12px;padding:0 3px;font-size:8px;line-height:12px;position:absolute;top:-6px;right:2px}
.single-chat-mode .chat-container.chat-open-full{flex:none;width:340px;min-width:340px;max-width:340px}
.single-chat-mode .chat-container.chat-minimized{width:44px;max-width:44px;max-height:40px}
}
.chat-container.chat-open-full{box-shadow:0 6px 18px #00000047}
.chat-container.chat-open-full .chat-content{-webkit-overflow-scrolling:touch;max-height:calc(100% - 34px);overflow-y:auto}
`;
