// ==UserScript==
// @name         YouTube Downloader
// @namespace    http://tampermonkey.net/
// @version      11.22
// @description  yt-dlp + SSE + Hover + Share Catcher + Virtual Folders + Auto Playlist + Ultimate Clean + Pause/Resume + Trusted Types Fix
// @match        *://*.youtube.com/*
// @noframes
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
'use strict';

let ttPolicy;
try {
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        ttPolicy = window.trustedTypes.createPolicy('ytdl-policy', {
            createHTML: (s) => s
        });
    }
} catch (e) {}

// 1. Sistem Anti-Bentrok
if (window.__ytdl_active_version) return;
window.__ytdl_active_version = "11.22";

// 2. Bersihkan elemen lama dari DOM
document.querySelectorAll('#ytdl-fab-container, #ytdl-modal, #ytdl-popup, .ytdl-hover-dl').forEach(el => el.remove());

const API = 'http://localhost:8989';

const checkIsShorts = (item) => {
    if (!item) return false;
    return !!(item.isShorts || (item.sourceUrl && item.sourceUrl.includes('/shorts/')));
};

function normalizeYtUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        let u = new URL(rawUrl, location.origin);
        let videoId = '';
        if (u.hostname === 'youtu.be') {
            videoId = u.pathname.substring(1);
        } else if (u.pathname === '/watch') {
            videoId = u.searchParams.get('v');
        } else if (u.pathname.startsWith('/shorts/')) {
            videoId = u.pathname.split('/')[2];
        }
        let listId = u.searchParams.get('list');
        if (videoId) return `https://www.youtube.com/watch?v=${videoId}${listId ? '&list=' + listId : ''}`;
        else if (listId) return `https://www.youtube.com/playlist?list=${listId}`;
    } catch(e) {}
    return rawUrl;
}

let lastScannedFiles = [];
window.__ytdlTargetUrl = '';
window.__ytdlTargetTitle = '';

function trackHover(e) {
    const card = e.target.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer');
    if (card) {
        const a = card.querySelector('a#thumbnail');
        const t = card.querySelector('#video-title, .ytd-reel-item-renderer #video-title');
        if (a) window.__ytdlTargetUrl = normalizeYtUrl(a.href);
        if (t) window.__ytdlTargetTitle = t.textContent.trim();
    }
}
['mouseover', 'touchstart', 'focusin'].forEach(evt => document.addEventListener(evt, trackHover, true));

function thumbSrc(url) {
    if (!url) return '';
    if (url.startsWith('/') || url.startsWith(API)) return url;
    return `${API}/api/thumb?url=${encodeURIComponent(url)}`;
}

let libraryView = localStorage.getItem('ytdl_view') || 'grid';
let uiScale = parseFloat(localStorage.getItem('ytdl_scale') || '1');
let lastHistoryLen = -1;
let libraryMaximized = false;
let libraryFilter = localStorage.getItem('ytdl_filter') || 'all';

