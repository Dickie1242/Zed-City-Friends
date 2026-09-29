// Only what the game's own (global) chat-dock CSS doesn't already provide. Colors come from the game's palette.
export const CSS = `
.zcf-root{display:contents}
.zcf [hidden]{display:none!important}
.zcf .chat-header{background:#090a0b}
.zcf.chat-container .chat-header{gap:6px}
.zcf.chat-container .chat-title{min-width:0}
.zcf-friends .chat-title .chat-icon{color:#3d8b40}
.chat-containers .zcf-friends{order:2}
.zcf .zcf-count{text-transform:none;letter-spacing:0;opacity:.6;font-weight:400}
.zcf .zcf-hbtn{background:none;border:0;padding:0 2px;margin:0;color:#ffffff4d;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center}
.zcf .zcf-hbtn:hover{color:#ffffffb3}
.zcf .chat-toggle{margin-left:0}
.zcf.chat-minimized .zcf-badge{position:absolute;top:-6px;right:2px;min-height:12px;padding:0 3px;font-size:8px;line-height:12px}
.zcf.chat-minimized .chat-title{justify-content:center;position:relative}
.zcf-body{display:flex;flex-direction:column;height:420px;position:relative;font-size:13px}
.zcf-dm .chat-content{display:flex;flex-direction:column}
.zcf-dm:not(.chat-minimized){height:450px}
.zcf-toolbar{display:flex;gap:6px;align-items:center;background:#ffffff05;border-bottom:1px solid #ffffff1a;min-height:42px;padding:7px 8px}
.zcf-search{flex:1;display:flex;align-items:center;gap:6px;background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:0 7px}
.zcf-search i{opacity:.45;font-size:11px}
.zcf-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#d9d9d9;font:inherit;font-size:12.5px;padding:5px 0}
.zcf-input::placeholder{color:#ffffff4d}
.zcf-iconbtn{width:30px;height:28px;display:flex;align-items:center;justify-content:center;background:#ffffff0a;border:1px solid #ffffff14;border-radius:3px;color:#a6a6a6;cursor:pointer}
.zcf-iconbtn:hover,.zcf-iconbtn.zcf-active{background:#3d8b40;border-color:#3d8b40;color:#fff}
.zcf-list{flex:1;overflow-y:auto;overscroll-behavior:contain}
.zcf-sec{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff59;padding:8px 10px 4px}
.zcf-row{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;position:relative}
.zcf-row:hover{background:#ffffff08}
.zcf-row-main{min-width:0;flex:1}
.zcf-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-name mark{background:#f2c03740;color:inherit;border-radius:2px}
.zcf-status{font-size:11px;opacity:.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-status.zcf-status-on{color:#6fcf73;opacity:.9}
.zcf-pill{background:#ff4242;color:#fff;font-size:9px;font-weight:700;border-radius:8px;padding:1px 5px}
.zcf-row-actions{display:none;gap:4px}
.zcf-row:hover .zcf-row-actions,.zcf-row:focus-within .zcf-row-actions{display:flex}
@media (hover:none){.zcf-row-actions{display:flex}}
.zcf-mini{background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font-size:10.5px;padding:3px 6px;cursor:pointer}
.zcf-mini:hover{background:#ffffff1f;color:#fff}
.zcf-mini.zcf-danger{background:#ff42421f;color:#ff8a8a}
.zcf-add{background:#3d8b40;border:0;border-radius:3px;color:#fff;font-size:10px;text-transform:uppercase;padding:3px 8px;cursor:pointer}
.zcf-add-outline{background:none;border:1px solid #3d8b4088;color:#6fcf73}
.zcf-done{font-size:10px;text-transform:uppercase;color:#6fcf73;padding:3px 4px}
.zcf-empty{padding:6px 10px 10px;font-size:11.5px;opacity:.45}
.zcf-av{position:relative;flex:none;display:inline-block;border-radius:50%}
.zcf-av-img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;background:#2c3036}
.zcf-dot{position:absolute;bottom:-1px;right:-1px;width:7px;height:7px;border-radius:50%;border:1px solid #151619}
.zcf-on{background:#3d8b40}.zcf-off{background:#ef5350}
.zcf-pop{position:absolute;top:44px;right:8px;width:260px;max-width:calc(100% - 16px);background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0;z-index:5;padding-bottom:4px}
.zcf-pop-title,.zcf-menu-title{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff66;padding:8px 10px 0}
.zcf-pop .zcf-input{display:block;width:calc(100% - 16px);margin:6px 8px;background:#0e1013;border:1px solid #0a748f;border-radius:3px;padding:6px 8px}
.zcf-results{max-height:240px;overflow-y:auto}
.zcf-result{display:flex;align-items:center;gap:8px;padding:6px 10px}
.zcf-result:hover{background:#ffffff08}
.zcf-menu{position:absolute;top:4px;right:8px;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0;z-index:6;min-width:160px;padding:4px 0}
.zcf-menu button{display:block;width:100%;text-align:left;background:none;border:0;color:#d9d9d9;font-size:12.5px;padding:7px 12px;cursor:pointer}
.zcf-menu button:hover{background:#ffffff0a}
.zcf-dm .chat-title .zcf-dm-name{text-transform:none;letter-spacing:0;font-weight:700;color:#d9d9d9;cursor:pointer;overflow:hidden;text-overflow:ellipsis}
.zcf-dm .chat-title .zcf-dm-name:hover{text-decoration:underline}
.zcf-dm .chat-title .zcf-dm-status{text-transform:none;letter-spacing:0;opacity:.55;white-space:nowrap}
.zcf-dm .chat-title .zcf-dm-status.zcf-status-on{color:#6fcf73;opacity:.9}
.zcf-dm.chat-minimized .zcf-close{position:absolute;top:-6px;left:-6px;width:14px;height:14px;border-radius:50%;background:#2c3036;color:#fff;font-size:8px;justify-content:center;display:none;padding:0}
.zcf-dm.chat-minimized:hover .zcf-close{display:flex}
.zcf-dm.chat-minimized .chat-header{position:relative}
.zcf-dm.chat-minimized .zcf-dm-name{display:none}
.zcf-notice{background:#f2c0371a;color:#f2c037;font-size:11.5px;padding:6px 12px;border-bottom:1px solid #f2c03733;flex:none}
.zcf-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 0 8px}
.zcf-loader{text-align:center;font-size:11px;opacity:.5;padding:6px}
.zcf-divider{display:flex;align-items:center;gap:8px;margin:10px 15px 2px;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#ffffff59}
.zcf-divider:before,.zcf-divider:after{content:"";flex:1;border-top:1px solid #ffffff14}
.zcf-msg{padding:2px 15px;margin-top:8px}
.zcf-msg.zcf-grouped,.zcf-pending-msg{margin-top:1px}
.zcf-msg:hover{background:#ffffff08}
.zcf-sender{font-weight:700;line-height:1.5}
.zcf-sender.zcf-them{color:#6fb3c8;cursor:pointer}
.zcf-sender.zcf-them:hover{text-decoration:underline}
.zcf-time{opacity:.4;margin-left:8px;font-size:11px}
.zcf-text{opacity:.9;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.zcf .zcf-gif{display:block;max-width:100%;max-height:200px;width:auto;height:auto;border-radius:4px;margin:4px 0}
.zcf-system .zcf-text{font-style:italic;opacity:.7}
.zcf-pending-msg .zcf-text{opacity:.55}
.zcf-failed .zcf-text{opacity:.5}
.zcf-error{color:#e57373;font-size:12px}
.zcf-link{background:none;border:0;padding:0;color:#e57373;text-decoration:underline;cursor:pointer;font:inherit}
.zcf-newchip{position:absolute;bottom:56px;left:50%;transform:translateX(-50%);background:#0a748f;color:#fff;border:0;border-radius:12px;font-size:11px;padding:3px 10px;cursor:pointer;box-shadow:0 4px 10px #0006}
.zcf-composer{display:flex;gap:6px;align-items:flex-end;border-top:1px solid #ffffff14;padding:8px;flex:none}
.zcf-compose{background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:6px 8px;resize:none;max-height:90px;line-height:1.4}
.zcf-send{background:#0a748f;color:#fff;border:0;border-radius:3px;font-size:10.5px;text-transform:uppercase;padding:7px 10px;cursor:pointer}
.zcf-send:disabled{opacity:.4;cursor:default}
.zcf-gifbtn{background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font-size:10.5px;font-weight:700;text-transform:uppercase;padding:7px 10px;cursor:pointer}
.zcf-gifbtn:hover{background:#ffffff1f;color:#fff}
.zcf-gifbtn:disabled{opacity:.4;cursor:default}
.zcf-gifbtn[aria-expanded="true"]{background:#3d8b40;color:#fff}
.zcf-gifpanel{flex:none;max-height:220px;overflow-y:auto;background:#16181c;border:1px solid #000;border-radius:4px;margin:0 8px;padding:8px}
.zcf-gif-search{display:block;box-sizing:border-box;width:100%;background:#0e1013;border:1px solid #0a748f;border-radius:3px;color:#d9d9d9;font:inherit;font-size:12px;padding:6px 8px;margin-bottom:6px}
.zcf-gif-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.zcf-gif-chip.zcf-active{background:#3d8b40;color:#fff}
.zcf-gif-status{font-size:11px;opacity:.5;text-align:center;padding:4px 0}
.zcf-gif-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.zcf-gif-thumb{display:block;width:100%;height:70px;object-fit:cover;border-radius:3px;background:#202327;cursor:pointer}
.zcf-gif-thumb:hover{outline:2px solid #0a748f}
.zcf-toasts{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:4000;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
.zcf-toast{background:#202327;color:#d9d9d9;border:1px solid #000;border-left:3px solid #3d8b40;border-radius:4px;padding:8px 12px;font-size:12.5px;box-shadow:0 6px 18px #00000080}
.zcf-toast-error{border-left-color:#ff4242}
.q-btn.zcf-is-friend{color:#81c784!important}
@media (min-width:600px){
  .chat-containers .zcf-dm.chat-minimized{width:auto;max-width:150px}
  .chat-containers .zcf-dm.chat-minimized .chat-header{padding:0 10px 0 8px}
  .chat-containers .zcf-dm.chat-minimized .chat-title{justify-content:flex-start;gap:6px}
  .chat-containers .zcf-dm.chat-minimized .zcf-dm-name{display:inline-block;white-space:nowrap;flex:1;min-width:0}
}
@media (max-width:599.98px){
  .chat-containers .zcf.zcf-open{order:3;flex:1 1 340px;width:auto;min-width:0;max-width:340px}
  .zcf-body{height:min(420px,60vh)}
  .zcf-dm:not(.chat-minimized){height:min(450px,60vh)}
}
`;

export function injectStyles(doc = document) {
  if (doc.getElementById('zcf-styles')) return;
  const style = doc.createElement('style');
  style.id = 'zcf-styles';
  style.textContent = CSS;
  doc.head.appendChild(style);
}
