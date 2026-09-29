// Only what the game's own (global) chat-dock CSS doesn't already provide. Colors come from the game's palette.
// The game's dock stylesheet is loaded lazily and can land after ours, so a rule that overrides one of its rules
// must use a more specific selector; never rely on source order (test/ui/styles.test.js checks this).
export const CSS = `
.zcf-root{display:contents}
.zcf [hidden]{display:none!important}
.zcf .chat-header{background:#090a0b}
.zcf.chat-container .chat-header{gap:6px}
.zcf.chat-container .chat-title{min-width:0}
.zcf .zcf-hbtn{background:none;border:0;padding:0 2px;margin:0;color:#ffffff4d;cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center}
.zcf .zcf-hbtn:hover{color:#ffffffb3}
.zcf .chat-toggle{margin-left:0}
.zcf.chat-minimized .zcf-badge{position:absolute;top:-6px;right:2px;min-height:12px;padding:0 3px;font-size:8px;line-height:12px}
.zcf.chat-minimized .chat-title{justify-content:center;position:relative}
.zcf-body{position:relative;font-size:13px}
.zcf.chat-container .chat-content{display:flex;flex-direction:column}
.zcf-dm:not(.chat-minimized){height:450px}
.chat-container.zcf-pm .chat-header .chat-title .chat-icon{color:#629464!important}
.chat-container.zcf-pm .chat-header:hover .chat-title .chat-icon{color:#3d8b40!important}
body .chat-containers > .chat-container.faction-chat > .chat-header .chat-icon.fa-users:before{content:"\\f6bb"}
.chat-containers .zcf-pm{order:2}
.zcf-pm:not(.chat-minimized){height:450px}
.zcf-pm-main{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.zcf-pm-tabs{display:flex;flex:none;background:#090a0b;border-bottom:1px solid #000}
.zcf-pm-tab{flex:1 1 0;min-width:0;height:32px;padding:0 4px;background:none;border:0;color:#9e9e9e;font-family:Oswald,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.03em;cursor:pointer}
.zcf-pm-tab:hover{color:#e0e0e0}
.zcf-pm-tab.zcf-pm-tab-on{background:#0f1114;color:#e6e6e6;box-shadow:inset 0 2px 0 #0a748f}
.zcf-pm .zcf-toolbar{flex:none}
.zcf-pm-line{display:flex;align-items:center;gap:6px;min-width:0}
.zcf-pm-line .zcf-name{min-width:0}
.zcf-pm-time{margin-left:auto;flex:none;font-size:10.5px;opacity:.45;white-space:nowrap}
.zcf-pm-line .zcf-pm-pin{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-right:-4px;padding:0;background:none;border:0;border-radius:3px;color:#ffffff59;font-size:10px;cursor:pointer;opacity:0}
.zcf-row:hover .zcf-pm-line .zcf-pm-pin,.zcf-row:focus-within .zcf-pm-line .zcf-pm-pin,.zcf-pm-line .zcf-pm-pin.zcf-pinned{opacity:1}
.zcf-pm-line .zcf-pm-pin:hover,.zcf-pm-line .zcf-pm-pin:focus-visible{color:#e0e0e0;background:#ffffff14}
.zcf-pm-line .zcf-pm-pin.zcf-pinned{color:#f2c037}
@media (hover:none){.zcf-pm-line .zcf-pm-pin{opacity:1}}
.zcf-pm-preview.zcf-unread{color:#fff;opacity:1;font-weight:500}
.zcf-pill.zcf-pill-green{background:#3d8b40}
.zcf-pill.zcf-pill-dim{opacity:.45}
.zcf-pm-more,.zcf-pm-foot{display:block;width:100%;background:none;border:0;border-top:1px solid #ffffff0d;color:#6fb3c8;font:inherit;font-size:11.5px;padding:8px 10px;text-align:center;cursor:pointer}
.zcf-pm-more:hover,.zcf-pm-foot:hover{background:#ffffff08}
.zcf-pm-more:disabled{opacity:.5;cursor:default}
.zcf-pm-retry{color:#6fb3c8}
.zcf-pm-confirm .zcf-row-main{font-size:12.5px}
.zcf-enemy-mark{color:#ef5350;font-size:.85em;margin-right:4px}
.zcf-muted-mark{font-size:.85em;margin-left:5px;opacity:.5}
.chat-containers > .chat-container:not(.zcf) .msg-cont:has(.zcf-mention-flag){background:#f2c03714;box-shadow:inset 3px 0 #f2c037}
::highlight(zcf-mention){color:#f2c037}
.chat-containers .zcf-settings{order:4}
.zcf-settings:not(.chat-minimized) .chat-content{overflow-y:auto}
.zcf-set{padding:2px 0 8px}
.zcf-set-sec{padding:8px 12px;border-bottom:1px solid #ffffff0d}
.zcf-set-sec:last-child{border-bottom:0}
.zcf-set-h{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff59;margin-bottom:6px}
.zcf-set-btns{display:flex;flex-wrap:wrap;gap:6px}
.zcf-set-chat{display:flex;align-items:center;gap:8px;padding:4px 0}
.zcf-set-lock{width:14px;flex:none;text-align:center;color:#9e9e9e;font-size:11px}
.zcf-set-all{margin-top:6px}
.zcf-set-sound{display:flex;align-items:center;gap:8px;font-size:12.5px}
.zcf-set-sound span{flex:1}
.zcf-set-select{background:#14171a;border:1px solid #ffffff14;border-radius:3px;color:#d9d9d9;font:inherit;font-size:12px;padding:3px 6px}
.zcf-set-play:disabled{opacity:.4;cursor:default}
.zcf-set-about{font-size:12px;opacity:.6}
.zcf-set-toggle{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px;cursor:pointer}
.zcf-set-toggle input{margin:0;accent-color:#0a748f;cursor:pointer}
.zcf-set-toggle input:disabled{cursor:default}
.zcf-set-toggle input:disabled + span{opacity:.45}
.zcf-set-sub{padding-left:22px}
.zcf-set-note{font-size:11px;color:#f2c037;padding:2px 0 4px 22px}
.zcf-set-dev{display:inline-block;margin-top:8px;color:#6fb3c8;font-size:11px;text-decoration:none;opacity:.8}
.zcf-set-dev:hover{opacity:1;text-decoration:underline}
.zcf-set-dev i{font-size:10px}
.zcf-news-toggle{display:block;background:none;border:0;padding:6px 0 0;color:#6fb3c8;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.zcf-news-toggle:hover{text-decoration:underline}
.zcf-news-ver{margin-top:8px}
.zcf-news-vh{display:flex;gap:8px;align-items:baseline;font-size:12px;font-weight:700}
.zcf-news-date{font-size:11px;font-weight:400;opacity:.45}
.zcf-news-f{margin-top:5px}
.zcf-news-ft{font-size:12px;color:#e0e0e0}
.zcf-news-f ul{margin:2px 0 0;padding-left:16px;font-size:11.5px;opacity:.75}
.zcf-cc{display:inline-flex;align-items:center;gap:2px;flex:none;margin-left:6px;text-transform:none;letter-spacing:0;font-weight:400}
.chat-container.chat-minimized .zcf-cc{display:none}
.zcf-cc [hidden]{display:none!important}
.zcf-cc-icon{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;padding:0;background:none;border:0;color:#ffffff4d;font-size:11px;cursor:pointer}
.zcf-cc-icon:hover{color:#ffffffb3}
.zcf-cc-lock.zcf-cc-unlocked{color:#f2c037}
.zcf-cc-inline{display:inline-flex;align-items:center;gap:3px;margin-right:4px;color:#d9d9d9;font-size:11px}
.zcf-cc-step,.zcf-cc-btn{height:18px;min-width:18px;display:inline-flex;align-items:center;justify-content:center;padding:0 5px;background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font:inherit;font-size:11px;line-height:1;cursor:pointer}
.zcf-cc-step:hover,.zcf-cc-btn:hover{background:#ffffff1f;color:#fff}
.zcf-cc-btn:disabled,.zcf-cc-step:disabled{opacity:.4;cursor:default}
.zcf-cc-value{min-width:34px;text-align:center;font-variant-numeric:tabular-nums}
.zcf-grip{position:absolute;z-index:10;background:transparent;touch-action:none;user-select:none}
.zcf-grip:hover{background:#0a748f59}
.zcf-grip-n{top:0;left:0;right:0;height:6px;cursor:ns-resize}
.zcf-grip-s{bottom:0;left:0;right:0;height:6px;cursor:ns-resize}
.zcf-grip-nw{top:0;left:0;width:12px;height:12px;cursor:nwse-resize;z-index:11}
.zcf-grip-se{right:0;bottom:0;width:12px;height:12px;cursor:nwse-resize;z-index:11}
html.zcf-dragging,html.zcf-dragging *{cursor:grabbing!important;user-select:none!important}
html.zcf-resizing,html.zcf-resizing *{user-select:none!important}
.zcf-cmenu{position:fixed;z-index:4000;min-width:210px;padding:6px 0;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0;color:#d9d9d9;font-size:12.5px}
.zcf-cmenu[hidden]{display:none}
.zcf-cmenu-title{padding:2px 12px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#ffffff66}
.zcf-cmenu-row{display:flex;align-items:center;gap:6px;padding:4px 12px}
.zcf-cmenu-label{flex:1}
.zcf-toolbar{display:flex;gap:6px;align-items:center;background:#ffffff05;border-bottom:1px solid #ffffff1a;min-height:42px;padding:7px 8px}
.zcf-search{flex:1;display:flex;align-items:center;gap:6px;background:#14171a;border:1px solid #ffffff14;border-radius:3px;padding:0 7px}
.zcf-search i{opacity:.45;font-size:11px}
.zcf-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#d9d9d9;font:inherit;font-size:12.5px;padding:5px 0}
.zcf-input::placeholder{color:#ffffff4d}
.zcf-list{flex:1;overflow-y:auto;overscroll-behavior:contain}
.zcf-row{display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;position:relative}
.zcf-row:hover{background:#ffffff08}
.zcf-row-main{min-width:0;flex:1}
.zcf-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-name mark{background:#f2c03740;color:inherit;border-radius:2px}
.zcf-status{font-size:11px;opacity:.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-status.zcf-status-on{color:#6fcf73;opacity:.9}
.zcf-pill{background:#ff4242;color:#fff;font-size:9px;font-weight:700;border-radius:8px;padding:1px 5px}
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
.zcf-new-line{display:flex;align-items:center;gap:8px;margin:8px 15px 2px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#6fcf73}
.zcf-new-line:before,.zcf-new-line:after{content:"";flex:1;border-top:1px solid #3d8b40aa}
.zcf-tip{position:fixed;z-index:4001;pointer-events:none;padding:4px 8px;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 4px 12px #00000080;color:#e0e0e0;font-size:11px;line-height:1.45;white-space:nowrap}
.zcf-tip-ago{opacity:.55}
.zcf-tip[hidden]{display:none}
.zcf-msg{padding:2px 15px;margin-top:8px}
.zcf-msg.zcf-grouped,.zcf-pending-msg{margin-top:1px}
.zcf-msg:hover{background:#ffffff08}
.zcf-sender{font-weight:700;line-height:1.5}
.zcf-sender.zcf-them{color:#6fb3c8;cursor:pointer}
.zcf-sender.zcf-them:hover{text-decoration:underline}
.zcf-dm:not(.zcf-enemy) .zcf-them .zcf-enemy-mark{display:none}
.zcf-dm.chat-minimized .chat-title .zcf-enemy-mark{display:none}
.msg-cont .zcf-enemy-mark{margin-right:4px}
.zcf-time{opacity:.4;margin-left:8px;font-size:11px}
.zcf-text{opacity:.9;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.zcf .zcf-gif{display:block;max-width:100%;max-height:200px;width:auto;height:auto;border-radius:4px;margin:4px 0}
.zcf .zcf-emoji{height:1.35em;width:auto;vertical-align:-0.3em;display:inline;margin:0 1px}
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
.zcf-emojibtn{background:#ffffff0f;border:0;border-radius:3px;color:#ffffffa6;font-size:14px;padding:7px 9px;cursor:pointer;line-height:1;display:flex;align-items:center}
.zcf-emojibtn:hover{background:#ffffff1f;color:#fff}
.zcf-emojibtn:disabled{opacity:.4;cursor:default}
.zcf-emojibtn[aria-expanded="true"]{background:#3d8b40;color:#fff}
.zcf-empanel{flex:none;max-height:240px;overflow-y:auto;background:#16181c;border:1px solid #000;border-radius:4px;margin:0 8px;padding:8px}
.zcf-em-search{display:block;box-sizing:border-box;width:100%;background:#0e1013;border:1px solid #0a748f;border-radius:3px;color:#d9d9d9;font:inherit;font-size:12px;padding:6px 8px;margin-bottom:6px}
.zcf-em-tabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.zcf-em-tab{display:flex;align-items:center;justify-content:center}
.zcf-em-tab.zcf-active{background:#3d8b40;color:#fff}
.zcf-em-tab-icon{width:11px;height:11px;display:block}
.zcf-em-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.zcf-em-btn{width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:0;border-radius:3px;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:0}
.zcf-em-btn:hover{background:#ffffff14}
.zcf-em-img{width:22px;height:22px;object-fit:contain;display:block}
.zcf-em-empty{grid-column:1/-1;font-size:11px;opacity:.5;text-align:center;padding:10px 0}
.zcf-toasts{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:4000;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
.zcf-toast{background:#202327;color:#d9d9d9;border:1px solid #000;border-left:3px solid #3d8b40;border-radius:4px;padding:8px 12px;font-size:12.5px;box-shadow:0 6px 18px #00000080}
.zcf-toast-error{border-left-color:#ff4242}
.q-btn.zcf-is-friend{color:#81c784!important}
.q-btn.zcf-is-enemy{color:#ef5350!important}
.zcf-page{max-width:1000px;margin:0 auto;color:#d9d9d9;font-size:13px}
.zcf-page-title{display:flex;align-items:center;margin-bottom:16px}
.zcf-page-side{flex:1;display:flex;align-items:center;min-width:0}
.zcf-page-side-r{justify-content:flex-end}
.zcf-page-mid{text-align:center}
.zcf-page-htabs{display:flex;justify-content:center;gap:18px}
.zcf-page .zcf-page-h{color:#e0e0e0;text-decoration:none;opacity:.35;transition:opacity .15s}
.zcf-page .zcf-page-h:hover{opacity:.7}
.zcf-page .zcf-page-h.zcf-page-h-on{opacity:1}
.zcf-page .zcf-name-row{display:flex;align-items:center;gap:6px}
.zcf-page .zcf-name-row > .zcf-enemy-mark{margin:0}
.zcf-page-sub{font-size:12px;color:#9e9e9e;margin-top:2px}
.zcf-page-back{display:inline-flex;align-items:center;gap:6px;color:#bdbdbd;font-size:12px;text-transform:uppercase;text-decoration:none;padding:4px 8px;border-radius:4px}
.zcf-page-back:hover{background:#ffffff0d;color:#e0e0e0}
.zcf-page-back i{font-size:10px}
.zcf-page-addwrap{position:relative}
.zcf-page-add{display:inline-flex;align-items:center;gap:6px;background:none;border:1px solid #e0e0e0aa;border-radius:4px;color:#e0e0e0;font:inherit;font-size:12px;text-transform:uppercase;padding:5px 10px;cursor:pointer}
.zcf-page-add:hover,.zcf-page-add.zcf-page-add-on{background:#ffffff14}
.zcf-page-add i{font-size:10px}
.zcf-page-add-short{display:none}
.zcf-page .zcf-pop{top:calc(100% + 6px);right:0;max-width:calc(100vw - 32px)}
.zcf-page-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.zcf-page-tabs{display:flex;gap:4px}
.zcf-page-tab{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;background:#121417f5;border:1px solid #000;border-radius:4px;color:#9e9e9e;font-family:Oswald,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:.03em;cursor:pointer}
.zcf-page-tab b{font-weight:400;opacity:.55}
.zcf-page-tab:hover{color:#e0e0e0}
.zcf-page-tab.zcf-page-tab-on{background:#0f1114;color:#e6e6e6;box-shadow:inset 0 2px 0 #0a748f}
.zcf-page-search{display:flex;align-items:center;gap:8px;margin-left:auto;width:260px;height:36px;padding:0 10px;background:#ffffff26;border-radius:4px}
.zcf-page-search i{font-size:12px;opacity:.6}
.zcf-page-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#e0e0e0;font:inherit;font-size:13px}
.zcf-page-input::placeholder{color:#ffffff80}
.zcf-page-panel{background:#202327;border:1px solid #000;border-radius:4px}
.zcf-page-table{width:100%;border-collapse:collapse}
.zcf-page-table th{background:#090a0b;color:#a6a6a6;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;text-align:left;white-space:nowrap;padding:10px 12px;border-bottom:1px solid #000}
.zcf-page-table td{padding:6px 12px;border-top:1px solid #2b3035;border-bottom:1px solid #090a0b;vertical-align:middle}
.zcf-page-sort{background:none;border:0;padding:0;color:inherit;font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer}
.zcf-page-sort:hover,.zcf-page-sort.zcf-page-sort-on{color:#e0e0e0}
.zcf-page-arrow{color:#0d9bbf;margin-left:4px;font-size:9px}
.zcf-page-table .zcf-col-level{width:60px}
.zcf-page-table .zcf-col-status,.zcf-page-table .zcf-col-faction{white-space:nowrap}
.zcf-page-table .zcf-col-note{width:32%;max-width:0}
.zcf-page-table .zcf-col-act{width:1%;white-space:nowrap}
.zcf-chip{display:inline-flex;align-items:center;gap:8px;min-width:160px;max-width:230px;padding:2px 10px 2px 2px;background:#151619;border-radius:6px;color:#d9d9d9;text-decoration:none}
.zcf-chip:hover{background:#0e0f11}
.zcf-page .zcf-chip .zcf-av-img{border-radius:4px}
.zcf-page .zcf-chip .zcf-dot{width:8px;height:8px;border-width:2px;bottom:-2px;right:-2px}
.zcf-chip-name{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zcf-page mark{background:#f2c03740;color:inherit;border-radius:2px}
.zcf-c-sub{display:none;font-size:11px;color:#9e9e9e;margin-top:3px}
.zcf-c-subnote{font-style:italic}
.zcf-st-on{color:#69f0ae}
.zcf-st-off{color:#ef5350}
.zcf-st-unknown{color:#9e9e9e}
.zcf-st-icon{color:#90a4ae;margin-left:7px;font-size:13px}
.zcf-fac{display:inline-flex;align-items:center;gap:6px;color:#bdbdbd;text-decoration:none}
.zcf-fac:hover{color:#e0e0e0;text-decoration:underline}
.zcf-fac i{color:#90a4ae;font-size:11px}
.zcf-dim{opacity:.35}
.zcf-note{display:block;width:100%;background:none;border:0;padding:2px 0;color:#9e9e9e;font:inherit;font-style:italic;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text}
.zcf-note:hover{color:#d9d9d9}
.zcf-note.zcf-note-empty{opacity:.4}
.zcf-page-row.zcf-editing td{background:#0a748f14}
.zcf-note-input{display:block;box-sizing:border-box;width:100%;background:#0e1013;border:1px solid #0a748f;border-radius:3px;outline:0;color:#d9d9d9;font:inherit;font-size:12.5px;padding:5px 8px}
.zcf-note-hint{font-size:10.5px;color:#9e9e9e;margin-top:4px}
.zcf-acts{display:flex;justify-content:flex-end;gap:4px;position:relative}
.zcf-act{position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:26px;background:#ffffff0d;border:0;border-radius:4px;color:#bdbdbd;font-size:12px;cursor:pointer}
.zcf-act:hover{background:#ffffff1f;color:#fff}
.zcf-act.zcf-act-msg{background:#0a748f;color:#fff}
.zcf-act.zcf-act-msg:hover{background:#0c86a6}
.zcf-act .zcf-pill{position:absolute;top:-6px;right:-6px}
.zcf-act.zcf-act-more{display:none}
.zcf-page-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:10;min-width:140px;padding:4px 0;background:#16181c;border:1px solid #000;border-radius:4px;box-shadow:0 10px 24px #000000a0}
.zcf-page-menu button{display:block;width:100%;text-align:left;background:none;border:0;color:#d9d9d9;font:inherit;font-size:13px;padding:8px 12px;cursor:pointer}
.zcf-page-menu button:hover{background:#ffffff0a}
.zcf-page-confirm td{background:#ff42420f}
.zcf-confirm{display:flex;align-items:center;gap:8px}
.zcf-confirm-text{flex:1}
.zcf-page-btn{background:#ffffff0d;border:0;border-radius:4px;color:#bdbdbd;font:inherit;font-size:11px;text-transform:uppercase;padding:5px 12px;cursor:pointer}
.zcf-page-btn:hover{background:#ffffff1f;color:#fff}
.zcf-page-btn.zcf-page-danger{background:#ff42421f;color:#ff8a8a}
.zcf-page-empty{padding:28px 16px;text-align:center;color:#9e9e9e}
@media (min-width:600px){
  body .chat-containers{right:0}
  .chat-containers .chat-container.chat-minimized{touch-action:none}
  .chat-containers .zcf-dm.chat-minimized{width:auto;max-width:150px}
  .chat-containers .zcf-dm.chat-minimized .chat-header{padding:0 10px 0 8px}
  .chat-containers .zcf-dm.chat-minimized .chat-header .chat-title{justify-content:flex-start;gap:6px}
  .chat-containers .zcf-dm.chat-minimized .zcf-dm-name{display:inline-block;white-space:nowrap;flex:1;min-width:0}
}
@media (max-width:599.98px){
  .zcf-cc,.zcf-grip{display:none!important}
  .chat-containers .zcf.zcf-open{order:3;flex:1 1 340px;width:auto;min-width:0;max-width:340px}
  .chat-containers:has(> .zcf-root > .zcf.zcf-open){flex-wrap:wrap-reverse;left:10px}
  .chat-containers:has(> .zcf-root > .zcf.zcf-open) .zcf.zcf-open{order:5;flex:0 0 100%;width:100%;max-width:none}
  @supports not selector(:has(a)){
    .chat-containers .zcf.zcf-open ~ .zcf-settings.chat-minimized,.chat-containers.single-chat-mode .zcf-settings.chat-minimized{display:none}
  }
  .zcf-dm:not(.chat-minimized){height:min(450px,60vh)}
  .zcf-pm:not(.chat-minimized){height:min(450px,60vh)}
  .zcf-page-back{display:none}
  .zcf-page-add-long{display:none}
  .zcf-page-add-short{display:inline}
  .zcf-page-search{width:100%;margin-left:0}
  .zcf-page-table .zcf-col-level,.zcf-page-table .zcf-col-faction,.zcf-page-table .zcf-col-note{display:none}
  .zcf-page-table .zcf-editing .zcf-col-note{display:table-cell}
  .zcf-page-table .zcf-editing .zcf-col-status{display:none}
  .zcf-page-table th,.zcf-page-table td{padding-left:8px;padding-right:8px}
  .zcf-chip{min-width:0;max-width:170px}
  .zcf-c-sub{display:block}
  .zcf-act.zcf-act-wide{display:none}
  .zcf-act.zcf-act-more{display:flex}
  .q-gutter-xs > .zcf-topbar{margin-left:2px}
}
`;

export function injectStyles(doc = document) {
  if (doc.getElementById('zcf-styles')) return;
  const style = doc.createElement('style');
  style.id = 'zcf-styles';
  style.textContent = CSS;
  doc.head.appendChild(style);
}