/* ══════════════════════════════════════════════════════
   CSS — inject via <style> (safe, tidak kena Trusted Types)
══════════════════════════════════════════════════════ */
const styleEl = document.createElement('style');
styleEl.textContent = `
#ytdl-fab-container {position:fixed;bottom:85px;right:20px;display:flex;flex-direction:column;gap:12px;z-index:999999;}
.ytdl-fab {width:48px;height:48px;background:#e00;color:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.5);font-size:20px;border:1px solid rgba(255,255,255,.2);user-select:none;}
#ytdl-fab-dl {display:none;}
#ytdl-fab-lib {position:relative;}
#ytdl-fab-lib .badge {position:absolute;top:-6px;right:-6px;background:#fa0;color:#000;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;}

body.ytdl-hide-share ytd-popup-container > tp-yt-paper-dialog,
body.ytdl-hide-share ytd-popup-container > tp-yt-iron-overlay-backdrop,
body.ytdl-hide-share iron-overlay-backdrop,
body.ytdl-hide-share tp-yt-paper-dialog,
body.ytdl-hide-share tp-yt-paper-toast {
    opacity: 0 !important; visibility: hidden !important; pointer-events: none !important;
    position: fixed !important; top: -9999px !important; left: -9999px !important;
    transform: scale(0) !important; z-index: -9999 !important;
}

.ytdl-hover-dl {
    position:absolute; top:8px; left:8px; background:#e00 !important; color:#fff !important;
    border:1px solid rgba(255,255,255,0.2); border-radius:6px; padding:6px 10px; font-size:12px;
    font-weight:bold; font-family:"Roboto","Arial",sans-serif; cursor:pointer; z-index:99;
    opacity:0; transition:opacity 0.2s ease, transform 0.1s ease, background 0.2s;
    display:flex; align-items:center; gap:5px;
}
.ytdl-hover-dl:hover { background:#c00 !important; }
.ytdl-hover-dl:active {transform:scale(0.95);}
ytd-rich-item-renderer:hover .ytdl-hover-dl,
ytd-video-renderer:hover .ytdl-hover-dl,
ytd-grid-video-renderer:hover .ytdl-hover-dl,
ytd-compact-video-renderer:hover .ytdl-hover-dl { opacity:1; }

#ytdl-popup{display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#181818;color:#fff;padding:22px;border-radius:14px;z-index:10000000;width:340px;box-shadow:0 0 40px rgba(0,0,0,.9);border:1px solid #3a3a3a;text-align:center}
#ytdl-popup.show{display:block}
#ytdl-popup h3{margin:0 0 5px;font-size:15px}
#ytdl-popup .sub{font-size:11px;color:#888;margin-bottom:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.q-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.q-btn{background:#2a2a2a;color:#fff;border:1px solid #444;padding:12px 8px;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:3px}
.q-btn:hover{background:#e00;border-color:#e00}
.q-btn .q-sz{font-size:10px;color:#aaa;font-weight:400}
.q-btn:hover .q-sz{color:#ffc}
#btn-dl-playlist:hover { background: #0c7 !important; }

#ytdl-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:9999999;color:#fff;box-sizing:border-box}
#ytdl-modal.show{display:flex}
#ytdl-inner{display:grid;grid-template-columns:1fr 430px;gap:20px;width:100%;height:100%;padding:20px;box-sizing:border-box;transform-origin:top left}

.main-p{display:flex;flex-direction:column;background:#000;border-radius:14px;padding:20px;border:1px solid #222;overflow:hidden;min-height:0}
.main-p video{width:100%;border-radius:10px;background:#111;max-height:48vh;flex-shrink:0;transition:max-height .35s ease,opacity .35s ease,margin .35s ease}
.main-p.player-hidden video{max-height:0;opacity:0;margin:0;pointer-events:none}
.main-p.player-hidden #p-title{display:none}
#player-wrap{flex-shrink:0;transition:all .35s ease}

#player-toggle-bar{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-shrink:0;cursor:pointer;user-select:none;padding:6px 10px;border-radius:8px;border:1px solid #1a1a1a;transition:background .2s}
#player-toggle-bar:hover{background:#111;border-color:#333}
#player-toggle-bar .ptb-title{flex:1;font-size:11px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#player-toggle-bar .ptb-title.playing{color:#3ea6ff}
#player-toggle-bar .ptb-icon{font-size:14px;transition:transform .3s ease;flex-shrink:0}
#player-toggle-bar .ptb-icon.collapsed{transform:rotate(-90deg)}
#player-toggle-bar .ptb-badge{background:#222;color:#555;font-size:9px;padding:2px 6px;border-radius:4px;flex-shrink:0}
#player-toggle-bar .ptb-badge.active{background:#1a3a1a;color:#0c6}
#p-title{font-size:13px;margin:0 0 10px;text-align:center;color:#ccc;min-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.scale-row{display:flex;align-items:center;gap:8px;margin-bottom:12px;background:#111;border-radius:8px;padding:7px 12px;border:1px solid #222;flex-shrink:0}
.scale-row span{font-size:11px;color:#555;white-space:nowrap}
.scale-row input[type=range]{flex:1;accent-color:#e00;cursor:pointer}
.scale-val{font-size:11px;color:#aaa;min-width:34px;text-align:right}

#dl-panel{flex:1;overflow-y:auto;margin-top:12px;min-height:0}
.dl-card{background:#111;border:1px solid #222;border-radius:10px;padding:12px;margin-bottom:10px}
.dl-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.dl-hdr img{width:56px;height:32px;border-radius:4px;object-fit:cover;flex-shrink:0}
.dl-hdr-text{flex:1;font-size:11px;font-weight:700;color:#ddd;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dl-badge{background:#e00;color:#fff;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;flex-shrink:0}
.dl-row{display:flex;justify-content:space-between;font-size:10px;color:#666;margin-bottom:2px}
.dl-row .spd{color:#fa0}
.dl-row .eta{color:#666}
.pbar{width:100%;height:6px;background:#222;border-radius:3px;overflow:hidden;margin-bottom:5px}
.pbar-fill{height:100%;border-radius:3px;transition:width .4s ease;width:0}
.pbar-v{background:linear-gradient(90deg,#f44,#e00)}
.pbar-a{background:linear-gradient(90deg,#48f,#3ea6ff)}
.pbar-m{background:linear-gradient(90deg,#fc0,#fa0);animation:blink .7s infinite alternate}
.pbar-s{background:linear-gradient(90deg,#c0f,#a0f);animation:blink .7s infinite alternate}
.sub-toggle-row{display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px 10px;background:#0d0d1a;border-radius:7px;border:1px solid #222;flex-shrink:0}
.sub-toggle-row label{font-size:11px;color:#888;flex:1;cursor:pointer}
.sub-toggle-row select{background:#1a1a2e;color:#ccc;border:1px solid #333;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;max-width:160px}
.sub-on-badge{background:#a0f;color:#fff;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700}
.dl-sub-row{background:#0d0d1a;border:1px solid #1a1a3a;border-radius:6px;padding:6px 10px;margin:8px 0 0;font-size:11px;color:#888;display:flex;align-items:center;gap:6px}
.dl-sub-row select{background:#111;color:#ccc;border:1px solid #333;border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer}
@keyframes blink{from{opacity:.6}to{opacity:1}}
.dl-foot{display:flex;justify-content:space-between;align-items:center;margin-top:5px;gap:4px}
.dl-foot-btns{display:flex;gap:4px;align-items:center;flex-shrink:0}
.dl-status{font-size:10px;flex:1}

.dl-pause{background:none;border:1px solid #555;color:#fa0;border-radius:5px;padding:3px 10px;font-size:10px;cursor:pointer;transition:all .2s;white-space:nowrap}
.dl-pause:hover{background:#fa0;border-color:#fa0;color:#000}
.dl-pause.is-paused{color:#3ea6ff;border-color:#3ea6ff;}
.dl-pause.is-paused:hover{background:#3ea6ff;border-color:#3ea6ff;color:#fff}
.dl-pause:disabled{opacity:.4;cursor:not-allowed}

.dl-cancel{background:none;border:1px solid #522;color:#f44;border-radius:5px;padding:3px 10px;font-size:10px;cursor:pointer;transition:all .2s;white-space:nowrap}
.dl-cancel:hover{background:#e00;border-color:#e00;color:#fff}

.dl-paused-label{font-size:10px;color:#fa0;font-style:italic;text-align:center;padding:4px 0;background:rgba(255,170,0,0.08);border-radius:5px;margin-bottom:4px}

.close-ytdl{flex-shrink:0;margin-top:10px;background:#1a1a1a;color:#888;border:1px solid #333;padding:9px 36px;border-radius:20px;cursor:pointer;font-weight:700;align-self:center;transition:all .2s}
.close-ytdl:hover{background:#333;color:#fff}
#close-ytdl{flex-shrink:0;margin-top:10px;background:#1a1a1a;color:#888;border:1px solid #333;padding:9px 36px;border-radius:20px;cursor:pointer;font-weight:700;align-self:center;transition:all .2s}
#close-ytdl:hover{background:#333;color:#fff}

.side-p{background:#0d0d0d;border-radius:14px;padding:18px;border:1px solid #222;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.side-p.lib-maximized{position:fixed;inset:16px;border-radius:16px;z-index:10000000;padding:20px;box-shadow:0 0 60px rgba(0,0,0,.9)}
.lib-tabs{display:flex;gap:4px;margin-bottom:10px;flex-shrink:0}
.lib-tab{flex:1;padding:7px 0;background:#1a1a1a;border:1px solid #222;border-radius:7px;color:#555;font-size:12px;font-weight:700;cursor:pointer;text-align:center;transition:all .2s}
.lib-tab.active{background:#e00;border-color:#e00;color:#fff}
.lib-hdr{display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-shrink:0;flex-wrap:wrap}
.lib-hdr h3{flex:1;margin:0;font-size:13px;min-width:80px}

.vbtn{background:#1a1a1a;border:1px solid #333;color:#888;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:15px;transition:all .2s;display:flex;align-items:center;}
.vbtn.active{background:#e00;border-color:#e00;color:#fff}
.vbtn-txt {font-size:13px; font-weight:bold;}
.vbtn:hover{background:#333;color:#fff}

.maximize-btn{background:#1a1a1a;border:1px solid #333;color:#888;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:13px;transition:all .2s;white-space:nowrap}
.maximize-btn:hover{background:#333;color:#fff}

.filter-row{display:flex;gap:4px;margin-bottom:14px;flex-shrink:0; padding-bottom:14px; border-bottom:1px solid #222;}
.filter-btn{flex:1;padding:5px 0;background:#1a1a1a;border:1px solid #222;border-radius:6px;color:#555;font-size:11px;font-weight:700;cursor:pointer;text-align:center;transition:all .2s}
.filter-btn.active{background:#333;border-color:#555;color:#fff}

.folder-group{margin-bottom:14px}
.folder-group-header{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#1a1a1a;border-radius:7px;margin-bottom:6px;cursor:pointer;user-select:none;border:1px solid #222;transition:background .2s, border-color .2s}
.folder-group-header:hover{background:#222}
.folder-group-header.drag-over { background: #e00 !important; border-color: #fff !important; }
.folder-group-header .fg-icon{font-size:14px;flex-shrink:0}
.folder-group-header .fg-name{flex:1;font-size:12px;font-weight:700;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.folder-group-header .fg-count{background:#222;color:#555;font-size:9px;padding:2px 6px;border-radius:4px;flex-shrink:0}
.folder-group-header .fg-toggle{font-size:10px;color:#444;transition:transform .2s;flex-shrink:0}
.folder-group-header.collapsed .fg-toggle{transform:rotate(-90deg)}
.fg-del-btn { background:none; border:none; color:#f44; cursor:pointer; font-size:14px; margin-left:4px; padding:0 5px; border-radius:4px; transition:all 0.2s; }
.fg-del-btn:hover { background:#f44; color:#fff; }

#h-list, #scan-list{flex:1;overflow-y:auto;min-height:0;padding-right:2px}
#h-list.grid, #scan-list.grid {display:flex;flex-direction:column;gap:15px}
#h-list.list, #scan-list.list{display:flex;flex-direction:column;gap:8px}

#h-list.grid .folder-group-body:not(.collapsed), #scan-list.grid .folder-group-body:not(.collapsed) {display:flex; flex-wrap:wrap; gap:10px; padding:2px; align-items:flex-start;}
#h-list.list .folder-group-body:not(.collapsed), #scan-list.list .folder-group-body:not(.collapsed) {display:flex;flex-direction:column;gap:8px;padding:2px}

.shorts-shelf-container { display: flex !important; flex-wrap: nowrap !important; overflow-x: auto !important; gap: 10px; padding: 2px 2px 10px 2px; scroll-behavior: smooth; align-items: center; transition: all 0.2s; }
.shorts-shelf-container.collapsed { display: none !important; }
.shorts-shelf-container::-webkit-scrollbar { height: 6px; }
.shorts-shelf-container::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
.shorts-shelf-container::-webkit-scrollbar-track { background: transparent; }
.shorts-shelf-container .v-card { flex-direction: column !important; flex: 0 0 110px !important; width: 110px !important; height: 195px !important; }
.lib-maximized .shorts-shelf-container .v-card { flex: 0 0 140px !important; width: 140px !important; height: 248px !important; }
.shorts-shelf-container .thumb-wrap { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
.shorts-shelf-container .cb { position: absolute !important; inset: 0 !important; padding: 10px !important; background: linear-gradient(to top,rgba(0,0,0,.95) 0%,rgba(0,0,0,.6) 50%,transparent 100%) !important; opacity: 0; }
.shorts-shelf-container .v-card:hover .cb { opacity: 1 !important; pointer-events: auto !important; }
.shorts-shelf-container .card-title { white-space: normal !important; display: -webkit-box !important; -webkit-line-clamp: 2 !important; -webkit-box-orient: vertical !important; }

.v-card{display:flex;background:#111;border-radius:10px;border:1px solid #222;overflow:hidden;position:relative;transition:border-color .2s, transform 0.2s, opacity 0.2s;}
.v-card:hover{border-color:#555}
.v-card.is-dragging { opacity: 0.4; transform: scale(0.95); border-color: #e00; }
#h-list.grid .v-card, #scan-list.grid .v-card { flex-direction: column; height: auto; min-height: min-content; cursor: pointer; width: calc(50% - 5px); box-sizing: border-box; flex-shrink: 0; }
.lib-maximized #h-list.grid .v-card, .lib-maximized #scan-list.grid .v-card { width: calc(25% - 7.5px); }
#h-list.grid .v-card:not(.shorts-card), #scan-list.grid .v-card:not(.shorts-card) { aspect-ratio: 16/9; }
#h-list.grid .v-card.shorts-card, #scan-list.grid .v-card.shorts-card { aspect-ratio: 9/16 !important; }
#h-list.grid .thumb-wrap, #scan-list.grid .thumb-wrap{position:absolute;inset:0;background:#0a0a0a;overflow:hidden;z-index:0}
#h-list.grid .thumb-wrap img, #scan-list.grid .thumb-wrap img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s ease}
#h-list.grid .v-card:hover .thumb-wrap img, #scan-list.grid .v-card:hover .thumb-wrap img{transform:scale(1.05)}
#h-list.grid .thumb-wrap .no-thumb, #scan-list.grid .thumb-wrap .no-thumb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;color:#252525}
#h-list.grid .thumb-quality, #scan-list.grid .thumb-quality{position:absolute;bottom:6px;right:6px;z-index:4;background:rgba(0,0,0,.88);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;pointer-events:none}
#h-list.grid .type-badge, #scan-list.grid .type-badge{position:absolute;top:6px;right:6px;z-index:4;background:rgba(50,50,200,.85);color:#fff;font-size:8px;font-weight:700;padding:2px 5px;border-radius:3px;pointer-events:none}
#h-list.grid .del-b, #scan-list.grid .sc-add{position:absolute;top:6px;left:6px;z-index:5;background:rgba(0,0,0,.75);border:none;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;padding:0;cursor:pointer;opacity:0;transition:opacity .18s;line-height:1}
#h-list.grid .v-card:hover .del-b, #scan-list.grid .v-card:hover .sc-add{opacity:1}
#h-list.grid .del-b:hover{background:rgba(180,0,0,.9)!important}
#h-list.grid .sc-add:hover{background:rgba(0,100,0,.9)!important}
#h-list.grid .sc-add.in-lib{background:rgba(0,50,0,.9);color:#0f0;cursor:default}
#h-list.grid .cb, #scan-list.grid .cb{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;justify-content:flex-end;padding:10px;background:linear-gradient(to top,rgba(0,0,0,.95) 0%,rgba(0,0,0,.6) 50%,transparent 100%);opacity:0;transition:opacity .2s ease;pointer-events:none;box-sizing:border-box}
#h-list.grid .v-card:hover .cb, #scan-list.grid .v-card:hover .cb{opacity:1;pointer-events:auto}
#h-list.grid .card-title, #scan-list.grid .card-title{font-size:11px;font-weight:700;color:#fff;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;margin:0 0 5px;text-shadow:0 1px 4px #000}
#h-list.grid .card-tags, #scan-list.grid .card-tags{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 7px;align-items:center}
#h-list.grid .card-acts, #scan-list.grid .card-acts{display:flex;gap:5px}

#h-list.list .v-card, #scan-list.list .v-card{flex-direction:row;align-items:stretch;min-height:90px;height:90px;overflow:hidden}
#h-list.list .thumb-wrap, #scan-list.list .thumb-wrap{position:relative;width:130px;min-width:130px;height:90px;flex-shrink:0;background:#0a0a0a;overflow:hidden}
#h-list.list .thumb-wrap img, #scan-list.list .thumb-wrap img{width:100%;height:100%;object-fit:cover;display:block}
#h-list.list .thumb-wrap .no-thumb, #scan-list.list .thumb-wrap .no-thumb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;color:#252525}
#h-list.list .thumb-quality, #scan-list.list .thumb-quality{position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.88);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px}
#h-list.list .type-badge, #scan-list.list .type-badge{position:absolute;top:4px;right:4px;background:rgba(50,50,200,.85);color:#fff;font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px}
#h-list.list .del-b, #scan-list.list .sc-add{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);border:none;color:#aaa;font-size:12px;padding:3px 5px;cursor:pointer;transition:all .15s;border-radius:4px;line-height:1;z-index:2}
#h-list.list .del-b:hover{color:#f44;background:rgba(180,0,0,.75)}
#h-list.list .sc-add:hover{color:#0f0;background:rgba(0,100,0,.75)}
#h-list.list .sc-add.in-lib{background:rgba(0,50,0,.9);color:#0f0;cursor:default}
#h-list.list .cb, #scan-list.list .cb{padding:10px 32px 10px 12px;flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:6px;position:static;opacity:1;pointer-events:auto;background:none;overflow:hidden}
#h-list.list .card-title, #scan-list.list .card-title{font-size:11px;font-weight:700;color:#ddd;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;display:block;width:100%}
#h-list.list .card-tags, #scan-list.list .card-tags{display:flex;gap:4px;flex-wrap:nowrap;margin:0;align-items:center;overflow:hidden;max-width:100%}
#h-list.list .card-acts, #scan-list.list .card-acts{display:flex;gap:5px;margin:0;flex-shrink:0}
.v-card > .thumb-quality{position:absolute;z-index:4;pointer-events:none}
.v-card > .del-b, .v-card > .sc-add{position:absolute;z-index:5}

.tag{padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;white-space:nowrap}
.tag-s{background:#252525;color:#aaa}
.tag-f{background:#0d1f30;color:#3ea6ff}
.tag-shorts{background:#1a0d30;color:#a78bfa}
.play-b, .sc-add-btn{background:#3ea6ff;border:none;color:#fff;padding:5px 12px;border-radius:5px;cursor:pointer;font-size:10px;font-weight:700;transition:background .15s}
.play-b:hover, .sc-add-btn:hover{background:#1a8fd1}
.del-b{cursor:pointer;border:none;background:none;transition:color .15s}

#scan-panel{display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0}
#scan-panel.show{display:flex}
#hist-panel{display:flex;flex-direction:column;flex:1;overflow:hidden;min-height:0}
#hist-panel.hidden{display:none}

.folder-list{flex-shrink:0;margin-bottom:8px}
.folder-item{display:flex;align-items:center;gap:6px;background:#1a1a1a;border:1px solid #222;border-radius:6px;padding:6px 10px;margin-bottom:4px;font-size:11px;color:#aaa}
.folder-item .fp{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.folder-item .fbadge{background:#222;color:#555;font-size:9px;padding:1px 5px;border-radius:3px;flex-shrink:0}
.folder-item .frem{background:none;border:none;color:#f44;cursor:pointer;font-size:13px;flex-shrink:0}

.add-row{display:flex;gap:6px;margin-bottom:8px;flex-shrink:0}
.add-row input{flex:1;background:#1a1a1a;border:1px solid #222;border-radius:6px;padding:7px 10px;color:#fff;font-size:11px;outline:none}
.add-row input:focus{border-color:#e00}

.sbtn{background:#1a1a1a;border:1px solid #333;color:#ccc;border-radius:6px;padding:7px 12px;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;transition:all .2s;flex-shrink:0}
.sbtn:hover{background:#333;color:#fff}
.sbtn.red{background:#e00;border-color:#e00;color:#fff}
.sbtn.red:hover{background:#b00}
.sbtn:disabled{opacity:.4;cursor:not-allowed}

.scan-bar{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-shrink:0}
.scan-stats{font-size:10px;color:#555;flex:1}
.sc-empty{color:#333;font-size:13px;text-align:center;margin-top:40px}
.ytdl-menu-item { cursor: pointer !important; }
.ytdl-menu-item:hover { background-color: rgba(255, 255, 255, 0.1) !important; }
`;
document.head.appendChild(styleEl);

