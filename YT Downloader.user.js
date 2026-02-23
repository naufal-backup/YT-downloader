// ==UserScript==
// @name         YouTube Downloader
// @namespace    http://tampermonkey.net/
// @version      9.5
// @description  yt-dlp + Persistent SSE + Homepage Menu + Grid/List + Speed + Size + Cancel + Scan Folder
// @match        *://*.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
    'use strict';
    const API = 'http://localhost:8989';
    let libraryView = localStorage.getItem('ytdl_view') || 'grid';
    let uiScale = parseFloat(localStorage.getItem('ytdl_scale') || '1');
    let lastHistoryLen = -1;

    /* ══════════════════════════════════════════════════════
       CSS
    ══════════════════════════════════════════════════════ */
    document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
    /* FAB */
    #ytdl-fab{position:fixed;bottom:20px;right:20px;width:55px;height:55px;background:#e00;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,.5);z-index:999999;font-size:22px;transition:all .3s;border:2px solid rgba(255,255,255,.2);user-select:none}
    #ytdl-fab .badge{position:absolute;top:-4px;right:-4px;background:#fa0;color:#000;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center}

    /* QUALITY POPUP */
    #ytdl-popup{display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#181818;color:#fff;padding:22px;border-radius:14px;z-index:10000000;width:340px;box-shadow:0 0 40px rgba(0,0,0,.9);border:1px solid #3a3a3a;text-align:center}
    #ytdl-popup.show{display:block}
    #ytdl-popup h3{margin:0 0 5px;font-size:15px}
    #ytdl-popup .sub{font-size:11px;color:#888;margin-bottom:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .q-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .q-btn{background:#2a2a2a;color:#fff;border:1px solid #444;padding:12px 8px;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:3px}
    .q-btn:hover{background:#e00;border-color:#e00}
    .q-btn .q-sz{font-size:10px;color:#aaa;font-weight:400}
    .q-btn:hover .q-sz{color:#ffc}

    /* MODAL */
    #ytdl-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:9999999;color:#fff;box-sizing:border-box}
    #ytdl-modal.show{display:flex}
    #ytdl-inner{display:grid;grid-template-columns:1fr 430px;gap:20px;width:100%;height:100%;padding:20px;box-sizing:border-box;transform-origin:top left}

    /* LEFT PANEL */
    .main-p{display:flex;flex-direction:column;background:#000;border-radius:14px;padding:20px;border:1px solid #222;overflow:hidden;min-height:0}
    .main-p video{width:100%;border-radius:10px;background:#111;max-height:48vh;flex-shrink:0;transition:max-height .35s ease,opacity .35s ease,margin .35s ease}
    .main-p.player-hidden video{max-height:0;opacity:0;margin:0;pointer-events:none}
    .main-p.player-hidden #p-title{display:none}
    #player-wrap{flex-shrink:0;transition:all .35s ease}

    /* Player toggle bar */
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

    /* DOWNLOAD CARDS */
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
    @keyframes blink{from{opacity:.6}to{opacity:1}}
    .dl-foot{display:flex;justify-content:space-between;align-items:center;margin-top:5px}
    .dl-status{font-size:10px}
    .dl-cancel{background:none;border:1px solid #522;color:#f44;border-radius:5px;padding:3px 10px;font-size:10px;cursor:pointer;transition:all .2s}
    .dl-cancel:hover{background:#e00;border-color:#e00;color:#fff}
    .dl-cancel:disabled{opacity:.4;cursor:not-allowed}
    .dl-empty{color:#333;font-size:13px;text-align:center;margin-top:30px}

    #close-ytdl{flex-shrink:0;margin-top:10px;background:#1a1a1a;color:#888;border:1px solid #333;padding:9px 36px;border-radius:20px;cursor:pointer;font-weight:700;align-self:center;transition:all .2s}
    #close-ytdl:hover{background:#333;color:#fff}

    /* RIGHT PANEL */
    .side-p{background:#0d0d0d;border-radius:14px;padding:18px;border:1px solid #222;display:flex;flex-direction:column;overflow:hidden;min-height:0}
    .lib-tabs{display:flex;gap:4px;margin-bottom:10px;flex-shrink:0}
    .lib-tab{flex:1;padding:7px 0;background:#1a1a1a;border:1px solid #222;border-radius:7px;color:#555;font-size:12px;font-weight:700;cursor:pointer;text-align:center;transition:all .2s}
    .lib-tab.active{background:#e00;border-color:#e00;color:#fff}
    .lib-hdr{display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-shrink:0}
    .lib-hdr h3{flex:1;margin:0;font-size:13px}
    .vbtn{background:#1a1a1a;border:1px solid #333;color:#888;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:15px;transition:all .2s}
    .vbtn.active{background:#e00;border-color:#e00;color:#fff}

    /* HISTORY CARDS */
    #h-list{flex:1;overflow-y:auto;min-height:0;padding-right:2px}
    #h-list.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;align-content:start}
    #h-list.list{display:flex;flex-direction:column;gap:6px}

    .v-card{display:flex;background:#111;border-radius:10px;border:1px solid #222;overflow:hidden;position:relative;transition:border-color .2s}
    .v-card:hover{border-color:#555}

    /* GRID — card is 16:9 box, thumbnail absolute, .cb overlay fades in on hover */
    #h-list.grid .v-card{flex-direction:column;aspect-ratio:16/9;cursor:pointer}
    #h-list.grid .thumb-wrap{position:absolute;inset:0;background:#0a0a0a;overflow:hidden;z-index:0}
    #h-list.grid .thumb-wrap img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s ease}
    #h-list.grid .v-card:hover .thumb-wrap img{transform:scale(1.05)}
    #h-list.grid .thumb-wrap .no-thumb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;color:#252525}
    #h-list.grid .thumb-quality{position:absolute;bottom:6px;right:6px;z-index:4;background:rgba(0,0,0,.88);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;pointer-events:none}
    #h-list.grid .del-b{position:absolute;top:6px;left:6px;z-index:5;background:rgba(0,0,0,.75);border:none;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:11px;padding:0;cursor:pointer;opacity:0;transition:opacity .18s;line-height:1}
    #h-list.grid .v-card:hover .del-b{opacity:1}
    #h-list.grid .del-b:hover{background:rgba(180,0,0,.9)!important}
    #h-list.grid .cb{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;justify-content:flex-end;padding:10px;background:linear-gradient(to top,rgba(0,0,0,.95) 0%,rgba(0,0,0,.6) 50%,transparent 100%);opacity:0;transition:opacity .2s ease;pointer-events:none;box-sizing:border-box}
    #h-list.grid .v-card:hover .cb{opacity:1;pointer-events:auto}
    #h-list.grid .card-title{font-size:11px;font-weight:700;color:#fff;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;margin:0 0 5px;text-shadow:0 1px 4px #000}
    #h-list.grid .card-tags{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 7px;align-items:center}
    #h-list.grid .card-acts{display:flex;gap:5px}

    /* ═══ LIST VIEW ═══ */
    #h-list.list .v-card{flex-direction:row;align-items:stretch;min-height:90px;height:90px;overflow:hidden}
    #h-list.list .thumb-wrap{position:relative;width:130px;min-width:130px;height:90px;flex-shrink:0;background:#0a0a0a;overflow:hidden}
    #h-list.list .thumb-wrap img{width:100%;height:100%;object-fit:cover;display:block}
    #h-list.list .thumb-wrap .no-thumb{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;color:#252525}
    #h-list.list .thumb-quality{position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,.88);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px}
    /* del-b di pojok kanan atas card (bukan thumb) */
    #h-list.list .del-b{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);border:none;color:#aaa;font-size:12px;padding:3px 5px;cursor:pointer;transition:all .15s;border-radius:4px;line-height:1;z-index:2}
    #h-list.list .del-b:hover{color:#f44;background:rgba(180,0,0,.75)}
    /* cb: padding kanan cukup untuk del-b, min-width:0 wajib untuk truncate */
    #h-list.list .cb{padding:10px 32px 10px 12px;flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:6px;position:static;opacity:1;pointer-events:auto;background:none;overflow:hidden}
    /* title: 2 baris dengan line-clamp, pastikan container tidak overflow */
    #h-list.list .card-title{font-size:11px;font-weight:700;color:#ddd;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;display:block;width:100%}
    #h-list.list .card-tags{display:flex;gap:4px;flex-wrap:nowrap;margin:0;align-items:center;overflow:hidden;max-width:100%}
    #h-list.list .card-acts{display:flex;gap:5px;margin:0;flex-shrink:0}

    /* thumb-quality and del-b as direct children of .v-card */
    .v-card > .thumb-quality{position:absolute;z-index:4;pointer-events:none}
    .v-card > .del-b{position:absolute;z-index:5}

    /* Shared */
    .thumb-wrap{position:relative}
    .tag{padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600;white-space:nowrap}
    .tag-s{background:#252525;color:#aaa}
    .tag-f{background:#0d1f30;color:#3ea6ff}
    .play-b{background:#3ea6ff;border:none;color:#fff;padding:5px 12px;border-radius:5px;cursor:pointer;font-size:10px;font-weight:700;transition:background .15s}
    .play-b:hover{background:#1a8fd1}
    .del-b{cursor:pointer;border:none;background:none;transition:color .15s}

    /* SCAN PANEL */
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
    #scan-list{flex:1;overflow-y:auto;min-height:0}
    #scan-list.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #scan-list.list{display:flex;flex-direction:column;gap:6px}
    .sc-card{background:#1a1a1a;border:1px solid #222;border-radius:8px;overflow:hidden;transition:border-color .2s}
    .sc-card:hover{border-color:#555}
    #scan-list.grid .sc-card{display:flex;flex-direction:column}
    #scan-list.grid .sc-thumb{width:100%;height:68px;background:#111;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0}
    #scan-list.grid .sc-body{padding:7px}
    #scan-list.list .sc-card{display:flex;align-items:center;gap:8px;padding:8px}
    #scan-list.list .sc-thumb{width:44px;height:44px;background:#111;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
    #scan-list.list .sc-body{flex:1;min-width:0}
    .sc-title{font-size:10px;font-weight:700;color:#ddd;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sc-meta{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:5px;align-items:center}
    .sc-acts{display:flex;gap:4px}
    .sc-play{background:#3ea6ff;border:none;color:#fff;padding:3px 9px;border-radius:4px;cursor:pointer;font-size:10px;font-weight:700}
    .sc-add{background:#1a1a1a;border:1px solid #333;color:#aaa;padding:3px 9px;border-radius:4px;cursor:pointer;font-size:10px;transition:all .2s}
    .sc-add:hover{background:#0a5;border-color:#0a5;color:#fff}
    .sc-add.in-lib{background:#031a0c;border-color:#0a5;color:#0d5}
    .sc-empty{color:#333;font-size:13px;text-align:center;margin-top:40px}

    /* INJECT BTN — merah, sejajar dengan tombol native YouTube */
    .ytdl-dl-btn{display:inline-flex;align-items:center;gap:6px;background:#cc0000;color:#fff;border:none;margin-right:9px;margin-left:9px;border-radius:50px;padding:0 16px;height:36px;cursor:pointer;font-family:"Roboto","Arial",sans-serif;font-size:14px;font-weight:500;line-height:1;white-space:nowrap;transition:background .15s;flex-shrink:0}
    .ytdl-dl-btn:hover{background:#aa0000}
    .ytdl-dl-btn svg{flex-shrink:0;margin-right:2px}
    /* Sembunyikan tombol Download bawaan YouTube (Premium) */
    ytd-download-button-renderer{display:none!important}
    ` }));

    /* ══════════════════════════════════════════════════════
       MODAL HTML
    ══════════════════════════════════════════════════════ */
    document.body.insertAdjacentHTML('beforeend', `
    <div id="ytdl-modal">
      <div id="ytdl-inner">
        <!-- LEFT -->
        <div class="main-p" id="main-p">
          <div class="scale-row">
            <span>🔍 Scale</span>
            <input type="range" id="scale-sl" min="0.6" max="1.4" step="0.05" value="${uiScale}">
            <span class="scale-val" id="scale-lbl">${Math.round(uiScale*100)}%</span>
          </div>

          <!-- Collapsible player toggle bar -->
          <div id="player-toggle-bar">
            <span class="ptb-icon" id="ptb-icon">▼</span>
            <span class="ptb-title" id="ptb-title">Player</span>
            <span class="ptb-badge" id="ptb-badge">Idle</span>
          </div>

          <!-- Player section (collapsible) -->
          <div id="player-wrap">
            <p id="p-title">Library & Player</p>
            <video id="v-player" controls></video>
          </div>

          <div id="dl-panel"><p class="dl-empty">Tidak ada unduhan aktif</p></div>
          <button id="close-ytdl">✕ TUTUP</button>
        </div>
        <!-- RIGHT -->
        <div class="side-p">
          <div class="lib-tabs">
            <button class="lib-tab active" id="tab-hist">📁 Riwayat</button>
            <button class="lib-tab" id="tab-scan">🔍 Scan Folder</button>
          </div>
          <!-- HISTORY -->
          <div id="hist-panel">
            <div class="lib-hdr">
              <h3>Unduhan Sesi Ini</h3>
              <button class="vbtn ${libraryView==='grid'?'active':''}" id="hbtn-grid">⊞</button>
              <button class="vbtn ${libraryView==='list'?'active':''}" id="hbtn-list">≡</button>
            </div>
            <div id="h-list" class="${libraryView}"></div>
          </div>
          <!-- SCAN -->
          <div id="scan-panel">
            <div class="folder-list" id="folder-list"></div>
            <div class="add-row">
              <input id="folder-input" placeholder="Path folder, mis: /home/user/Videos">
              <button class="sbtn" id="folder-add-btn">+ Tambah</button>
            </div>
            <div class="scan-bar">
              <button class="sbtn red" id="scan-btn">🔍 Scan Sekarang</button>
              <span class="scan-stats" id="scan-stats"></span>
              <button class="vbtn ${libraryView==='grid'?'active':''}" id="sbtn-grid">⊞</button>
              <button class="vbtn ${libraryView==='list'?'active':''}" id="sbtn-list">≡</button>
            </div>
            <div id="scan-list" class="${libraryView}"><p class="sc-empty">Klik "Scan Sekarang" untuk memindai.</p></div>
          </div>
        </div>
      </div>
    </div>

    <!-- QUALITY POPUP -->
    <div id="ytdl-popup">
      <h3>⬇ Pilih Kualitas</h3>
      <p class="sub" id="popup-title"></p>
      <div id="q-list" class="q-grid"></div>
      <button id="popup-cancel" style="margin-top:14px;background:none;border:none;color:#555;cursor:pointer;font-size:13px">Batal</button>
    </div>

    <!-- FAB -->
    <div id="ytdl-fab">📂</div>
    `);

    const modal  = document.getElementById('ytdl-modal');
    const popup  = document.getElementById('ytdl-popup');
    const fab    = document.getElementById('ytdl-fab');
    const player = document.getElementById('v-player');

    /* ══════════════════════════════════════════════════════
       PLAYER TOGGLE
    ══════════════════════════════════════════════════════ */
    let playerVisible = localStorage.getItem('ytdl_player') !== 'hidden';

    function applyPlayerVisibility() {
        const mainP = document.getElementById('main-p');
        const wrap  = document.getElementById('player-wrap');
        const icon  = document.getElementById('ptb-icon');
        mainP.classList.toggle('player-hidden', !playerVisible);
        icon.classList.toggle('collapsed', !playerVisible);
        wrap.style.overflow = 'hidden';
        if (!playerVisible) {
            wrap.style.maxHeight = '0';
            wrap.style.opacity   = '0';
            wrap.style.marginBottom = '0';
        } else {
            wrap.style.maxHeight = '70vh';
            wrap.style.opacity   = '1';
            wrap.style.marginBottom = '10px';
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
            titleEl.textContent = `▶ ${nowPlayingTitle}`;
            titleEl.className = 'ptb-title playing';
        } else {
            titleEl.textContent = playerVisible ? 'Sembunyikan Player' : 'Tampilkan Player';
            titleEl.className = 'ptb-title';
        }
        if (activeCount > 0) {
            badge.textContent = `${activeCount} aktif`;
            badge.className = 'ptb-badge active';
        } else {
            badge.textContent = player.src && !player.paused ? '▶ Playing' : 'Idle';
            badge.className = 'ptb-badge';
        }
    }
    updateToggleBar('', 0);

    /* ══════════════════════════════════════════════════════
       SCALE
    ══════════════════════════════════════════════════════ */
    function applyScale() {
        const inner = document.getElementById('ytdl-inner');
        inner.style.transform = `scale(${uiScale})`;
        inner.style.width  = `${100/uiScale}%`;
        inner.style.height = `${100/uiScale}%`;
    }
    applyScale();
    document.getElementById('scale-sl').oninput = function() {
        uiScale = parseFloat(this.value);
        localStorage.setItem('ytdl_scale', uiScale);
        document.getElementById('scale-lbl').textContent = Math.round(uiScale*100) + '%';
        applyScale();
    };

    /* ══════════════════════════════════════════════════════
       VIEW TOGGLE
    ══════════════════════════════════════════════════════ */
    function setView(v) {
        libraryView = v;
        localStorage.setItem('ytdl_view', v);
        document.getElementById('h-list').className = v;
        document.getElementById('scan-list').className = v;
        ['hbtn-grid','sbtn-grid'].forEach(id => document.getElementById(id).classList.toggle('active', v==='grid'));
        ['hbtn-list','sbtn-list'].forEach(id => document.getElementById(id).classList.toggle('active', v==='list'));
    }
    document.getElementById('hbtn-grid').onclick = () => setView('grid');
    document.getElementById('hbtn-list').onclick = () => setView('list');
    document.getElementById('sbtn-grid').onclick = () => setView('grid');
    document.getElementById('sbtn-list').onclick = () => setView('list');

    /* ══════════════════════════════════════════════════════
       TABS
    ══════════════════════════════════════════════════════ */
    function switchTab(t) {
        document.getElementById('tab-hist').classList.toggle('active', t==='hist');
        document.getElementById('tab-scan').classList.toggle('active', t==='scan');
        document.getElementById('hist-panel').classList.toggle('hidden', t!=='hist');
        document.getElementById('scan-panel').classList.toggle('show', t==='scan');
        if (t==='scan') loadScanConfig();
    }
    document.getElementById('tab-hist').onclick = () => switchTab('hist');
    document.getElementById('tab-scan').onclick = () => switchTab('scan');

    /* ══════════════════════════════════════════════════════
       FAB + MODAL
    ══════════════════════════════════════════════════════ */
    fab.onclick = () => { modal.classList.add('show'); loadHistory(); };
    document.getElementById('close-ytdl').onclick = () => { modal.classList.remove('show'); player.pause(); };
    document.getElementById('popup-cancel').onclick = () => popup.classList.remove('show');

    /* ══════════════════════════════════════════════════════
       SSE
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
        fab.innerHTML = n > 0 ? `⏳<span class="badge">${n}</span>` : '📂';
        fab.style.background = n > 0 ? '#fa0' : '#e00';
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
            panel.innerHTML = '<p class="dl-empty">Tidak ada unduhan aktif</p>';
            return;
        }

        entries.forEach(([url, info]) => {
            let card = panel.querySelector(`[data-url="${CSS.escape(url)}"]`);
            if (!card) {
                const emp = panel.querySelector('.dl-empty');
                if (emp) emp.remove();
                card = document.createElement('div');
                card.className = 'dl-card';
                card.setAttribute('data-url', url);
                panel.appendChild(card);
            }

            const vp    = info.videoPercent || 0;
            const ap    = info.audioPercent || 0;
            const phase = info.phase || 'video';
            const spd   = info.speed ? `⚡ ${info.speed}` : '';
            const eta   = info.eta   ? `⏱ ${info.eta}`   : '';
            const title = (info.title || url).substring(0, 50);
            const qual  = info.quality || '';
            const fsz   = info.filesize ? `💾 ${info.filesize}` : '';
            const thumb = info.thumbnail || '';

            const done      = phase === 'done';
            const merging   = phase === 'merging';
            const cancelled = phase === 'cancelled';
            const active    = !done && !merging && !cancelled;

            const statusColor = { video:'#f44', audio:'#3ea6ff', merging:'#fa0', done:'#0c6', cancelled:'#f44' }[phase] || '#888';
            const statusText  = { video:'Mengunduh video...', audio:'Mengunduh audio...', merging:'Menggabungkan...', done:'✅ Selesai', cancelled:'❌ Dibatalkan' }[phase] || phase;

            card.innerHTML = `
                <div class="dl-hdr">
                    ${thumb ? `<img src="${thumb}" onerror="this.style.display='none'">` : ''}
                    <div class="dl-hdr-text">${title}</div>
                    ${qual ? `<span class="dl-badge">${qual}</span>` : ''}
                </div>
                ${cancelled ? `<p style="text-align:center;color:#f44;font-size:11px;margin:4px 0">❌ Unduhan dibatalkan</p>` :
                  merging   ? `<div class="dl-row"><span>🔀 Menggabungkan...</span><span class="spd">${spd}</span></div>
                               <div class="pbar"><div class="pbar-fill pbar-m" style="width:100%"></div></div>` :
                  done      ? `<div class="dl-row"><span style="color:#0c6">✅ Selesai</span><span>${fsz}</span></div>
                               <div class="pbar"><div class="pbar-fill pbar-v" style="width:100%"></div></div>` :
                  `<div class="dl-row"><span>🎬 Video <b>${vp.toFixed(1)}%</b></span><span class="spd">${spd}</span></div>
                   <div class="pbar"><div class="pbar-fill pbar-v" style="width:${vp}%"></div></div>
                   <div class="dl-row"><span>🔊 Audio <b>${ap.toFixed(1)}%</b></span><span class="eta">${eta}</span></div>
                   <div class="pbar"><div class="pbar-fill pbar-a" style="width:${ap}%"></div></div>`}
                <div class="dl-foot">
                    <span class="dl-status" style="color:${statusColor}">${active ? statusText : ''}</span>
                    <span>${done || cancelled ? fsz : ''}</span>
                    ${active ? `<button class="dl-cancel" data-url="${url}">✕ Batalkan</button>` : ''}
                </div>
            `;

            const cancelBtn = card.querySelector('.dl-cancel');
            if (cancelBtn) {
                cancelBtn.onclick = function() {
                    if (!confirm(`Batalkan unduhan "${title}"?`)) return;
                    this.disabled = true;
                    this.textContent = 'Membatalkan...';
                    GM_xmlhttpRequest({
                        method: 'POST', url: `${API}/api/cancel`,
                        headers: {'Content-Type':'application/json'},
                        data: JSON.stringify({ url }),
                        onload: () => { lastHistoryLen = -1; }
                    });
                };
            }
        });

        panel.querySelectorAll('.dl-card').forEach(c => {
            if (!data[c.getAttribute('data-url')]) c.remove();
        });

        if (!panel.querySelector('.dl-card')) {
            panel.innerHTML = '<p class="dl-empty">Tidak ada unduhan aktif</p>';
        }
    }

    /* ══════════════════════════════════════════════════════
       STREAM KEY
    ══════════════════════════════════════════════════════ */
    function pathToStreamKey(fullPath) {
        const bytes = new TextEncoder().encode(fullPath);
        let binary = '';
        bytes.forEach(b => binary += String.fromCharCode(b));
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function playFile(fileName, folderPath, title) {
        document.getElementById('p-title').textContent = title || fileName;
        if (folderPath) {
            const fullPath = folderPath.replace(/\/$/, '') + '/' + fileName;
            player.src = `${API}/api/stream/${pathToStreamKey(fullPath)}`;
        } else {
            player.src = `${API}/files/${encodeURIComponent(fileName)}`;
        }
        player.play();
        if (!playerVisible) {
            playerVisible = true;
            localStorage.setItem('ytdl_player', 'visible');
            applyPlayerVisibility();
        }
        updateToggleBar(title || fileName, Object.keys(_w.__ytdlProg || {}).length);
    }

    /* ══════════════════════════════════════════════════════
       HISTORY
    ══════════════════════════════════════════════════════ */
    function loadHistory(force) {
        GM_xmlhttpRequest({
            method: 'GET', url: `${API}/api/history`,
            onload: (res) => {
                const hist = JSON.parse(res.responseText);
                if (!force && hist.length === lastHistoryLen) return;
                lastHistoryLen = hist.length;
                renderHistory(hist);
            }
        });
    }

    function renderHistory(hist) {
        const list = document.getElementById('h-list');
        list.className = libraryView;
        if (!hist.length) {
            list.innerHTML = '<p style="text-align:center;color:#333;margin-top:20px">Belum ada riwayat.</p>';
            return;
        }
        list.innerHTML = '';
        [...hist].reverse().forEach(item => {
            const folderName = item.folderPath ? item.folderPath.split(/[\\/]/).pop() : '';
            const card = document.createElement('div');
            card.className = 'v-card';
            card.innerHTML = `
                <div class="thumb-wrap">
                    ${item.thumbnail ? `<img src="${item.thumbnail}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
                    <div class="no-thumb" style="${item.thumbnail ? 'display:none' : ''}">🎬</div>
                </div>
                <span class="thumb-quality">${item.quality}</span>
                <button class="del-b" title="Hapus">🗑</button>
                <div class="cb">
                    <div class="card-title" title="${item.title}">${item.title}</div>
                    <div class="card-tags">
                        ${item.filesize ? `<span class="tag tag-s">💾 ${item.filesize}</span>` : ''}
                        ${folderName ? `<span class="tag tag-f" title="${item.folderPath}">📂 ${folderName}</span>` : ''}
                    </div>
                    <div class="card-acts">
                        <button class="play-b">▶ Play</button>
                    </div>
                </div>
            `;
            card.querySelector('.play-b').onclick = () => playFile(item.fileName, item.folderPath || null, item.title);
            card.querySelector('.del-b').onclick = () => {
                if (!confirm('Hapus file ini secara permanen?')) return;
                GM_xmlhttpRequest({
                    method: 'DELETE', url: `${API}/api/history`,
                    headers: {'Content-Type':'application/json'},
                    data: JSON.stringify({ fileName: item.fileName, folderPath: item.folderPath || null }),
                    onload: () => { lastHistoryLen = -1; loadHistory(true); }
                });
            };
            list.appendChild(card);
        });
    }

    /* ══════════════════════════════════════════════════════
       QUALITY POPUP
    ══════════════════════════════════════════════════════ */
    function openQualityPopup(videoUrl, titleHint) {
        document.getElementById('popup-title').textContent = titleHint || '';
        document.getElementById('q-list').innerHTML = '<span style="color:#555;font-size:13px">Menganalisis...</span>';
        popup.classList.add('show');

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API}/api/info?url=${encodeURIComponent(videoUrl)}`,
            onload: (res) => {
                let data;
                try { data = JSON.parse(res.responseText); } catch(_) {
                    document.getElementById('q-list').innerHTML = '<span style="color:#f55">Gagal parsing response</span>';
                    return;
                }
                if (data.error) {
                    document.getElementById('q-list').innerHTML = `<span style="color:#f55">${data.error}</span>`;
                    return;
                }
                document.getElementById('popup-title').textContent = (data.title || '').substring(0, 55);
                const cont = document.getElementById('q-list');
                cont.innerHTML = '';
                if (!data.formats || !data.formats.length) {
                    cont.innerHTML = '<span style="color:#f55">Tidak ada format tersedia</span>';
                    return;
                }
                data.formats.forEach(f => {
                    const btn = document.createElement('button');
                    btn.className = 'q-btn';
                    btn.innerHTML = `${f.quality}${f.filesize ? `<span class="q-sz">~${f.filesize}</span>` : ''}`;
                    btn.onclick = () => {
                        GM_xmlhttpRequest({
                            method: 'POST', url: `${API}/api/download`,
                            headers: {'Content-Type':'application/json'},
                            data: JSON.stringify({ url: videoUrl, format_id: f.format_id, title: data.title, quality: f.quality, thumbnail: data.thumbnail })
                        });
                        popup.classList.remove('show');
                    };
                    cont.appendChild(btn);
                });
            },
            onerror: () => {
                document.getElementById('q-list').innerHTML = '<span style="color:#f55">Tidak dapat terhubung ke server</span>';
            }
        });
    }

    /* ══════════════════════════════════════════════════════
       FIX: WATCH PAGE DOWNLOAD BUTTON
       — pakai yt-navigate-finish event + MutationObserver
         agar tombol muncul tanpa hard refresh
    ══════════════════════════════════════════════════════ */
    function injectWatchBtn() {
        // Hanya inject di halaman /watch
        if (!location.pathname.startsWith('/watch')) return;

        // Jika tombol sudah ada DAN masih terpasang di DOM yang benar, skip
        const existing = document.querySelector('.ytdl-dl-btn');
        if (existing && existing.isConnected) return;

        // Target container tombol aksi YouTube
        const target = document.querySelector('#top-level-buttons-computed') ||
                        document.querySelector('ytd-watch-metadata #actions');
        if (!target) return;

        const btn = document.createElement('button');
        btn.className = 'ytdl-dl-btn';
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 16l-5-5h3V4h4v7h3l-5 5zm-7 2h14v2H5v-2z"/></svg>Download`;
        btn.title = 'Download video ini';
        btn.onclick = () => openQualityPopup(location.href, document.title);

        // Sisipkan SEBELUM tombol titik 3 (ytd-menu-renderer = tombol ⋯)
        // Struktur YouTube: #top-level-buttons-computed > [like][dislike][share][...][save][ytd-menu-renderer(titik3)]
        const menuBtn = target.querySelector('ytd-menu-renderer') ||
                        target.querySelector('#button.yt-icon-button') ||
                        target.lastElementChild;
        if (menuBtn && menuBtn !== btn) {
            target.insertBefore(btn, menuBtn);
        } else {
            target.appendChild(btn);
        }
    }

    // ── FIX: Listen ke event navigasi SPA YouTube ──
    // YouTube menembakkan 'yt-navigate-finish' setiap kali SPA navigation selesai
    window.addEventListener('yt-navigate-finish', () => {
        // Tunggu sebentar agar YouTube selesai render DOM-nya
        setTimeout(injectWatchBtn, 300);
        setTimeout(injectWatchBtn, 800);  // fallback jika 300ms belum cukup
        setTimeout(injectWatchBtn, 1500); // fallback kedua untuk koneksi lambat
    });

    // ── FIX: MutationObserver sebagai fallback ──
    // Watch untuk munculnya #top-level-buttons-computed atau ytd-watch-metadata
    const watchBtnObserver = new MutationObserver(() => {
        if (!location.pathname.startsWith('/watch')) return;
        if (document.querySelector('.ytdl-dl-btn')?.isConnected) return;
        const target = document.querySelector('#top-level-buttons-computed') ||
                       document.querySelector('ytd-watch-metadata #actions');
        if (target) injectWatchBtn();
    });
    watchBtnObserver.observe(document.body, { childList: true, subtree: true });

    // ── Inject saat pertama load (kalau langsung buka /watch) ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(injectWatchBtn, 500));
    } else {
        setTimeout(injectWatchBtn, 500);
    }

    /* ══════════════════════════════════════════════════════
       HOMEPAGE 3-DOT MENU INJECTION
    ══════════════════════════════════════════════════════ */
    new MutationObserver(() => {
        document.querySelectorAll('ytd-menu-popup-renderer:not([ytdl-ok])').forEach(menu => {
            menu.setAttribute('ytdl-ok', '1');
            const list = menu.querySelector('tp-yt-paper-listbox, ytd-menu-service-item-renderer');
            if (!list) return;

            const item = document.createElement('ytd-menu-service-item-renderer');
            item.style.cursor = 'pointer';
            item.innerHTML = `<tp-yt-paper-item role="option" style="display:flex;align-items:center;gap:12px;padding:0 16px;min-height:36px;cursor:pointer;font-family:Roboto,sans-serif">
                <span style="font-size:18px">⬇</span>
                <span style="font-size:14px">Download</span>
            </tp-yt-paper-item>`;

            item.onclick = (e) => {
                e.stopPropagation();
                let videoUrl = null;
                let titleHint = '';
                const renderers = ['ytd-rich-item-renderer','ytd-video-renderer','ytd-compact-video-renderer','ytd-grid-video-renderer'];
                let el = menu;
                for (let i = 0; i < 15 && el; i++, el = el.parentElement) {
                    if (renderers.includes(el.tagName?.toLowerCase())) {
                        const a = el.querySelector('a[href*="/watch"]');
                        if (a) { videoUrl = 'https://www.youtube.com' + a.getAttribute('href'); }
                        const t = el.querySelector('#video-title, yt-formatted-string#video-title');
                        if (t) titleHint = t.textContent?.trim() || '';
                        break;
                    }
                }
                document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
                if (videoUrl) setTimeout(() => openQualityPopup(videoUrl, titleHint), 150);
            };

            list.parentElement ? list.parentElement.insertBefore(item, list) : menu.insertBefore(item, menu.firstChild);
        });
    }).observe(document.body, { childList:true, subtree:true });

    /* ══════════════════════════════════════════════════════
       SCAN FOLDER
    ══════════════════════════════════════════════════════ */
    let scanFolders = [];
    let mainFolder  = '';

    function loadScanConfig() {
        GM_xmlhttpRequest({
            method: 'GET', url: `${API}/api/config`,
            onload: (res) => {
                const cfg = JSON.parse(res.responseText);
                mainFolder  = cfg.downloadFolder;
                scanFolders = cfg.scanFolders || [];
                renderFolderList();
            }
        });
    }

    function saveScanFolders() {
        GM_xmlhttpRequest({
            method: 'POST', url: `${API}/api/config`,
            headers: {'Content-Type':'application/json'},
            data: JSON.stringify({ scanFolders })
        });
    }

    function renderFolderList() {
        const el = document.getElementById('folder-list');
        el.innerHTML = '';
        el.insertAdjacentHTML('beforeend', `
            <div class="folder-item">
                <span>📥</span>
                <span class="fp" title="${mainFolder}">${mainFolder}</span>
                <span class="fbadge">Utama</span>
            </div>`);
        scanFolders.forEach((f, i) => {
            const div = document.createElement('div');
            div.className = 'folder-item';
            div.innerHTML = `<span>📂</span><span class="fp" title="${f}">${f}</span><button class="frem">✕</button>`;
            div.querySelector('.frem').onclick = () => { scanFolders.splice(i, 1); saveScanFolders(); renderFolderList(); };
            el.appendChild(div);
        });
    }

    document.getElementById('folder-add-btn').onclick = () => {
        const inp = document.getElementById('folder-input');
        const v = inp.value.trim();
        if (!v || v === mainFolder || scanFolders.includes(v)) { inp.value = ''; return; }
        scanFolders.push(v);
        saveScanFolders();
        renderFolderList();
        inp.value = '';
    };
    document.getElementById('folder-input').onkeydown = e => { if (e.key === 'Enter') document.getElementById('folder-add-btn').click(); };

    document.getElementById('scan-btn').onclick = runScan;

    function runScan() {
        const btn   = document.getElementById('scan-btn');
        const stats = document.getElementById('scan-stats');
        const list  = document.getElementById('scan-list');
        btn.disabled = true;
        btn.textContent = '⏳ Memindai...';
        stats.textContent = '';
        list.innerHTML = '<p class="sc-empty">Memindai...</p>';

        GM_xmlhttpRequest({
            method: 'GET', url: `${API}/api/scan`,
            onload: (res) => {
                btn.disabled = false;
                btn.textContent = '🔍 Scan Sekarang';
                let files;
                try { files = JSON.parse(res.responseText); } catch(_) {
                    list.innerHTML = '<p class="sc-empty" style="color:#f55">Response tidak valid</p>'; return;
                }
                stats.textContent = `${files.length} video ditemukan`;
                renderScanList(files);
            },
            onerror: () => {
                btn.disabled = false;
                btn.textContent = '🔍 Scan Sekarang';
                list.innerHTML = '<p class="sc-empty" style="color:#f55">Gagal terhubung ke server</p>';
            }
        });
    }

    function renderScanList(files) {
        const list = document.getElementById('scan-list');
        list.className = libraryView;
        if (!files.length) {
            list.innerHTML = '<p class="sc-empty">Tidak ada video ditemukan.</p>';
            return;
        }
        list.innerHTML = '';
        files.forEach(f => {
            const card = document.createElement('div');
            card.className = 'sc-card';
            const folder = f.folderPath.split(/[\\/]/).pop() || f.folderPath;
            const ext    = f.fileName.split('.').pop().toUpperCase();
            let inLib    = f.inHistory;

            card.innerHTML = `
                <div class="sc-thumb">🎬</div>
                <div class="sc-body">
                    <div class="sc-title" title="${f.fileName}">${f.title}</div>
                    <div class="sc-meta">
                        <span class="tag tag-q" style="background:#333;color:#aaa">${ext}</span>
                        ${f.filesize ? `<span class="tag tag-s">💾 ${f.filesize}</span>` : ''}
                        <span class="tag tag-f" title="${f.folderPath}">📂 ${folder}</span>
                    </div>
                    <div class="sc-acts">
                        <button class="sc-play">▶ Play</button>
                        <button class="sc-add ${inLib ? 'in-lib' : ''}">${inLib ? '✓ Di Library' : '+ Library'}</button>
                    </div>
                </div>
            `;

            card.querySelector('.sc-play').onclick = () => {
                document.getElementById('p-title').textContent = f.title;
                player.src = `${API}/api/stream/${f.streamKey}`;
                player.play();
            };

            const addBtn = card.querySelector('.sc-add');
            if (!inLib) {
                addBtn.onclick = () => {
                    GM_xmlhttpRequest({
                        method: 'POST', url: `${API}/api/history/add`,
                        headers: {'Content-Type':'application/json'},
                        data: JSON.stringify({ title: f.title, quality: ext, thumbnail: '', fileName: f.fileName, filesize: f.filesize, folderPath: f.folderPath }),
                        onload: () => {
                            addBtn.className = 'sc-add in-lib';
                            addBtn.textContent = '✓ Di Library';
                            inLib = true;
                            lastHistoryLen = -1;
                        }
                    });
                };
            }

            list.appendChild(card);
        });
    }

    /* ══════════════════════════════════════════════════════
       AUTO REFRESH
    ══════════════════════════════════════════════════════ */
    let prevKeys = '';
    setInterval(() => {
        const keys = Object.keys(_w.__ytdlProg || {}).join(',');
        if (keys !== prevKeys && keys.length < prevKeys.length) {
            loadHistory(true);
        }
        prevKeys = keys;
        if (modal.classList.contains('show')) loadHistory();
        if (_w.__ytdlProg && Object.keys(_w.__ytdlProg).length > 0) renderDlPanel(_w.__ytdlProg);
    }, 2000);

})();