/* ══════════════════════════════════════════════════════
   BUILD UI — Trusted Types safe: semua via createElement
══════════════════════════════════════════════════════ */
function el(tag, props = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
        if (k === 'class') e.className = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k === 'textContent') e.textContent = v;
        else e.setAttribute(k, v);
    });
    children.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
}

// Helper: set innerHTML hanya untuk container yang belum di-attach ke DOM
function safeSetInner(container, htmlString) {
    if (ttPolicy) {
        container.innerHTML = ttPolicy.createHTML(htmlString);
    } else {
        container.innerHTML = htmlString;
    }
}

// ── MODAL ──────────────────────────────────────────────────────────────────
const modal = el('div', { id: 'ytdl-modal' });

const inner = el('div', { id: 'ytdl-inner' });

// LEFT: main panel
const mainP = el('div', { class: 'main-p', id: 'main-p' });

const scaleRow = el('div', { class: 'scale-row' });
scaleRow.appendChild(el('span', { textContent: '🔍 Scale' }));
const scaleSlider = el('input', { type: 'range', id: 'scale-sl', min: '0.6', max: '1.4', step: '0.05', value: String(uiScale) });
scaleRow.appendChild(scaleSlider);
const scaleLbl = el('span', { class: 'scale-val', id: 'scale-lbl', textContent: Math.round(uiScale * 100) + '%' });
scaleRow.appendChild(scaleLbl);
mainP.appendChild(scaleRow);

const ptBar = el('div', { id: 'player-toggle-bar' });
const ptbIcon = el('span', { class: 'ptb-icon', id: 'ptb-icon', textContent: '▼' });
const ptbTitle = el('span', { class: 'ptb-title', id: 'ptb-title', textContent: 'Player' });
const ptbBadge = el('span', { class: 'ptb-badge', id: 'ptb-badge', textContent: 'Idle' });
ptBar.appendChild(ptbIcon); ptBar.appendChild(ptbTitle); ptBar.appendChild(ptbBadge);
mainP.appendChild(ptBar);

const playerWrap = el('div', { id: 'player-wrap' });
const pTitle = el('p', { id: 'p-title', textContent: 'Library & Player' });
const vPlayer = el('video', { id: 'v-player', controls: '' });
const subToggleRow = el('div', { class: 'sub-toggle-row', id: 'sub-toggle-row', style: 'display:none' });
subToggleRow.appendChild(document.createTextNode('💬 '));
const subLabel = el('label', {}); subLabel.setAttribute('for', 'sub-track-sel'); subLabel.textContent = 'Subtitle:';
const subSel = el('select', { id: 'sub-track-sel' });
subSel.appendChild(el('option', { value: '' }, ['— Nonaktif —']));
const subOnBadge = el('span', { class: 'sub-on-badge', id: 'sub-on-badge', style: 'display:none', textContent: 'ON' });
subToggleRow.appendChild(subLabel); subToggleRow.appendChild(subSel); subToggleRow.appendChild(subOnBadge);
playerWrap.appendChild(pTitle); playerWrap.appendChild(vPlayer); playerWrap.appendChild(subToggleRow);
mainP.appendChild(playerWrap);

const dlPanel = el('div', { id: 'dl-panel' });
dlPanel.appendChild(el('p', { class: 'dl-empty', textContent: 'Tidak ada unduhan aktif' }));
mainP.appendChild(dlPanel);

const closeBtn = el('button', { id: 'close-ytdl', textContent: '✕ TUTUP' });
mainP.appendChild(closeBtn);
inner.appendChild(mainP);

// RIGHT: side panel
const sideP = el('div', { class: 'side-p' });

const libTabs = el('div', { class: 'lib-tabs' });
const tabHist = el('button', { class: 'lib-tab active', id: 'tab-hist', textContent: '📁 Library' });
const tabScan = el('button', { class: 'lib-tab', id: 'tab-scan', textContent: '🔍 Scan Folder' });
libTabs.appendChild(tabHist); libTabs.appendChild(tabScan);
sideP.appendChild(libTabs);

const filterRow = el('div', { class: 'filter-row' });
[['all','🎬 Semua'],['video','📹 Video'],['shorts','📱 Shorts']].forEach(([f, label]) => {
    const btn = el('button', { class: 'filter-btn' + (libraryFilter === f ? ' active' : ''), 'data-filter': f, textContent: label });
    filterRow.appendChild(btn);
});
sideP.appendChild(filterRow);

// HIST PANEL
const histPanel = el('div', { id: 'hist-panel' });
const libHdr = el('div', { class: 'lib-hdr' });
const libHdrH3 = el('h3', { textContent: 'Library' });
const btnCreateFolder = el('button', { class: 'vbtn', id: 'btn-create-folder', title: 'Buat Folder Virtual Baru', style: 'margin-right:auto; padding:5px 8px;' });
btnCreateFolder.appendChild(el('span', { class: 'vbtn-txt', textContent: '📁+' }));
const hbtnGrid = el('button', { class: 'vbtn' + (libraryView==='grid'?' active':''), id: 'hbtn-grid', textContent: '⊞' });
const hbtnList = el('button', { class: 'vbtn' + (libraryView==='list'?' active':''), id: 'hbtn-list', textContent: '≡' });
const maximizeBtn = el('button', { class: 'maximize-btn', id: 'maximize-btn', title: 'Perluas Library', textContent: '⤢' });
libHdr.appendChild(libHdrH3); libHdr.appendChild(btnCreateFolder);
libHdr.appendChild(hbtnGrid); libHdr.appendChild(hbtnList); libHdr.appendChild(maximizeBtn);
histPanel.appendChild(libHdr);
const hList = el('div', { id: 'h-list', class: libraryView });
histPanel.appendChild(hList);
sideP.appendChild(histPanel);

// SCAN PANEL
const scanPanel = el('div', { id: 'scan-panel' });

const browserRow = el('div', { class: 'add-row', style: 'margin-bottom:12px; align-items:center; border-bottom:1px solid #222; padding-bottom:12px;' });
browserRow.appendChild(el('span', { style: 'font-size:11px; color:#888; margin-right:8px;', textContent: '🍪 Cookie Browser:' }));
const browserSel = el('select', { id: 'browser-sel', style: 'background:#1a1a1a; border:1px solid #222; border-radius:6px; padding:6px; color:#fff; font-size:11px; flex:1;' });
[
    {v:'', t:'— Tanpa Cookie —'},
    {v:'brave', t:'Brave'},
    {v:'chrome', t:'Chrome'},
    {v:'firefox', t:'Firefox'},
    {v:'edge', t:'Edge'},
    {v:'safari', t:'Safari'},
    {v:'opera', t:'Opera'},
    {v:'vivaldi', t:'Vivaldi'}
].forEach(b => browserSel.appendChild(el('option', { value: b.v }, [b.t])));
browserRow.appendChild(browserSel);
browserSel.onchange = () => {
    GM_xmlhttpRequest({
        method: 'POST', url: `${API}/api/config`, headers: {'Content-Type':'application/json'},
        data: JSON.stringify({ cookiesFromBrowser: browserSel.value || null })
    });
};

const folderListEl = el('div', { class: 'folder-list', id: 'folder-list' });
const addRow = el('div', { class: 'add-row' });
const folderInput = el('input', { id: 'folder-input', placeholder: 'Path folder, mis: /home/user/Videos' });
const folderAddBtn = el('button', { class: 'sbtn', id: 'folder-add-btn', textContent: '+ Tambah' });
addRow.appendChild(folderInput); addRow.appendChild(folderAddBtn);
const scanBar = el('div', { class: 'scan-bar' });
const scanBtn2 = el('button', { class: 'sbtn red', id: 'scan-btn', textContent: '🔍 Scan Sekarang' });
const scanStats = el('span', { class: 'scan-stats', id: 'scan-stats' });
const sbtnGrid = el('button', { class: 'vbtn' + (libraryView==='grid'?' active':''), id: 'sbtn-grid', textContent: '⊞' });
const sbtnList = el('button', { class: 'vbtn' + (libraryView==='list'?' active':''), id: 'sbtn-list', textContent: '≡' });
scanBar.appendChild(scanBtn2); scanBar.appendChild(scanStats); scanBar.appendChild(sbtnGrid); scanBar.appendChild(sbtnList);
const scanList = el('div', { id: 'scan-list', class: libraryView });
scanList.appendChild(el('p', { class: 'sc-empty', textContent: 'Klik "Scan Sekarang" untuk memindai.' }));
scanPanel.appendChild(browserRow);
scanPanel.appendChild(folderListEl); scanPanel.appendChild(addRow); scanPanel.appendChild(scanBar); scanPanel.appendChild(scanList);
sideP.appendChild(scanPanel);

inner.appendChild(sideP);
modal.appendChild(inner);
document.body.appendChild(modal);

// ── POPUP ──────────────────────────────────────────────────────────────────
const popup = el('div', { id: 'ytdl-popup' });
const popupH3 = el('h3', { textContent: '⬇ Pilih Kualitas / Mode' });
const popupSub = el('p', { class: 'sub', id: 'popup-title' });
const plInjectZone = el('div', { id: 'playlist-inject-zone' });
const qList = el('div', { id: 'q-list', class: 'q-grid' });
const popupCancel = el('button', { id: 'popup-cancel', style: 'margin-top:14px;background:none;border:none;color:#555;cursor:pointer;font-size:13px', textContent: 'Batal' });
popup.appendChild(popupH3); popup.appendChild(popupSub);
popup.appendChild(plInjectZone); popup.appendChild(qList); popup.appendChild(popupCancel);
document.body.appendChild(popup);

// ── FAB ────────────────────────────────────────────────────────────────────
const fabContainer = el('div', { id: 'ytdl-fab-container' });
const fabDl  = el('div', { id: 'ytdl-fab-dl',  class: 'ytdl-fab', title: 'Download Current Video',  textContent: '⬇' });
const fabLib = el('div', { id: 'ytdl-fab-lib', class: 'ytdl-fab', title: 'Open Library', textContent: '📂' });
fabContainer.appendChild(fabDl); fabContainer.appendChild(fabLib);
document.body.appendChild(fabContainer);

const player = vPlayer;

/* ══════════════════════════════════════════════════════
   LOGIKA CREATE FOLDER
══════════════════════════════════════════════════════ */
document.getElementById('btn-create-folder').onclick = () => {
    const name = prompt('Nama Folder Custom baru:');
    if (name && name.trim()) {
        let customFoldersList = JSON.parse(localStorage.getItem('ytdl_custom_folders') || '[]');
        const cName = name.trim();
        if (!customFoldersList.includes(cName)) {
            customFoldersList.push(cName);
            localStorage.setItem('ytdl_custom_folders', JSON.stringify(customFoldersList));
            loadHistory(true);
        } else {
            alert('Folder dengan nama tersebut sudah ada.');
        }
    }
};

/* ══════════════════════════════════════════════════════
   VISIBILITY LOGIC FOR DOWNLOAD FAB
══════════════════════════════════════════════════════ */
function checkFabVisibility() {
    if (fabDl) {
        const isWatch = location.pathname.startsWith('/watch') || location.pathname.startsWith('/shorts/') || location.pathname.startsWith('/playlist');
        fabDl.style.display = isWatch ? 'flex' : 'none';
    }
}
['yt-navigate-finish', 'yt-page-data-updated'].forEach(evt => window.addEventListener(evt, checkFabVisibility));
checkFabVisibility();

/* ══════════════════════════════════════════════════════
   INJEKSI TOMBOL HOVER DI BERANDA
══════════════════════════════════════════════════════ */
const hoverObserver = new MutationObserver(() => {
    const thumbnails = document.querySelectorAll('ytd-thumbnail:not([data-ytdl-hover-injected])');
    thumbnails.forEach(thumb => {
        thumb.setAttribute('data-ytdl-hover-injected', '1');

        const btn = document.createElement('button');
        btn.className = 'ytdl-hover-dl';
        btn.title = 'Download video ini';

        // SVG icon
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
        svg.setAttribute('fill', 'currentColor');
        const pathEl = document.createElementNS(svgNS, 'path');
        pathEl.setAttribute('d', 'M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z');
        svg.appendChild(pathEl);
        btn.appendChild(svg);
        btn.appendChild(document.createTextNode(' Download'));

        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            const renderer = thumb.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytd-playlist-video-renderer');
            if (!renderer) return;
            const a = renderer.querySelector('a#thumbnail');
            if (!a) return;
            const url = normalizeYtUrl(a.href);
            const titleEl = renderer.querySelector('#video-title, .ytd-reel-item-renderer #video-title');
            const title = titleEl ? titleEl.textContent.trim() : '';
            openQualityPopup(url, title, url.includes('/shorts/'));
        };
        thumb.appendChild(btn);
    });
});
hoverObserver.observe(document.body, { childList: true, subtree: true });

/* ══════════════════════════════════════════════════════
   INJEKSI MENU TITIK TIGA
══════════════════════════════════════════════════════ */
const menuObserver = new MutationObserver(() => {
    const menuLists = document.querySelectorAll('yt-list-view-model[role="listbox"]:not([data-ytdl-menu-injected])');
    menuLists.forEach(menuList => {
        menuList.setAttribute('data-ytdl-menu-injected', '1');

        const menuItem = document.createElement('yt-list-item-view-model');
        menuItem.className = 'yt-list-item-view-model ytdl-menu-item';
        menuItem.setAttribute('role', 'menuitem');

        // Build structure manually (Trusted Types safe) to match native structure
        const layoutWrapper = el('div', { class: 'yt-list-item-view-model__layout-wrapper yt-list-item-view-model__container yt-list-item-view-model__container--compact yt-list-item-view-model__container--tappable yt-list-item-view-model__container--in-popup' });
        const mainContainer = el('div', { class: 'yt-list-item-view-model__main-container' });

        const imgContainer = el('div', { 'aria-hidden': 'true', class: 'yt-list-item-view-model__image-container yt-list-item-view-model__leading' });
        const iconWrap = el('span', { class: 'ytIconWrapperHost yt-list-item-view-model__accessory yt-list-item-view-model__image', role: 'img', 'aria-hidden': 'true' });
        const iconShape = el('span', { class: 'yt-icon-shape ytSpecIconShapeHost' });
        const svgWrap = el('div', { style: 'width:100%;height:100%;display:block;fill:#e00;' });
        const svgNS = 'http://www.w3.org/2000/svg';
        const menuSvg = document.createElementNS(svgNS, 'svg');
        menuSvg.setAttribute('xmlns', svgNS);
        menuSvg.setAttribute('height', '24'); menuSvg.setAttribute('viewBox', '0 0 24 24'); menuSvg.setAttribute('width', '24');
        menuSvg.setAttribute('focusable', 'false'); menuSvg.setAttribute('aria-hidden', 'true');
        menuSvg.style.cssText = 'pointer-events:none;display:inherit;width:100%;height:100%';
        const menuPath = document.createElementNS(svgNS, 'path');
        menuPath.setAttribute('d', 'M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z');
        menuSvg.appendChild(menuPath);
        svgWrap.appendChild(menuSvg); iconShape.appendChild(svgWrap); iconWrap.appendChild(iconShape); imgContainer.appendChild(iconWrap);

        const btnAnchor = el('button', { class: 'ytButtonOrAnchorHost ytButtonOrAnchorButton yt-list-item-view-model__button-or-anchor', style: 'cursor:pointer;flex:1;text-align:left;background:none;border:none;display:flex;align-items:center;height:100%;padding:0;' });
        const txtWrap = el('div', { class: 'yt-list-item-view-model__text-wrapper', style: 'flex:1;' });
        const titleWrap = el('div', { class: 'yt-list-item-view-model__title-wrapper' });
        const titleSpan = el('span', { class: 'yt-core-attributed-string yt-list-item-view-model__title yt-core-attributed-string--white-space-pre-wrap', role: 'text', style: 'color:#e00;font-weight:bold;', textContent: 'Download' });
        titleWrap.appendChild(titleSpan); txtWrap.appendChild(titleWrap); btnAnchor.appendChild(txtWrap);

        mainContainer.appendChild(imgContainer); mainContainer.appendChild(btnAnchor);
        layoutWrapper.appendChild(mainContainer);
        menuItem.appendChild(layoutWrapper);

        menuItem.onclick = (e) => {
            e.stopPropagation();
            const items = Array.from(menuList.querySelectorAll('yt-list-item-view-model'));
            const shareItem = items.find(item => {
                const text = item.textContent.toLowerCase();
                return text.includes('share') || text.includes('bagikan');
            });

            if (shareItem) {
                document.body.classList.add('ytdl-hide-share');
                const shareBtn = shareItem.querySelector('button');
                if (shareBtn) shareBtn.click(); else shareItem.click();

                let checkCount = 0;
                const checkShare = setInterval(() => {
                    checkCount++;
                    const shareInput = document.querySelector('#share-url');
                    if (shareInput && shareInput.value) {
                        clearInterval(checkShare);
                        const rawVideoUrl = shareInput.value;
                        const videoUrl = normalizeYtUrl(rawVideoUrl);
                        const titleEl = document.querySelector('yt-share-target-renderer #title');
                        const title = titleEl ? titleEl.textContent.trim() : window.__ytdlTargetTitle;

                        const dialog = shareInput.closest('tp-yt-paper-dialog, ytd-popup-container');
                        if (dialog) {
                            const closeB = dialog.querySelector('yt-icon-button#close-button button');
                            if (closeB) closeB.click();
                            else document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
                        } else {
                            document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
                        }

                        const isShorts = videoUrl.includes('/shorts/');
                        setTimeout(() => openQualityPopup(videoUrl, title, isShorts), 100);
                        setTimeout(() => { document.body.classList.remove('ytdl-hide-share'); }, 500);

                    } else if (checkCount > 30) {
                        clearInterval(checkShare);
                        setTimeout(() => document.body.classList.remove('ytdl-hide-share'), 500);
                        if (window.__ytdlTargetUrl) {
                            document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
                            setTimeout(() => openQualityPopup(window.__ytdlTargetUrl, window.__ytdlTargetTitle, window.__ytdlTargetUrl.includes('/shorts/')), 150);
                        } else {
                            alert("Waktu habis saat mencoba menangkap link Share.");
                        }
                    }
                }, 100);
            } else {
                if (window.__ytdlTargetUrl) {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
                    setTimeout(() => openQualityPopup(window.__ytdlTargetUrl, window.__ytdlTargetTitle, window.__ytdlTargetUrl.includes('/shorts/')), 150);
                } else {
                    alert("Gagal menangkap link: Tombol Share tidak ditemukan.");
                }
            }
        };

        const itemsList = menuList.querySelectorAll('yt-list-item-view-model');
        if (itemsList.length > 0) {
            const insertIndex = itemsList.length > 2 ? itemsList.length - 2 : itemsList.length - 1;
            menuList.insertBefore(menuItem, itemsList[insertIndex]);
        } else {
            menuList.appendChild(menuItem);
        }
    });
});
menuObserver.observe(document.body, { childList: true, subtree: true });

/* ══════════════════════════════════════════════════════
   MAXIMIZE / MINIMIZE LIBRARY
══════════════════════════════════════════════════════ */
document.getElementById('maximize-btn').onclick = () => {
    libraryMaximized = !libraryMaximized;
    sideP.classList.toggle('lib-maximized', libraryMaximized);
    maximizeBtn.textContent = libraryMaximized ? '⤡' : '⤢';
    maximizeBtn.title = libraryMaximized ? 'Kembalikan ukuran' : 'Perluas Library';
};

/* ══════════════════════════════════════════════════════
   FILTER & SCALE
══════════════════════════════════════════════════════ */
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
        libraryFilter = btn.dataset.filter;
        localStorage.setItem('ytdl_filter', libraryFilter);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === libraryFilter));
        loadHistory(true);
        if (lastScannedFiles.length > 0) renderScanList(lastScannedFiles);
    };
});

let playerVisible = localStorage.getItem('ytdl_player') !== 'hidden';
function applyPlayerVisibility() {
    const mainPEl = document.getElementById('main-p');
    const wrap    = document.getElementById('player-wrap');
    const icon    = document.getElementById('ptb-icon');
    mainPEl.classList.toggle('player-hidden', !playerVisible);
    icon.classList.toggle('collapsed', !playerVisible);
    wrap.style.overflow = 'hidden';
    if (!playerVisible) {
        wrap.style.maxHeight = '0'; wrap.style.opacity = '0'; wrap.style.marginBottom = '0';
    } else {
        wrap.style.maxHeight = '70vh'; wrap.style.opacity = '1'; wrap.style.marginBottom = '10px';
    }
}
document.getElementById('player-wrap').style.transition = 'max-height .35s ease, opacity .35s ease, margin-bottom .35s ease';
applyPlayerVisibility();

document.getElementById('player-toggle-bar').onclick = () => {
    playerVisible = !playerVisible;
    localStorage.setItem('ytdl_player', playerVisible ? 'visible' : 'hidden');
    if (!playerVisible) player.pause();
    applyPlayerVisibility();
};

function updateToggleBar(nowPlayingTitle, activeCount) {
    const titleEl = document.getElementById('ptb-title');
    const badge   = document.getElementById('ptb-badge');
    if (nowPlayingTitle) {
        titleEl.textContent = `▶ ${nowPlayingTitle}`; titleEl.className = 'ptb-title playing';
    } else {
        titleEl.textContent = playerVisible ? 'Sembunyikan Player' : 'Tampilkan Player'; titleEl.className = 'ptb-title';
    }
    if (activeCount > 0) {
        badge.textContent = `${activeCount} aktif`; badge.className = 'ptb-badge active';
    } else {
        badge.textContent = player.src && !player.paused ? '▶ Playing' : 'Idle'; badge.className = 'ptb-badge';
    }
}
updateToggleBar('', 0);

function applyScale() {
    const innerEl = document.getElementById('ytdl-inner');
    innerEl.style.transform = `scale(${uiScale})`;
    innerEl.style.width  = `${100/uiScale}%`;
    innerEl.style.height = `${100/uiScale}%`;
}
applyScale();
document.getElementById('scale-sl').oninput = function() {
    uiScale = parseFloat(this.value);
    localStorage.setItem('ytdl_scale', uiScale);
    document.getElementById('scale-lbl').textContent = Math.round(uiScale*100) + '%';
    applyScale();
};

function setView(v) {
    libraryView = v;
    localStorage.setItem('ytdl_view', v);
    document.getElementById('h-list').className = v;
    document.getElementById('scan-list').className = v;
    ['hbtn-grid','sbtn-grid'].forEach(id => document.getElementById(id).classList.toggle('active', v==='grid'));
    ['hbtn-list','sbtn-list'].forEach(id => document.getElementById(id).classList.toggle('active', v==='list'));
    loadHistory(true);
    if (lastScannedFiles.length > 0) renderScanList(lastScannedFiles);
}
document.getElementById('hbtn-grid').onclick = () => setView('grid');
document.getElementById('hbtn-list').onclick = () => setView('list');
document.getElementById('sbtn-grid').onclick = () => setView('grid');
document.getElementById('sbtn-list').onclick = () => setView('list');

function switchTab(t) {
    document.getElementById('tab-hist').classList.toggle('active', t==='hist');
    document.getElementById('tab-scan').classList.toggle('active', t==='scan');
    document.getElementById('hist-panel').classList.toggle('hidden', t!=='hist');
    document.getElementById('scan-panel').classList.toggle('show', t==='scan');
    if (t==='scan') loadScanConfig();
}
document.getElementById('tab-hist').onclick = () => switchTab('hist');
document.getElementById('tab-scan').onclick = () => switchTab('scan');

fabLib.onclick = () => { modal.classList.add('show'); loadHistory(); };
fabDl.onclick = () => {
    if (location.pathname.startsWith('/watch') || location.pathname.startsWith('/shorts/') || location.pathname.startsWith('/playlist')) {
        openQualityPopup(normalizeYtUrl(location.href), document.title, location.pathname.startsWith('/shorts/'));
    }
};
document.getElementById('close-ytdl').onclick = () => { modal.classList.remove('show'); player.pause(); };
document.getElementById('popup-cancel').onclick = () => popup.classList.remove('show');

/* ══════════════════════════════════════════════════════
   SSE PENGAMAT DOWNLOAD
══════════════════════════════════════════════════════ */
const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
if (!_w.__ytdlSSE || _w.__ytdlSSE.readyState === EventSource.CLOSED) {
    _w.__ytdlSSE = new EventSource(`${API}/api/events`);
    _w.__ytdlProg = {};
}
_w.__ytdlSSE.onmessage = (e) => {
    const data = JSON.parse(e.data);
    _w.__ytdlProg = data;
    const n = Object.keys(data).length;
    if (n > 0) {
        fabLib.textContent = '';
        fabLib.appendChild(document.createTextNode('⏳'));
        const badge = el('span', { class: 'badge', textContent: String(n) });
        fabLib.appendChild(badge);
    } else {
        fabLib.textContent = '📂';
    }
    renderDlPanel(data);
    const playing = player.src && !player.paused ? document.getElementById('p-title')?.textContent : '';
    updateToggleBar(playing || '', n);
};

/* ══════════════════════════════════════════════════════
   ACTIVE DOWNLOAD PANEL
══════════════════════════════════════════════════════ */
function renderDlPanel(data) {
    const panel = document.getElementById('dl-panel');
    if (!panel) return;
    const entries = Object.entries(data);
    if (entries.length === 0) {
        panel.replaceChildren();
        panel.appendChild(el('p', { class: 'dl-empty', textContent: 'Tidak ada unduhan aktif' }));
        return;
    }

    entries.forEach(([url, info]) => {
        let card = panel.querySelector(`[data-url="${CSS.escape(url)}"]`);
        if (!card) {
            const emp = panel.querySelector('.dl-empty'); if (emp) emp.remove();
            card = document.createElement('div'); card.className = 'dl-card'; card.setAttribute('data-url', url);
            panel.appendChild(card);
        }

        const vp       = info.videoPercent    || 0;
        const ap       = info.audioPercent    || 0;
        const sp       = info.subtitlePercent || 0;
        const phase    = info.phase || 'video';
        const isPaused = !!info.paused;
        const isPlaylist = !!info.isPlaylist;
        const spd      = info.speed ? `⚡ ${info.speed}` : '';
        const eta      = info.eta   ? `⏱ ${info.eta}`   : '';
        const title    = (info.title || url).substring(0, 50);
        const qual     = info.quality || '';
        const fsz      = info.filesize ? `💾 ${info.filesize}` : '';
        const thumb    = info.thumbnail || '';

        const done      = phase === 'done';
        const merging   = phase === 'merging';
        const cancelled = phase === 'cancelled';
        const subMerge  = phase === 'subtitle';
        const subDl     = phase === 'subtitle_dl';
        const playlist  = phase === 'playlist';
        const active    = !done && !merging && !cancelled && !subMerge;

        const videoActive = phase === 'video' || playlist;
        const audioActive = phase === 'audio' || phase === 'subtitle_dl';

        const statusColor = isPaused ? '#fa0'
            : ({ video:'#f44', audio:'#3ea6ff', subtitle_dl:'#a0f', merging:'#fa0', subtitle:'#a0f', done:'#0c6', cancelled:'#f44', playlist: '#0a5' }[phase] || '#888');
        const statusText = isPaused ? '⏸ Dijeda'
            : (playlist ? (info.status || '📥 Mengunduh Playlist...') 
            : ({ video:'⬇ Video...', audio:'⬇ Audio...', subtitle_dl:'💬 Subtitle...', merging:'🔀 Menggabungkan...', subtitle:'💬 Menyisipkan subtitle...', done:'✅ Selesai', cancelled:'❌ Dibatalkan' }[phase] || phase));

        const vDim = videoActive ? '' : (vp >= 100 ? 'opacity:0.45;' : 'opacity:0.2;');
        const aDim = audioActive ? '' : (ap >= 100 ? 'opacity:0.45;' : 'opacity:0.2;');
        const pauseDim = isPaused ? 'opacity:0.4;' : '';

        // Build card HTML safely
        const htmlParts = [];
        htmlParts.push(`<div class="dl-hdr">`);
        if (thumb) htmlParts.push(`<img src="${thumbSrc(thumb)}" onerror="this.style.display='none'">`);
        htmlParts.push(`<div class="dl-hdr-text">${title}</div>`);
        if (qual) htmlParts.push(`<span class="dl-badge">${qual}</span>`);
        htmlParts.push(`</div>`);
        if (isPaused) htmlParts.push(`<div class="dl-paused-label">⏸ Dijeda</div>`);

        let bars = '';
        if (playlist) {
            bars = `
                <div class="dl-row"><span>📦 Playlist Progress</span><span class="spd">${!isPaused ? spd : ''}</span></div>
                <div class="pbar" style="background:#1a3a1a;"><div class="pbar-fill" style="width:${vp}%; background:linear-gradient(90deg,#0a5,#0f7);"></div></div>
                <div class="dl-row"><span style="font-size:9px;color:#aaa;">${info.status || ''}</span><span class="eta">${!isPaused ? eta : ''}</span></div>
            `;
        } else {
            bars = `
                <div class="dl-row"><span style="${vDim}${pauseDim}">🎬 Video <b>${vp.toFixed(1)}%</b></span><span class="spd">${videoActive && !isPaused ? spd : ''}</span></div>
                <div class="pbar" style="${vDim}${pauseDim}"><div class="pbar-fill pbar-v" style="width:${vp}%"></div></div>
                <div class="dl-row"><span style="${aDim}${pauseDim}">🔊 Audio <b>${ap.toFixed(1)}%</b></span><span class="eta">${audioActive && !isPaused ? eta : ''}</span></div>
                <div class="pbar" style="${aDim}${pauseDim}"><div class="pbar-fill pbar-a" style="width:${ap}%"></div></div>
                ${subDl ? `<div class="dl-row"><span style="color:#a0f">💬 Subtitle <b>${sp.toFixed(1)}%</b></span></div><div class="pbar"><div class="pbar-fill pbar-s" style="width:${sp}%"></div></div>` : ''}
            `;
        }

        if (cancelled) {
            htmlParts.push(`<p style="text-align:center;color:#f44;font-size:11px;margin:4px 0">❌ Dibatalkan</p>`);
        } else if (done) {
            htmlParts.push(`<div class="dl-row"><span style="color:#0c6">✅ Selesai</span><span>${fsz}</span></div><div class="pbar"><div class="pbar-fill pbar-v" style="width:100%"></div></div>`);
        } else if (subMerge) {
            htmlParts.push(bars);
            htmlParts.push(`<div class="dl-row"><span style="color:#a0f">💬 Menyisipkan subtitle ke file...</span></div><div class="pbar"><div class="pbar-fill pbar-s" style="width:100%"></div></div>`);
        } else if (merging) {
            htmlParts.push(bars);
            htmlParts.push(`<div class="dl-row"><span style="color:#fa0">🔀 Menggabungkan...</span></div><div class="pbar"><div class="pbar-fill pbar-m" style="width:100%"></div></div>`);
        } else {
            htmlParts.push(bars);
        }

        htmlParts.push(`<div class="dl-foot"><span class="dl-status" style="color:${statusColor}">${!done && !cancelled ? statusText : ''}</span><span>${done || cancelled ? fsz : ''}</span>`);
        if (active) {
            htmlParts.push(`<div class="dl-foot-btns"><button class="dl-pause ${isPaused ? 'is-paused' : ''}" data-url="${url}" data-paused="${isPaused}">${isPaused ? '▶ Lanjutkan' : '⏸ Jeda'}</button><button class="dl-cancel" data-url="${url}">✕ Batalkan</button></div>`);
        }
        htmlParts.push(`</div>`);

        safeSetInner(card, htmlParts.join(''));

        const cancelBtn = card.querySelector('.dl-cancel');
        if (cancelBtn) {
            cancelBtn.onclick = function() {
                if (!confirm(`Batalkan unduhan "${title}"?`)) return;
                this.disabled = true; this.textContent = 'Membatalkan...';
                GM_xmlhttpRequest({ method: 'POST', url: `${API}/api/cancel`, headers: {'Content-Type':'application/json'}, data: JSON.stringify({ url }), onload: () => { lastHistoryLen = -1; } });
            };
        }

        const pauseBtn = card.querySelector('.dl-pause');
        if (pauseBtn) {
            pauseBtn.onclick = function() {
                const btnUrl = this.dataset.url;
                this.disabled = true;
                const wasPaused = this.dataset.paused === 'true';
                this.textContent = wasPaused ? '⏳ Melanjutkan...' : '⏳ Menjeda...';
                GM_xmlhttpRequest({
                    method: 'POST', url: `${API}/api/pause`, headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ url: btnUrl }),
                    onload: (res) => {
                        try {
                            const r = JSON.parse(res.responseText);
                            if (_w.__ytdlProg && _w.__ytdlProg[btnUrl]) _w.__ytdlProg[btnUrl].paused = r.paused;
                            renderDlPanel(_w.__ytdlProg || {});
                        } catch(_) { this.disabled = false; this.textContent = wasPaused ? '▶ Lanjutkan' : '⏸ Jeda'; }
                    },
                    onerror: () => { this.disabled = false; this.textContent = wasPaused ? '▶ Lanjutkan' : '⏸ Jeda'; }
                });
            };
        }
    });

    panel.querySelectorAll('.dl-card').forEach(c => { if (!data[c.getAttribute('data-url')]) c.remove(); });
}

function pathToStreamKey(fullPath) {
    const bytes = new TextEncoder().encode(fullPath); let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function playFile(fileName, folderPath, title) {
    document.getElementById('p-title').textContent = title || fileName;
    const src = folderPath
        ? `${API}/api/stream/${pathToStreamKey(folderPath.replace(/\/$/, '') + '/' + fileName)}`
        : `${API}/files/${encodeURIComponent(fileName)}`;
    player.src = src;
    player.play();
    if (!playerVisible) { playerVisible = true; localStorage.setItem('ytdl_player', 'visible'); applyPlayerVisibility(); }
    updateToggleBar(title || fileName, Object.keys(_w.__ytdlProg || {}).length);

    const toggleRow = document.getElementById('sub-toggle-row');
    const sel       = document.getElementById('sub-track-sel');
    const badge     = document.getElementById('sub-on-badge');
    player.querySelectorAll('track').forEach(t => t.remove());
    sel.replaceChildren();
    sel.appendChild(el('option', { value: '' }, ['— Nonaktif —']));
    if (badge) badge.style.display = 'none';
    if (toggleRow) toggleRow.style.display = 'none';
    if (!fileName || !folderPath) return;

    GM_xmlhttpRequest({
        method: 'GET',
        url: `${API}/api/subtitles?fileName=${encodeURIComponent(fileName)}&folderPath=${encodeURIComponent(folderPath)}`,
        onload: (res) => {
            try {
                const tracks = JSON.parse(res.responseText);
                if (!tracks || !tracks.length) return;
                toggleRow.style.display = 'flex';
                tracks.forEach(t => {
                    const opt = el('option', { value: t.streamKey }, [`${t.label} (${t.lang})`]);
                    sel.appendChild(opt);
                    const track = document.createElement('track');
                    track.kind = 'subtitles'; track.label = t.label; track.srclang = t.lang;
                    track.src = `${API}/api/subtitle-stream/${t.streamKey}`;
                    player.appendChild(track);
                });
                sel.onchange = function() {
                    const chosen = this.options[this.selectedIndex].textContent;
                    Array.from(player.textTracks).forEach(tt => {
                        tt.mode = (tt.label === chosen && this.value !== '') ? 'showing' : 'hidden';
                    });
                    if (badge) badge.style.display = this.value ? 'inline' : 'none';
                };
            } catch(_) {}
        }
    });
}

/* ══════════════════════════════════════════════════════
   PEMBUATAN KARTU (DENGAN DRAG AND DROP)
══════════════════════════════════════════════════════ */
function createCardElement(item, shorts, asShelf, isScan) {
    const folder = item.folderPath ? item.folderPath.split(/[\\/]/).filter(Boolean).pop() : (isScan ? 'Hasil Scan' : '');
    const card = document.createElement('div');
    const extOrSize = item.filesize || item.quality || '';
    const inLib = item.inHistory;

    card.className = `v-card${shorts ? ' shorts-card' : ''}${asShelf ? ' shelf-card' : ''}`;

    // thumb
    const thumbWrap = el('div', { class: 'thumb-wrap' });
    if (item.thumbnail) {
        const img = el('img', { src: thumbSrc(item.thumbnail) });
        img.onerror = () => { img.style.display = 'none'; noThumb.style.display = 'flex'; };
        thumbWrap.appendChild(img);
    }
    const noThumb = el('div', { class: 'no-thumb', style: item.thumbnail ? 'display:none' : '', textContent: shorts ? '📱' : '🎬' });
    thumbWrap.appendChild(noThumb);
    card.appendChild(thumbWrap);

    const qualBadge = el('span', { class: 'thumb-quality', textContent: extOrSize });
    card.appendChild(qualBadge);

    if (shorts) card.appendChild(el('span', { class: 'type-badge', textContent: 'SHORTS' }));

    if (isScan) {
        const scAdd = el('button', { class: 'sc-add' + (inLib ? ' in-lib' : ''), title: inLib ? 'Sudah di Library' : 'Tambah ke Library', textContent: inLib ? '✓' : '+' });
        card.appendChild(scAdd);
    } else {
        const delB = el('button', { class: 'del-b', title: 'Hapus Permanen', textContent: '🗑' });
        card.appendChild(delB);
    }

    const cb = el('div', { class: 'cb' });
    const cardTitle = el('div', { class: 'card-title' });
    cardTitle.title = item.title;
    cardTitle.textContent = item.title;
    const cardTags = el('div', { class: 'card-tags' });
    if (folder) {
        const tagF = el('span', { class: 'tag tag-f' }); tagF.title = item.folderPath || '';
        tagF.textContent = '📂 ' + folder; cardTags.appendChild(tagF);
    }
    if (!isScan && item.filesize) cardTags.appendChild(el('span', { class: 'tag tag-s', textContent: '💾 ' + item.filesize }));
    if (shorts) cardTags.appendChild(el('span', { class: 'tag tag-shorts', textContent: '📱 Shorts' }));

    const cardActs = el('div', { class: 'card-acts' });
    const playBtn = el('button', { class: 'play-b', textContent: '▶ Play' });
    cardActs.appendChild(playBtn);

    if (isScan && !inLib) {
        const scAddBtn = el('button', { class: 'sc-add-btn', style: 'background:#0a5;color:#fff;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-size:10px;font-weight:700', textContent: '+ Library' });
        cardActs.appendChild(scAddBtn);
    }
    cb.appendChild(cardTitle); cb.appendChild(cardTags); cb.appendChild(cardActs);
    card.appendChild(cb);

    playBtn.onclick = () => {
        if (isScan) {
            document.getElementById('p-title').textContent = item.title;
            player.src = `${API}/api/stream/${item.streamKey}`; player.play();
            if (!playerVisible) { playerVisible = true; localStorage.setItem('ytdl_player', 'visible'); applyPlayerVisibility(); }
        } else {
            playFile(item.fileName, item.folderPath || null, item.title);
        }
    };

    if (isScan) {
        const addBtnEl = card.querySelector('.sc-add');
        const addBtnCb = card.querySelector('.sc-add-btn');
        const addToLib = () => {
            GM_xmlhttpRequest({
                method: 'POST', url: `${API}/api/history/add`, headers: {'Content-Type':'application/json'},
                data: JSON.stringify({ title: item.title, quality: extOrSize, thumbnail: item.thumbnail || '', fileName: item.fileName, filesize: item.filesize, folderPath: item.folderPath, isShorts: shorts, sourceUrl: item.sourceUrl || '' }),
                onload: () => {
                    if (addBtnEl) { addBtnEl.className = 'sc-add in-lib'; addBtnEl.textContent = '✓'; addBtnEl.title = 'Sudah di Library'; }
                    if (addBtnCb) addBtnCb.remove();
                    item.inHistory = true; lastHistoryLen = -1;
                }
            });
        };
        if (addBtnEl) addBtnEl.onclick = (e) => { e.stopPropagation(); if(!item.inHistory) addToLib(); };
        if (addBtnCb) addBtnCb.onclick = (e) => { e.stopPropagation(); if(!item.inHistory) addToLib(); };
    } else {
        const delBtnEl = card.querySelector('.del-b');
        if (delBtnEl) {
            delBtnEl.onclick = (e) => {
                e.stopPropagation();
                if (!confirm('Hapus file ini secara permanen?')) return;
                GM_xmlhttpRequest({
                    method: 'DELETE', url: `${API}/api/history`, headers: {'Content-Type':'application/json'},
                    data: JSON.stringify({ fileName: item.fileName, folderPath: item.folderPath || null }),
                    onload: () => {
                        let vMap = JSON.parse(localStorage.getItem('ytdl_virtual_folder_map') || '{}');
                        if (vMap[item.fileName]) { delete vMap[item.fileName]; localStorage.setItem('ytdl_virtual_folder_map', JSON.stringify(vMap)); }
                        lastHistoryLen = -1; loadHistory(true);
                    }
                });
            };
        }
        card.draggable = true;
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', item.fileName); card.classList.add('is-dragging'); });
        card.addEventListener('dragend', () => { card.classList.remove('is-dragging'); });
    }
    return card;
}

/* ══════════════════════════════════════════════════════
   RENDER LIBRARY
══════════════════════════════════════════════════════ */
function loadHistory(force) {
    GM_xmlhttpRequest({
        method: 'GET', url: `${API}/api/history`,
        onload: (res) => {
            try {
                const hist = JSON.parse(res.responseText);
                if (!force && hist.length === lastHistoryLen) return;
                lastHistoryLen = hist.length;
                renderHistory(hist);
            } catch (err) {
                const hListEl = document.getElementById('h-list');
                hListEl.replaceChildren();
                const errMsg = el('p', { style: 'text-align:center;color:#f55;margin-top:20px;padding:20px;border:1px solid #f55;border-radius:10px;background:#200;', textContent: '❌ Gagal membaca data JSON. Server backend tidak membalas dengan format yang benar.' });
                hListEl.appendChild(errMsg);
            }
        },
        onerror: () => {
            const hListEl = document.getElementById('h-list');
            hListEl.replaceChildren();
            const errMsg = el('p', { style: 'text-align:center;color:#f55;margin-top:20px;padding:20px;border:1px solid #f55;border-radius:10px;background:#200;', textContent: '❌ Koneksi Terputus. Pastikan backend server sudah menyala di localhost:8989.' });
            hListEl.appendChild(errMsg);
        }
    });
}

function renderHistory(hist) {
    const list = document.getElementById('h-list');
    list.className = libraryView;
    list.replaceChildren();
    if (!hist.length) { list.appendChild(el('p', { style: 'text-align:center;color:#333;margin-top:20px', textContent: 'Belum ada library.' })); return; }

    let virtualFolderMap = JSON.parse(localStorage.getItem('ytdl_virtual_folder_map') || '{}');
    let customFoldersList = JSON.parse(localStorage.getItem('ytdl_custom_folders') || '[]');
    let mappedFoldersChanged = false;

    let filtered = [...hist].reverse();
    if (libraryFilter === 'shorts') filtered = filtered.filter(item => checkIsShorts(item));
    else if (libraryFilter === 'video') filtered = filtered.filter(item => !checkIsShorts(item));

    if (!filtered.length) { list.appendChild(el('p', { style: 'text-align:center;color:#333;margin-top:20px', textContent: `Tidak ada ${libraryFilter === 'shorts' ? 'Shorts' : 'Video'} di library.` })); return; }

    const collapsedFolders = JSON.parse(localStorage.getItem('ytdl_collapsed_folders') || '{}');
    let shortsForShelf = [];
    let itemsForGroups = [];

    filtered.forEach(item => {
        let autoFolder = null;
        if (!virtualFolderMap[item.fileName] && item.sourceUrl) {
            const match = item.sourceUrl.match(/[?&]list=([^&]+)/);
            if (match && match[1]) {
                const mappedName = localStorage.getItem('ytdl_plist_' + match[1]);
                if (mappedName) { autoFolder = mappedName; virtualFolderMap[item.fileName] = autoFolder; mappedFoldersChanged = true; }
            }
        }
        let cName = virtualFolderMap[item.fileName] || autoFolder;
        if (cName) { itemsForGroups.push(item); }
        else {
            if (libraryFilter === 'all' && checkIsShorts(item)) { shortsForShelf.push(item); }
            else { itemsForGroups.push(item); }
        }
    });

    if (mappedFoldersChanged) localStorage.setItem('ytdl_virtual_folder_map', JSON.stringify(virtualFolderMap));

    // Shorts shelf
    if (shortsForShelf.length > 0) {
        const shelfGroup = el('div', { class: 'folder-group' });
        const shelfKey = '__shorts_shelf_lib__';
        const isCollapsed = collapsedFolders[shelfKey];
        const shelfHeader = el('div', { class: `folder-group-header${isCollapsed ? ' collapsed' : ''}`, style: 'background:linear-gradient(90deg,#500,#1a1a1a)' });
        shelfHeader.appendChild(el('span', { class: 'fg-icon', textContent: '📱' }));
        shelfHeader.appendChild(el('span', { class: 'fg-name', style: 'color:#fff;', textContent: 'Rak Shorts (Drop kesini untuk keluar folder)' }));
        shelfHeader.appendChild(el('span', { class: 'fg-count', style: 'background:rgba(0,0,0,0.5);', textContent: String(shortsForShelf.length) }));
        shelfHeader.appendChild(el('span', { class: 'fg-toggle', textContent: '▼' }));

        shelfHeader.addEventListener('dragover', (e) => { e.preventDefault(); shelfHeader.classList.add('drag-over'); });
        shelfHeader.addEventListener('dragleave', () => { shelfHeader.classList.remove('drag-over'); });
        shelfHeader.addEventListener('drop', (e) => {
            e.preventDefault(); shelfHeader.classList.remove('drag-over');
            const fn = e.dataTransfer.getData('text/plain');
            if (fn) { let vMap = JSON.parse(localStorage.getItem('ytdl_virtual_folder_map') || '{}'); delete vMap[fn]; localStorage.setItem('ytdl_virtual_folder_map', JSON.stringify(vMap)); lastHistoryLen = -1; loadHistory(true); }
        });

        const shelfBody = el('div', { class: `shorts-shelf-container${isCollapsed ? ' collapsed' : ''}` });
        shelfHeader.onclick = () => {
            const collapsed = !shelfHeader.classList.contains('collapsed');
            shelfHeader.classList.toggle('collapsed', collapsed); shelfBody.classList.toggle('collapsed', collapsed);
            const saved = JSON.parse(localStorage.getItem('ytdl_collapsed_folders') || '{}');
            if (collapsed) saved[shelfKey] = true; else delete saved[shelfKey];
            localStorage.setItem('ytdl_collapsed_folders', JSON.stringify(saved));
        };
        shortsForShelf.forEach(item => shelfBody.appendChild(createCardElement(item, true, true, false)));
        shelfGroup.appendChild(shelfHeader); shelfGroup.appendChild(shelfBody); list.appendChild(shelfGroup);
    }

    // Folder groups
    const groups = {};
    customFoldersList.forEach(cf => { groups[`__custom__${cf}`] = { label: `📁 ${cf}`, items: [], isCustom: true, rawName: cf }; });

    itemsForGroups.forEach(item => {
        let folderKey;
        if (virtualFolderMap[item.fileName]) {
            const cName = virtualFolderMap[item.fileName]; folderKey = `__custom__${cName}`;
            if (!groups[folderKey]) groups[folderKey] = { label: `📁 ${cName}`, items: [], isCustom: true, rawName: cName };
        } else {
            folderKey = item.folderPath || '__default__';
            const folderLabel = folderKey === '__default__' ? '📥 Unduhan Utama' : ('📂 ' + (folderKey.split(/[\\/]/).filter(Boolean).pop() || folderKey));
            if (!groups[folderKey]) groups[folderKey] = { label: folderLabel, items: [], isCustom: false, rawName: folderKey };
        }
        groups[folderKey].items.push(item);
    });

    Object.entries(groups).forEach(([folderKey, group]) => {
        if (!group.isCustom && group.items.length === 0) return;
        const groupEl = el('div', { class: 'folder-group' });
        const isCollapsed = collapsedFolders[folderKey];
        const header = el('div', { class: `folder-group-header${isCollapsed ? ' collapsed' : ''}` });
        header.appendChild(el('span', { class: 'fg-name', textContent: group.label }));
        header.appendChild(el('span', { class: 'fg-count', textContent: String(group.items.length) }));
        if (group.isCustom) {
            const delBtn = el('button', { class: 'fg-del-btn', title: 'Hapus Folder (Video tidak ikut terhapus)', textContent: '✕' });
            header.appendChild(delBtn);
        }
        header.appendChild(el('span', { class: 'fg-toggle', textContent: '▼' }));

        header.addEventListener('dragover', (e) => { e.preventDefault(); header.classList.add('drag-over'); });
        header.addEventListener('dragleave', () => { header.classList.remove('drag-over'); });
        header.addEventListener('drop', (e) => {
            e.preventDefault(); header.classList.remove('drag-over');
            const fn = e.dataTransfer.getData('text/plain');
            if (fn) {
                let vMap = JSON.parse(localStorage.getItem('ytdl_virtual_folder_map') || '{}');
                if (group.isCustom) { vMap[fn] = group.rawName; } else { delete vMap[fn]; }
                localStorage.setItem('ytdl_virtual_folder_map', JSON.stringify(vMap));
                lastHistoryLen = -1; loadHistory(true);
            }
        });

        const body = el('div', { class: `folder-group-body${isCollapsed ? ' collapsed' : ''}` });

        header.onclick = (e) => {
            if (e.target.classList.contains('fg-del-btn')) return;
            const collapsed = !header.classList.contains('collapsed');
            header.classList.toggle('collapsed', collapsed); body.classList.toggle('collapsed', collapsed);
            const saved = JSON.parse(localStorage.getItem('ytdl_collapsed_folders') || '{}');
            if (collapsed) saved[folderKey] = true; else delete saved[folderKey];
            localStorage.setItem('ytdl_collapsed_folders', JSON.stringify(saved));
        };

        if (group.isCustom) {
            const delBtnEl = header.querySelector('.fg-del-btn');
            if (delBtnEl) delBtnEl.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Hapus folder "${group.rawName}"?\n(Video di dalamnya hanya akan kembali ke daftar utama)`)) {
                    let cList = JSON.parse(localStorage.getItem('ytdl_custom_folders') || '[]');
                    cList = cList.filter(f => f !== group.rawName); localStorage.setItem('ytdl_custom_folders', JSON.stringify(cList));
                    let vMap = JSON.parse(localStorage.getItem('ytdl_virtual_folder_map') || '{}');
                    for (let fn in vMap) { if (vMap[fn] === group.rawName) delete vMap[fn]; }
                    localStorage.setItem('ytdl_virtual_folder_map', JSON.stringify(vMap));
                    lastHistoryLen = -1; loadHistory(true);
                }
            };
        }

        group.items.forEach(item => body.appendChild(createCardElement(item, checkIsShorts(item), false, false)));
        groupEl.appendChild(header); groupEl.appendChild(body); list.appendChild(groupEl);
    });
}

/* ══════════════════════════════════════════════════════
   QUALITY POPUP
══════════════════════════════════════════════════════ */
function openQualityPopup(videoUrl, titleHint, isShorts) {
    document.getElementById('popup-title').textContent = titleHint || '';
    const qListEl = document.getElementById('q-list');
    qListEl.replaceChildren();
    const loadingMsg = el('span', { style: 'color:#555;font-size:13px', textContent: 'Menganalisis...' });
    const urlNote = el('span', { style: 'font-size:9px;color:#888;word-break:break-all', textContent: 'URL: ' + videoUrl });
    loadingMsg.appendChild(document.createElement('br')); loadingMsg.appendChild(urlNote);
    qListEl.appendChild(loadingMsg);

    const plZone = document.getElementById('playlist-inject-zone');
    plZone.replaceChildren();

    const urlObj = new URL(videoUrl, location.origin);
    const listId = urlObj.searchParams.get('list');

    if (listId) {
        let pTitle = document.title.replace(' - YouTube', '').trim();
        const panelTitle = document.querySelector('.ytd-playlist-panel-renderer .title, yt-dynamic-sizing-formatted-string.ytd-playlist-header-renderer');
        if (panelTitle) pTitle = panelTitle.textContent.trim();

        const plBox = el('div', { style: 'margin-bottom:15px;background:#2a2a2a;padding:12px;border-radius:8px;border:1px solid #444;' });
        const plInfo = el('p', { style: 'font-size:11px;color:#aaa;margin:0 0 8px;text-align:left;', textContent: 'Deteksi Playlist: ' });
        const plName = el('b', { style: 'color:#fff', textContent: pTitle });
        plInfo.appendChild(plName);
        const dlPlBtn = el('button', { id: 'btn-dl-playlist', style: 'width:100%;background:#0a5;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:bold;cursor:pointer;', textContent: '🗂️ Download Seluruh Playlist' });
        const divider = el('div', { style: 'margin:10px 0;border-top:1px solid #444;' });
        const singleInfo = el('p', { style: 'font-size:11px;color:#aaa;margin:10px 0 5px;text-align:left;', textContent: 'Atau pilih kualitas untuk video ini saja:' });
        plBox.appendChild(plInfo); plBox.appendChild(dlPlBtn); plBox.appendChild(divider); plBox.appendChild(singleInfo);
        plZone.appendChild(plBox);

        dlPlBtn.onclick = () => {
            let cList = JSON.parse(localStorage.getItem('ytdl_custom_folders') || '[]');
            if (!cList.includes(pTitle)) { cList.push(pTitle); localStorage.setItem('ytdl_custom_folders', JSON.stringify(cList)); }
            localStorage.setItem('ytdl_plist_' + listId, pTitle);
            const purePlaylistUrl = `https://www.youtube.com/playlist?list=${listId}`;
            GM_xmlhttpRequest({
                method: 'POST', url: `${API}/api/download`, headers: {'Content-Type':'application/json'},
                data: JSON.stringify({ url: purePlaylistUrl, format_id: 'best', title: pTitle, quality: 'Playlist', thumbnail: '', isShorts: false, sourceUrl: purePlaylistUrl, folderName: pTitle })
            });
            popup.classList.remove('show');
            setTimeout(() => { lastHistoryLen = -1; loadHistory(true); }, 1000);
        };
    }

    popup.classList.add('show');

    GM_xmlhttpRequest({
        method: 'GET', url: `${API}/api/info?url=${encodeURIComponent(videoUrl)}`,
        onload: (res) => {
            let data;
            try { data = JSON.parse(res.responseText); } catch(_) {
                qListEl.replaceChildren();
                qListEl.appendChild(el('span', { style: 'color:#f55;font-size:12px;', textContent: '❌ Gagal memuat info. Format respons dari server salah.' }));
                return;
            }
            if (data.error) {
                qListEl.replaceChildren();
                qListEl.appendChild(el('span', { style: 'color:#f55;font-size:12px;', textContent: '❌ yt-dlp error: ' + data.error }));
                return;
            }

            document.getElementById('popup-title').textContent = (data.title || '').substring(0, 55);
            qListEl.replaceChildren();

            if (!data.formats || !data.formats.length) {
                qListEl.appendChild(el('span', { style: 'color:#f55', textContent: 'Tidak ada format tersedia' }));
                return;
            }

            const subLangs = data.subtitleLangs || [];
            if (subLangs.length > 0) {
                const subRow = el('div', { class: 'dl-sub-row' });
                subRow.appendChild(document.createTextNode('💬 '));
                const subRowLabel = el('label', { style: 'color:#a0f;font-weight:700;', textContent: 'Subtitle:' });
                const subRowSel = el('select', { id: 'popup-sub-sel', style: 'margin-left:4px' });
                subRowSel.appendChild(el('option', { value: '' }, ['— Tidak —']));
                subLangs.forEach(l => {
                    const opt = el('option', { value: l }, [l]);
                    if (l === 'id' || l === 'en') opt.selected = true;
                    subRowSel.appendChild(opt);
                });
                subRow.appendChild(subRowLabel); subRow.appendChild(subRowSel);
                qListEl.appendChild(subRow);
            }

            data.formats.forEach(f => {
                const btn = el('button', { class: 'q-btn', textContent: f.quality });
                if (f.filesize) {
                    const sz = el('span', { class: 'q-sz', textContent: '~' + f.filesize });
                    btn.appendChild(sz);
                }
                btn.onclick = () => {
                    const subSelEl = document.getElementById('popup-sub-sel');
                    const subtitle_lang = subSelEl ? subSelEl.value : '';
                    GM_xmlhttpRequest({
                        method: 'POST', url: `${API}/api/download`, headers: {'Content-Type':'application/json'},
                        data: JSON.stringify({ url: videoUrl, format_id: f.format_id, title: data.title, quality: f.quality, thumbnail: data.thumbnail, isShorts: !!isShorts, sourceUrl: videoUrl, subtitle_lang: subtitle_lang || undefined })
                    });
                    popup.classList.remove('show');
                };
                qListEl.appendChild(btn);
            });
        },
        onerror: () => {
            qListEl.replaceChildren();
            qListEl.appendChild(el('span', { style: 'color:#f55', textContent: '❌ Koneksi ke backend terputus. (localhost:8989 down)' }));
        }
    });
}

/* ══════════════════════════════════════════════════════
   SCAN FOLDER LOGIC
══════════════════════════════════════════════════════ */
let mainFolder = '';
let scanFolders = [];

function loadScanConfig() {
    GM_xmlhttpRequest({
        method: 'GET', url: `${API}/api/config`,
        onload: (res) => {
            try {
                const cfg = JSON.parse(res.responseText);
                mainFolder = cfg.downloadFolder; scanFolders = cfg.scanFolders || []; renderFolderList();
                const bSel = document.getElementById('browser-sel');
                if (bSel) bSel.value = cfg.cookiesFromBrowser || '';
            } catch (err) { console.error("Gagal parse API config"); }
        },
        onerror: () => console.error("Koneksi gagal saat load Scan Config")
    });
}

function saveScanFolders() {
    GM_xmlhttpRequest({ method: 'POST', url: `${API}/api/config`, headers: {'Content-Type':'application/json'}, data: JSON.stringify({ scanFolders }) });
}

function renderFolderList() {
    const folderListDOM = document.getElementById('folder-list');
    folderListDOM.replaceChildren();
    const mainItem = el('div', { class: 'folder-item' });
    mainItem.appendChild(el('span', { textContent: '📥' }));
    const fpMain = el('span', { class: 'fp' }); fpMain.title = mainFolder; fpMain.textContent = mainFolder;
    mainItem.appendChild(fpMain);
    mainItem.appendChild(el('span', { class: 'fbadge', textContent: 'Utama' }));
    folderListDOM.appendChild(mainItem);

    scanFolders.forEach((f, i) => {
        const div = el('div', { class: 'folder-item' });
        div.appendChild(el('span', { textContent: '📂' }));
        const fpSpan = el('span', { class: 'fp' }); fpSpan.title = f; fpSpan.textContent = f;
        div.appendChild(fpSpan);
        const remBtn = el('button', { class: 'frem', textContent: '✕' });
        remBtn.onclick = () => { scanFolders.splice(i, 1); saveScanFolders(); renderFolderList(); };
        div.appendChild(remBtn);
        folderListDOM.appendChild(div);
    });
}

document.getElementById('folder-add-btn').onclick = () => {
    const inp = document.getElementById('folder-input'); const v = inp.value.trim();
    if (!v || v === mainFolder || scanFolders.includes(v)) { inp.value = ''; return; }
    scanFolders.push(v); saveScanFolders(); renderFolderList(); inp.value = '';
};
document.getElementById('folder-input').onkeydown = e => { if (e.key === 'Enter') document.getElementById('folder-add-btn').click(); };

document.getElementById('scan-btn').onclick = () => {
    const btn = document.getElementById('scan-btn');
    const stats = document.getElementById('scan-stats');
    const listEl = document.getElementById('scan-list');
    btn.disabled = true; btn.textContent = '⏳ Memindai...'; stats.textContent = '';
    listEl.replaceChildren(); listEl.appendChild(el('p', { class: 'sc-empty', textContent: 'Memindai...' }));
    GM_xmlhttpRequest({
        method: 'GET', url: `${API}/api/scan`,
        onload: (res) => {
            btn.disabled = false; btn.textContent = '🔍 Scan Sekarang';
            try { lastScannedFiles = JSON.parse(res.responseText); } catch(_) {
                listEl.replaceChildren(); listEl.appendChild(el('p', { class: 'sc-empty', style: 'color:#f55', textContent: 'Response tidak valid' })); return;
            }
            stats.textContent = `${lastScannedFiles.length} video ditemukan`; renderScanList(lastScannedFiles);
        },
        onerror: () => {
            btn.disabled = false; btn.textContent = '🔍 Scan Sekarang';
            listEl.replaceChildren(); listEl.appendChild(el('p', { class: 'sc-empty', style: 'color:#f55', textContent: 'Gagal terhubung ke server' }));
        }
    });
};

function renderScanList(files) {
    const listEl = document.getElementById('scan-list');
    listEl.className = libraryView;
    listEl.replaceChildren();

    if (!files.length) { listEl.appendChild(el('p', { class: 'sc-empty', textContent: 'Tidak ada video ditemukan.' })); return; }

    let filtered = [...files];
    if (libraryFilter === 'shorts') filtered = filtered.filter(item => checkIsShorts(item));
    else if (libraryFilter === 'video') filtered = filtered.filter(item => !checkIsShorts(item));
    if (!filtered.length) { listEl.appendChild(el('p', { style: 'text-align:center;color:#333;margin-top:20px', textContent: `Tidak ada ${libraryFilter === 'shorts' ? 'Shorts' : 'Video'} ditemukan.` })); return; }

    const collapsedFolders = JSON.parse(localStorage.getItem('ytdl_collapsed_folders') || '{}');
    let videosToGroup = filtered;

    if (libraryFilter === 'all') {
        const shortsItems = filtered.filter(item => checkIsShorts(item));
        videosToGroup = filtered.filter(item => !checkIsShorts(item));
        if (shortsItems.length > 0) {
            const shelfGroup = el('div', { class: 'folder-group' });
            const shelfKey = '__shorts_shelf_scan__';
            const isCollapsed = collapsedFolders[shelfKey];
            const shelfHeader = el('div', { class: `folder-group-header${isCollapsed ? ' collapsed' : ''}`, style: 'background:linear-gradient(90deg,#050,#1a1a1a)' });
            shelfHeader.appendChild(el('span', { class: 'fg-icon', textContent: '📱' }));
            shelfHeader.appendChild(el('span', { class: 'fg-name', style: 'color:#fff;', textContent: 'Rak Shorts (Hasil Scan)' }));
            shelfHeader.appendChild(el('span', { class: 'fg-count', style: 'background:rgba(0,0,0,0.5);', textContent: String(shortsItems.length) }));
            shelfHeader.appendChild(el('span', { class: 'fg-toggle', textContent: '▼' }));

            const shelfBody = el('div', { class: `shorts-shelf-container${isCollapsed ? ' collapsed' : ''}` });
            shelfHeader.onclick = () => {
                const collapsed = !shelfHeader.classList.contains('collapsed');
                shelfHeader.classList.toggle('collapsed', collapsed); shelfBody.classList.toggle('collapsed', collapsed);
                const saved = JSON.parse(localStorage.getItem('ytdl_collapsed_folders') || '{}');
                if (collapsed) saved[shelfKey] = true; else delete saved[shelfKey];
                localStorage.setItem('ytdl_collapsed_folders', JSON.stringify(saved));
            };
            shortsItems.forEach(item => shelfBody.appendChild(createCardElement(item, true, true, true)));
            shelfGroup.appendChild(shelfHeader); shelfGroup.appendChild(shelfBody); listEl.appendChild(shelfGroup);
        }
    }

    if (videosToGroup.length > 0) {
        const groups = {};
        videosToGroup.forEach(item => {
            const folderPath = item.folderPath || 'Hasil Scan';
            const folderLabel = '📂 ' + (folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath);
            if (!groups[folderPath]) groups[folderPath] = { label: folderLabel, items: [] };
            groups[folderPath].items.push(item);
        });
        Object.entries(groups).forEach(([folderPath, group]) => {
            const groupEl = el('div', { class: 'folder-group' });
            const isCollapsed = collapsedFolders[folderPath];
            const header = el('div', { class: `folder-group-header${isCollapsed ? ' collapsed' : ''}` });
            header.appendChild(el('span', { class: 'fg-name', textContent: group.label }));
            header.appendChild(el('span', { class: 'fg-count', textContent: String(group.items.length) }));
            header.appendChild(el('span', { class: 'fg-toggle', textContent: '▼' }));
            const body = el('div', { class: `folder-group-body${isCollapsed ? ' collapsed' : ''}` });
            header.onclick = () => {
                const collapsed = !header.classList.contains('collapsed');
                header.classList.toggle('collapsed', collapsed); body.classList.toggle('collapsed', collapsed);
                const saved = JSON.parse(localStorage.getItem('ytdl_collapsed_folders') || '{}');
                if (collapsed) saved[folderPath] = true; else delete saved[folderPath];
                localStorage.setItem('ytdl_collapsed_folders', JSON.stringify(saved));
            };
            group.items.forEach(item => body.appendChild(createCardElement(item, checkIsShorts(item), false, true)));
            groupEl.appendChild(header); groupEl.appendChild(body); listEl.appendChild(groupEl);
        });
    }
}

/* ══════════════════════════════════════════════════════
   AUTO REFRESH
══════════════════════════════════════════════════════ */
let prevKeys = '';
setInterval(() => {
    const keys = Object.keys(_w.__ytdlProg || {}).join(',');
    if (keys !== prevKeys && keys.length < prevKeys.length) loadHistory(true);
    prevKeys = keys;
    if (modal.classList.contains('show')) loadHistory();
    if (_w.__ytdlProg && Object.keys(_w.__ytdlProg).length > 0) renderDlPanel(_w.__ytdlProg);
}, 2000);

})();