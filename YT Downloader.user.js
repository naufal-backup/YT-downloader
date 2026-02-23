// ==UserScript==
// @name         YouTube Downloader
// @namespace    http://tampermonkey.net/
// @version      8.2
// @description  yt-dlp + Persistent + Homepage Menu + Grid/List + Speed + Size + Cancel + Scan Folder
// @match        *://*.youtube.com/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
    'use strict';
    const API_URL = 'http://localhost:8989';
    let lastHistoryCount = -1;
    let libraryView = localStorage.getItem('ytdl_view') || 'grid';
    let uiScale = parseFloat(localStorage.getItem('ytdl_scale') || '1');

    /* ─────────────────────────── STYLES ─────────────────────────── */
    const css = `
    #ytdl-fab {
        position: fixed; bottom: 20px; right: 20px; width: 55px; height: 55px;
        background: #ff0000; color: white; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        z-index: 999999; font-size: 22px; transition: all 0.3s;
        border: 2px solid rgba(255,255,255,0.2);
    }
    #ytdl-fab .fab-badge {
        position: absolute; top: -4px; right: -4px;
        background: #ffaa00; color: #000; border-radius: 50%;
        width: 18px; height: 18px; font-size: 10px; font-weight: bold;
        display: flex; align-items: center; justify-content: center;
    }
    .ytdl-mini-popup {
        display: none; position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background: #181818; color: white; padding: 22px;
        border-radius: 14px; z-index: 10000000; width: 330px;
        box-shadow: 0 0 40px rgba(0,0,0,0.9); border: 1px solid #3a3a3a;
        text-align: center;
    }
    .ytdl-mini-popup.active { display: block; }
    .ytdl-mini-popup h3 { margin: 0 0 6px; font-size: 15px; }
    .ytdl-mini-popup .popup-subtitle { font-size: 11px; color: #888; margin-bottom: 14px; }
    .q-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .q-mini-btn {
        background: #2a2a2a; color: white; border: 1px solid #444;
        padding: 12px 8px; border-radius: 8px; cursor: pointer;
        font-weight: bold; font-size: 13px; transition: all 0.2s;
        display: flex; flex-direction: column; align-items: center; gap: 3px;
    }
    .q-mini-btn:hover { background: #ff0000; border-color: #ff0000; }
    .q-mini-btn .q-size { font-size: 10px; color: #aaa; font-weight: normal; }
    .q-mini-btn:hover .q-size { color: #ffc; }

    /* ─── MODAL ─── */
    .ytdl-modal {
        display: none; position: fixed; top: 0; left: 0;
        width: 100%; height: 100%; background: rgba(0,0,0,0.96);
        z-index: 9999999; color: white; box-sizing: border-box;
    }
    .ytdl-modal.active { display: flex; }
    .ytdl-modal-inner {
        display: grid; grid-template-columns: 1fr 420px;
        gap: 20px; width: 100%; height: 100%; padding: 20px; box-sizing: border-box;
        transform-origin: top left;
    }

    /* ─── LEFT PANEL ─── */
    .main-p {
        display: flex; flex-direction: column;
        background: #000; border-radius: 14px; padding: 20px;
        border: 1px solid #2a2a2a; overflow: hidden;
    }
    .main-p video {
        width: 100%; border-radius: 10px; background: #111;
        max-height: 52vh; flex-shrink: 0;
    }
    #p-title { font-size: 14px; margin: 0 0 12px; text-align: center; color: #ccc; min-height: 20px; }

    /* Scale slider */
    .scale-row {
        display: flex; align-items: center; gap: 10px;
        margin-bottom: 14px; background: #111; border-radius: 8px;
        padding: 8px 12px; border: 1px solid #2a2a2a;
    }
    .scale-row span { font-size: 11px; color: #666; white-space: nowrap; }
    .scale-row input[type=range] { flex: 1; accent-color: #ff0000; cursor: pointer; }
    .scale-row .scale-val { font-size: 11px; color: #aaa; min-width: 36px; text-align: right; }

    /* Active downloads */
    #dl-panel { flex: 1; overflow-y: auto; margin-top: 14px; }
    .dl-card {
        background: #111; border: 1px solid #2a2a2a; border-radius: 10px;
        padding: 12px; margin-bottom: 10px;
    }
    .dl-card-header {
        display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
    }
    .dl-card-header img { width: 56px; height: 32px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
    .dl-card-title { font-size: 11px; font-weight: bold; color: #ddd; line-height: 1.3; }
    .dl-quality-badge {
        background: #ff0000; color: white; font-size: 9px;
        padding: 1px 5px; border-radius: 3px; font-weight: bold; flex-shrink: 0;
    }
    .dl-phase-label { font-size: 10px; color: #888; margin-bottom: 2px; display: flex; justify-content: space-between; }
    .dl-phase-label .dl-speed { color: #ffaa00; }
    .dl-phase-label .dl-eta { color: #888; }
    .pbar-bg { width: 100%; height: 6px; background: #2a2a2a; border-radius: 3px; overflow: hidden; margin-bottom: 5px; }
    .pbar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; width: 0%; }
    .pbar-video { background: linear-gradient(90deg, #ff4444, #ff0000); }
    .pbar-audio { background: linear-gradient(90deg, #4499ff, #3ea6ff); }
    .pbar-merge { background: linear-gradient(90deg, #ffcc00, #ffaa00); animation: pulse 0.8s infinite alternate; }
    @keyframes pulse { from { opacity: 0.7; } to { opacity: 1; } }
    .dl-summary { display: flex; justify-content: space-between; font-size: 10px; color: #555; margin-top: 4px; }
    .dl-empty { color: #333; font-size: 13px; text-align: center; margin-top: 30px; }
    .dl-cancel-btn {
        background: none; border: 1px solid #552222; color: #ff4444;
        border-radius: 5px; padding: 3px 10px; font-size: 10px; cursor: pointer;
        transition: all 0.2s; margin-top: 6px; align-self: flex-end;
    }
    .dl-cancel-btn:hover { background: #ff0000; border-color: #ff0000; color: white; }
    .dl-cancelled-label { font-size: 11px; color: #ff4444; text-align: center; padding: 6px 0; }

    /* ─── RIGHT PANEL ─── */
    .side-p {
        background: #0d0d0d; border-radius: 14px; padding: 18px;
        border: 1px solid #2a2a2a; overflow-y: auto; display: flex; flex-direction: column;
    }
    .lib-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-shrink: 0; }
    .lib-header h3 { flex: 1; margin: 0; font-size: 14px; }
    .view-btn {
        background: #1e1e1e; border: 1px solid #333; color: #aaa;
        padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 15px;
        transition: all 0.2s;
    }
    .view-btn.active { background: #ff0000; border-color: #ff0000; color: white; }
    #h-list { flex: 1; }

    /* Grid view */
    #h-list.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    #h-list.grid .v-card { flex-direction: column; gap: 0; }
    #h-list.grid .v-card img { width: 100%; height: 72px; border-radius: 6px 6px 0 0; }
    #h-list.grid .v-card .card-body { padding: 8px; }

    /* List view */
    #h-list.list { display: flex; flex-direction: column; gap: 8px; }
    #h-list.list .v-card { flex-direction: row; align-items: center; }
    #h-list.list .v-card img { width: 90px; height: 50px; border-radius: 6px; flex-shrink: 0; }
    #h-list.list .v-card .card-body { padding: 0 8px; flex: 1; }

    .v-card {
        display: flex; background: #1a1a1a; border-radius: 8px;
        border: 1px solid #2a2a2a; overflow: hidden;
        transition: border-color 0.2s; position: relative;
    }
    .v-card:hover { border-color: #555; }
    .v-card .card-body { flex: 1; min-width: 0; }
    .v-card .card-title {
        font-size: 10px; font-weight: bold; line-height: 1.3;
        color: #ddd; margin-bottom: 4px;
        overflow: hidden; text-overflow: ellipsis;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    .v-card .card-tags { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 6px; }
    .v-card .tag-quality { background: #ff0000; color: white; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: bold; }
    .v-card .tag-size { background: #2a2a2a; color: #888; padding: 1px 5px; border-radius: 3px; font-size: 9px; }
    .v-card .card-actions { display: flex; gap: 5px; }
    .v-card .play-b {
        background: #3ea6ff; border: none; color: white;
        padding: 4px 10px; border-radius: 5px; cursor: pointer;
        font-size: 10px; font-weight: bold;
    }
    .v-card .del-b {
        background: none; border: none; color: #ff4444;
        cursor: pointer; font-size: 14px; padding: 2px 6px;
        position: absolute; top: 6px; right: 6px;
    }

    /* Close btn */
    #close-ytdl {
        flex-shrink: 0; margin-top: 12px; background: #1e1e1e;
        color: #aaa; border: 1px solid #333; padding: 9px 36px;
        border-radius: 20px; cursor: pointer; font-weight: bold;
        align-self: center; transition: all 0.2s;
    }
    #close-ytdl:hover { background: #333; color: white; }

    /* ─── TABS (History / Scan) ─── */
    .lib-tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-shrink: 0; }
    .lib-tab {
        flex: 1; padding: 7px 0; background: #1a1a1a; border: 1px solid #2a2a2a;
        border-radius: 7px; color: #666; font-size: 12px; font-weight: bold;
        cursor: pointer; text-align: center; transition: all 0.2s;
    }
    .lib-tab.active { background: #ff0000; border-color: #ff0000; color: white; }

    /* ─── SCAN PANEL ─── */
    #scan-panel { display: none; flex-direction: column; flex: 1; overflow: hidden; }
    #scan-panel.active { display: flex; }
    #history-panel { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    #history-panel.hidden { display: none; }

    .scan-toolbar {
        display: flex; gap: 6px; align-items: center; margin-bottom: 10px; flex-shrink: 0; flex-wrap: wrap;
    }
    .scan-folder-list { margin-bottom: 10px; flex-shrink: 0; }
    .scan-folder-item {
        display: flex; align-items: center; gap: 6px;
        background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
        padding: 6px 10px; margin-bottom: 5px; font-size: 11px; color: #aaa;
    }
    .scan-folder-item .folder-path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .scan-folder-item .folder-remove {
        background: none; border: none; color: #ff4444; cursor: pointer; font-size: 13px; flex-shrink: 0;
    }
    .scan-folder-item .folder-badge {
        background: #222; color: #666; font-size: 9px; padding: 2px 5px; border-radius: 3px; flex-shrink: 0;
    }
    .scan-add-row { display: flex; gap: 6px; margin-bottom: 10px; flex-shrink: 0; }
    .scan-add-row input {
        flex: 1; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px;
        padding: 7px 10px; color: white; font-size: 11px; outline: none;
    }
    .scan-add-row input:focus { border-color: #ff0000; }
    .scan-btn {
        background: #1e1e1e; border: 1px solid #333; color: #ccc; border-radius: 6px;
        padding: 7px 12px; cursor: pointer; font-size: 11px; font-weight: bold; white-space: nowrap;
        transition: all 0.2s; flex-shrink: 0;
    }
    .scan-btn:hover { background: #333; color: white; }
    .scan-btn.primary { background: #ff0000; border-color: #ff0000; color: white; }
    .scan-btn.primary:hover { background: #cc0000; }
    .scan-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    #scan-results { flex: 1; overflow-y: auto; }
    #scan-results.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    #scan-results.list { display: flex; flex-direction: column; gap: 6px; }

    .scan-card {
        background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px;
        overflow: hidden; position: relative; transition: border-color 0.2s;
    }
    .scan-card:hover { border-color: #555; }
    #scan-results.grid .scan-card { display: flex; flex-direction: column; }
    #scan-results.grid .scan-card .sc-thumb {
        width: 100%; height: 70px; background: #111; display: flex; align-items: center;
        justify-content: center; font-size: 28px; flex-shrink: 0;
    }
    #scan-results.grid .scan-card .sc-body { padding: 8px; }
    #scan-results.list .scan-card { display: flex; align-items: center; gap: 8px; padding: 8px; }
    #scan-results.list .scan-card .sc-thumb {
        width: 44px; height: 44px; background: #111; border-radius: 6px;
        display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;
    }
    #scan-results.list .scan-card .sc-body { flex: 1; min-width: 0; }

    .sc-title {
        font-size: 10px; font-weight: bold; color: #ddd; line-height: 1.3; margin-bottom: 4px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sc-meta { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-bottom: 5px; }
    .sc-tag { background: #2a2a2a; color: #888; padding: 1px 5px; border-radius: 3px; font-size: 9px; }
    .sc-tag.folder { color: #3ea6ff; }
    .sc-actions { display: flex; gap: 4px; }
    .sc-play-btn {
        background: #3ea6ff; border: none; color: white; padding: 3px 9px;
        border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;
    }
    .sc-add-btn {
        background: #2a2a2a; border: 1px solid #444; color: #aaa; padding: 3px 9px;
        border-radius: 4px; cursor: pointer; font-size: 10px; transition: all 0.2s;
    }
    .sc-add-btn:hover { background: #00aa55; border-color: #00aa55; color: white; }
    .sc-in-library { background: #003322; border: 1px solid #00aa55; color: #00cc66; }
    .sc-empty { color: #333; font-size: 13px; text-align: center; margin-top: 40px; }
    .scan-stats { font-size: 10px; color: #555; margin-bottom: 8px; flex-shrink: 0; }

    /* Context menu */
    .ytdl-ctx {
        position: fixed; background: #1e1e1e; border: 1px solid #3a3a3a;
        border-radius: 10px; padding: 6px 0; z-index: 99999999;
        min-width: 180px; box-shadow: 0 6px 24px rgba(0,0,0,0.8);
    }
    .ytdl-ctx-item {
        padding: 10px 16px; cursor: pointer; font-size: 13px;
        color: white; display: flex; align-items: center; gap: 10px;
        transition: background 0.15s;
    }
    .ytdl-ctx-item:hover { background: #333; }

    /* Download inject button (watch page) */
    .ytdl-trigger-btn {
        background: #ff0000; color: white; border-radius: 18px;
        padding: 8px 16px; cursor: pointer; font-weight: bold;
        border: none; margin-left: 8px; font-size: 12px;
        transition: background 0.2s;
    }
    .ytdl-trigger-btn:hover { background: #cc0000; }
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    /* ─────────────────────────── MODAL HTML ─────────────────────────── */
    const modal = document.createElement('div');
    modal.className = 'ytdl-modal';
    modal.innerHTML = `
    <div class="ytdl-modal-inner" id="ytdl-inner">
        <!-- LEFT: Player + Active Downloads -->
        <div class="main-p">
            <div class="scale-row">
                <span>🔍 Scale</span>
                <input type="range" id="scale-slider" min="0.6" max="1.4" step="0.05" value="${uiScale}">
                <span class="scale-val" id="scale-val">${Math.round(uiScale * 100)}%</span>
            </div>
            <p id="p-title">Library & Player</p>
            <video id="v-player" controls></video>
            <div id="dl-panel">
                <p class="dl-empty" id="dl-empty">Tidak ada unduhan aktif</p>
            </div>
            <button id="close-ytdl">✕ TUTUP</button>
        </div>

        <!-- RIGHT: Library (History + Scan) -->
        <div class="side-p">
            <!-- Tab switcher -->
            <div class="lib-tabs">
                <button class="lib-tab active" id="tab-history">📁 Riwayat</button>
                <button class="lib-tab" id="tab-scan">🔍 Scan Folder</button>
            </div>

            <!-- HISTORY PANEL -->
            <div id="history-panel">
                <div class="lib-header">
                    <h3 style="flex:1;margin:0;font-size:13px;">Unduhan Sesi Ini</h3>
                    <button class="view-btn ${libraryView === 'grid' ? 'active' : ''}" id="btn-grid" title="Grid">⊞</button>
                    <button class="view-btn ${libraryView === 'list' ? 'active' : ''}" id="btn-list" title="List">≡</button>
                </div>
                <div id="h-list" class="${libraryView}"></div>
            </div>

            <!-- SCAN PANEL -->
            <div id="scan-panel">
                <!-- Folder list -->
                <div id="scan-folder-list" class="scan-folder-list"></div>

                <!-- Add folder input -->
                <div class="scan-add-row">
                    <input type="text" id="scan-folder-input" placeholder="Path folder, mis: /home/user/Videos">
                    <button class="scan-btn" id="scan-add-folder-btn">+ Tambah</button>
                </div>

                <!-- Scan actions -->
                <div class="scan-toolbar">
                    <button class="scan-btn primary" id="scan-run-btn">🔍 Scan Sekarang</button>
                    <span class="scan-stats" id="scan-stats"></span>
                    <div style="flex:1"></div>
                    <button class="view-btn ${libraryView === 'grid' ? 'active' : ''}" id="scan-btn-grid" title="Grid">⊞</button>
                    <button class="view-btn ${libraryView === 'list' ? 'active' : ''}" id="scan-btn-list" title="List">≡</button>
                </div>

                <!-- Results -->
                <div id="scan-results" class="${libraryView}">
                    <p class="sc-empty">Klik "Scan Sekarang" untuk memindai video di folder yang terdaftar.</p>
                </div>
            </div>
        </div>
    </div>`;
    document.body.appendChild(modal);

    /* ─────────────────────────── MINI POPUP ─────────────────────────── */
    const miniPopup = document.createElement('div');
    miniPopup.className = 'ytdl-mini-popup';
    miniPopup.innerHTML = `
        <h3>⬇ Pilih Kualitas</h3>
        <p class="popup-subtitle" id="q-popup-title"></p>
        <div id="q-mini-list" class="q-grid">Menganalisis...</div>
        <button id="close-mini" style="margin-top:16px;background:none;border:none;color:#555;cursor:pointer;font-size:13px;">Batal</button>
    `;
    document.body.appendChild(miniPopup);

    /* ─────────────────────────── FAB ─────────────────────────── */
    const fab = document.createElement('div');
    fab.id = 'ytdl-fab';
    fab.innerHTML = '📂';
    fab.onclick = () => { modal.classList.add('active'); loadHistory(); };
    document.body.appendChild(fab);

    /* ─────────────────────────── SCALE SLIDER ─────────────────────────── */
    document.getElementById('scale-slider').oninput = function () {
        uiScale = parseFloat(this.value);
        localStorage.setItem('ytdl_scale', uiScale);
        document.getElementById('scale-val').textContent = Math.round(uiScale * 100) + '%';
        applyScale();
    };
    function applyScale() {
        const inner = document.getElementById('ytdl-inner');
        if (inner) {
            inner.style.transform = `scale(${uiScale})`;
            inner.style.transformOrigin = 'top left';
            inner.style.width = `${100 / uiScale}%`;
            inner.style.height = `${100 / uiScale}%`;
        }
    }
    applyScale();

    /* ─────────────────────────── VIEW TOGGLE ─────────────────────────── */
    document.getElementById('btn-grid').onclick = () => setView('grid');
    document.getElementById('btn-list').onclick = () => setView('list');
    document.getElementById('scan-btn-grid').onclick = () => setView('grid');
    document.getElementById('scan-btn-list').onclick = () => setView('list');
    function setView(v) {
        libraryView = v;
        localStorage.setItem('ytdl_view', v);
        document.getElementById('h-list').className = v;
        document.getElementById('scan-results').className = v;
        ['btn-grid','scan-btn-grid'].forEach(id => document.getElementById(id).classList.toggle('active', v === 'grid'));
        ['btn-list','scan-btn-list'].forEach(id => document.getElementById(id).classList.toggle('active', v === 'list'));
    }

    /* ─────────────────────────── TABS ─────────────────────────── */
    document.getElementById('tab-history').onclick = () => switchTab('history');
    document.getElementById('tab-scan').onclick = () => { switchTab('scan'); loadScanConfig(); };
    function switchTab(tab) {
        document.getElementById('tab-history').classList.toggle('active', tab === 'history');
        document.getElementById('tab-scan').classList.toggle('active', tab === 'scan');
        document.getElementById('history-panel').classList.toggle('hidden', tab !== 'history');
        document.getElementById('scan-panel').classList.toggle('active', tab === 'scan');
    }

    /* ─────────────────────────── SCAN FOLDER MANAGEMENT ─────────────────────────── */
    let scanFolders = [];
    let mainDownloadFolder = '';

    function loadScanConfig() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API_URL}/api/config`,
            onload: (res) => {
                const cfg = JSON.parse(res.responseText);
                mainDownloadFolder = cfg.downloadFolder;
                scanFolders = cfg.scanFolders || [];
                renderFolderList();
            }
        });
    }

    function renderFolderList() {
        const list = document.getElementById('scan-folder-list');
        list.innerHTML = '';

        // Main download folder (always first, not removable)
        const mainItem = document.createElement('div');
        mainItem.className = 'scan-folder-item';
        mainItem.innerHTML = `
            <span style="font-size:14px">📥</span>
            <span class="folder-path" title="${mainDownloadFolder}">${mainDownloadFolder}</span>
            <span class="folder-badge">Utama</span>
        `;
        list.appendChild(mainItem);

        // Extra scan folders
        scanFolders.forEach((folder, idx) => {
            const item = document.createElement('div');
            item.className = 'scan-folder-item';
            item.innerHTML = `
                <span style="font-size:14px">📂</span>
                <span class="folder-path" title="${folder}">${folder}</span>
                <button class="folder-remove" data-idx="${idx}" title="Hapus folder ini">✕</button>
            `;
            item.querySelector('.folder-remove').onclick = function () {
                scanFolders.splice(parseInt(this.dataset.idx), 1);
                saveScanFolders();
                renderFolderList();
            };
            list.appendChild(item);
        });
    }

    function saveScanFolders() {
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${API_URL}/api/config`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ scanFolders })
        });
    }

    document.getElementById('scan-add-folder-btn').onclick = () => {
        const input = document.getElementById('scan-folder-input');
        const val = input.value.trim();
        if (!val) return;
        if (!scanFolders.includes(val) && val !== mainDownloadFolder) {
            scanFolders.push(val);
            saveScanFolders();
            renderFolderList();
        }
        input.value = '';
    };
    document.getElementById('scan-folder-input').onkeydown = (e) => {
        if (e.key === 'Enter') document.getElementById('scan-add-folder-btn').click();
    };

    /* ─────────────────────────── SCAN EXECUTION ─────────────────────────── */
    document.getElementById('scan-run-btn').onclick = runScan;

    function runScan() {
        const btn = document.getElementById('scan-run-btn');
        const stats = document.getElementById('scan-stats');
        const results = document.getElementById('scan-results');
        btn.disabled = true;
        btn.textContent = '⏳ Memindai...';
        stats.textContent = '';
        results.innerHTML = '<p class="sc-empty">Memindai...</p>';

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API_URL}/api/scan`,
            onload: (res) => {
                btn.disabled = false;
                btn.textContent = '🔍 Scan Sekarang';
                const files = JSON.parse(res.responseText);
                stats.textContent = `${files.length} video ditemukan`;
                renderScanResults(files);
            },
            onerror: () => {
                btn.disabled = false;
                btn.textContent = '🔍 Scan Sekarang';
                results.innerHTML = '<p class="sc-empty" style="color:#f55">Gagal terhubung ke server.</p>';
            }
        });
    }

    function renderScanResults(files) {
        const results = document.getElementById('scan-results');
        results.className = libraryView;
        if (!files.length) {
            results.innerHTML = '<p class="sc-empty">Tidak ada file video ditemukan di folder yang dipilih.</p>';
            return;
        }
        results.innerHTML = '';
        files.forEach(file => {
            const card = document.createElement('div');
            card.className = 'scan-card';
            const folderName = file.folderPath.split(/[\\/]/).pop() || file.folderPath;
            const ext = file.fileName.split('.').pop().toUpperCase();
            const inLib = file.inHistory;
            const streamUrl = `${API_URL}/api/stream/${file.streamKey}`;

            card.innerHTML = `
                <div class="sc-thumb">🎬</div>
                <div class="sc-body">
                    <div class="sc-title" title="${file.fileName}">${file.title}</div>
                    <div class="sc-meta">
                        <span class="sc-tag">${ext}</span>
                        ${file.filesize ? `<span class="sc-tag">💾 ${file.filesize}</span>` : ''}
                        <span class="sc-tag folder" title="${file.folderPath}">📂 ${folderName}</span>
                    </div>
                    <div class="sc-actions">
                        <button class="sc-play-btn">▶ Play</button>
                        <button class="sc-add-btn ${inLib ? 'sc-in-library' : ''}" data-file='${JSON.stringify(file)}'>
                            ${inLib ? '✓ Di Library' : '+ Library'}
                        </button>
                    </div>
                </div>
            `;

            card.querySelector('.sc-play-btn').onclick = () => {
                const player = document.getElementById('v-player');
                document.getElementById('p-title').textContent = file.title;
                player.src = streamUrl;
                player.play();
                // Switch to left panel focus
                modal.querySelector('.main-p').scrollIntoView({ behavior: 'smooth' });
            };

            const addBtn = card.querySelector('.sc-add-btn');
            if (!inLib) {
                addBtn.onclick = () => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: `${API_URL}/api/history/add`,
                        headers: { 'Content-Type': 'application/json' },
                        data: JSON.stringify({
                            title: file.title,
                            quality: ext,
                            thumbnail: '',
                            fileName: file.fileName,
                            filesize: file.filesize,
                            folderPath: file.folderPath
                        }),
                        onload: () => {
                            addBtn.className = 'sc-add-btn sc-in-library';
                            addBtn.textContent = '✓ Di Library';
                            lastHistoryCount = -1;
                        }
                    });
                };
            }

            results.appendChild(card);
        });
    }

    /* ─────────────────────────── SSE — PERSISTENT ACROSS NAVIGATION ─────────────────────────── */
    // YouTube is a SPA; we connect SSE once at top-level and never disconnect.
    // We store the EventSource on `unsafeWindow` so it survives page transitions.
    const _win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    if (!_win.__ytdlSSE) {
        _win.__ytdlSSE = new EventSource(`${API_URL}/api/events`);
        _win.__ytdlProgress = {};
    }
    const es = _win.__ytdlSSE;

    es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        _win.__ytdlProgress = data;

        const activeCount = Object.keys(data).length;
        fab.innerHTML = activeCount > 0
            ? `⏳<span class="fab-badge">${activeCount}</span>`
            : '📂';
        fab.style.background = activeCount > 0 ? '#ffaa00' : '#ff0000';

        renderActiveDownloads(data);
    };

    /* ─────────────────────────── RENDER ACTIVE DOWNLOADS ─────────────────────────── */
    function cancelDownload(url) {
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${API_URL}/api/cancel`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ url }),
            onload: () => { lastHistoryCount = -1; }
        });
    }

    function renderActiveDownloads(data) {
        const panel = document.getElementById('dl-panel');
        if (!panel) return;

        const entries = Object.entries(data);
        if (entries.length === 0) {
            panel.innerHTML = '<p class="dl-empty" id="dl-empty">Tidak ada unduhan aktif</p>';
            return;
        }

        entries.forEach(([url, info]) => {
            let card = panel.querySelector(`[data-dl-url="${CSS.escape(url)}"]`);
            if (!card) {
                card = document.createElement('div');
                card.className = 'dl-card';
                card.setAttribute('data-dl-url', url);
                // Clear empty message if present
                const emptyMsg = panel.querySelector('.dl-empty');
                if (emptyMsg) emptyMsg.remove();
                panel.appendChild(card);
            }

            const vp = info.videoPercent || 0;
            const ap = info.audioPercent || 0;
            const phase = info.phase || 'video';
            const speed = info.speed ? `⚡ ${info.speed}` : '';
            const eta = info.eta ? `⏱ ${info.eta}` : '';
            const title = (info.title || url).substring(0, 45);
            const thumb = info.thumbnail || '';
            const quality = info.quality || '';
            const filesize = info.filesize ? `💾 ${info.filesize}` : '';

            const isMerging = phase === 'merging';
            const isDone = phase === 'done';
            const isCancelled = phase === 'cancelled';

            const phaseColor = phase === 'video' ? '#ff4444' : phase === 'audio' ? '#3ea6ff' : '#ffaa00';
            const phaseLabel = phase === 'video' ? 'Mengunduh video...' :
                               phase === 'audio' ? 'Mengunduh audio...' :
                               phase === 'merging' ? 'Menggabungkan...' :
                               phase === 'cancelled' ? 'Dibatalkan' : 'Selesai!';

            card.innerHTML = `
                <div class="dl-card-header">
                    ${thumb ? `<img src="${thumb}" onerror="this.style.display='none'">` : ''}
                    <div class="dl-card-title">${title}</div>
                    ${quality ? `<span class="dl-quality-badge">${quality}</span>` : ''}
                </div>
                ${isCancelled ? `
                    <div class="dl-cancelled-label">❌ Unduhan dibatalkan</div>
                ` : isMerging ? `
                    <div class="dl-phase-label"><span>🔀 Menggabungkan...</span><span class="dl-speed">${speed}</span></div>
                    <div class="pbar-bg"><div class="pbar-fill pbar-merge" style="width:100%"></div></div>
                ` : isDone ? `
                    <div class="dl-phase-label"><span style="color:#00cc66">✅ Selesai</span><span>${filesize}</span></div>
                    <div class="pbar-bg"><div class="pbar-fill pbar-video" style="width:100%"></div></div>
                ` : `
                    <div class="dl-phase-label">
                        <span>🎬 Video <strong>${vp.toFixed(1)}%</strong></span>
                        <span class="dl-speed">${speed}</span>
                    </div>
                    <div class="pbar-bg"><div class="pbar-fill pbar-video" style="width:${vp}%"></div></div>
                    <div class="dl-phase-label">
                        <span>🔊 Audio <strong>${ap.toFixed(1)}%</strong></span>
                        <span class="dl-eta">${eta}</span>
                    </div>
                    <div class="pbar-bg"><div class="pbar-fill pbar-audio" style="width:${ap}%"></div></div>
                `}
                <div class="dl-summary">
                    <span>${filesize}</span>
                    <span style="color:${isCancelled ? '#ff4444' : isDone ? '#00cc66' : phaseColor}">${phaseLabel}</span>
                </div>
                ${(!isDone && !isCancelled) ? `<button class="dl-cancel-btn" data-cancel-url="${url}">✕ Batalkan</button>` : ''}
            `;

            // Attach cancel listener (avoid innerHTML event binding issues)
            const cancelBtn = card.querySelector('.dl-cancel-btn');
            if (cancelBtn) {
                cancelBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`Batalkan unduhan "${title}"?`)) {
                        cancelBtn.disabled = true;
                        cancelBtn.textContent = 'Membatalkan...';
                        cancelDownload(url);
                    }
                };
            }
        });

        // Remove cards for downloads that disappeared from server state
        panel.querySelectorAll('.dl-card').forEach(card => {
            const u = card.getAttribute('data-dl-url');
            if (!data[u]) card.remove();
        });

        if (panel.children.length === 0) {
            panel.innerHTML = '<p class="dl-empty" id="dl-empty">Tidak ada unduhan aktif</p>';
        }
    }

    /* ─────────────────────────── HISTORY ─────────────────────────── */
    function loadHistory(force = false) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API_URL}/api/history`,
            onload: (res) => {
                const history = JSON.parse(res.responseText);
                if (!force && history.length === lastHistoryCount) return;
                lastHistoryCount = history.length;
                renderHistory(history);
            }
        });
    }

    function renderHistory(history) {
        const list = document.getElementById('h-list');
        list.className = libraryView;
        if (!history.length) {
            list.innerHTML = '<p style="text-align:center;color:#333;margin-top:20px;">Belum ada riwayat.</p>';
            return;
        }
        list.innerHTML = '';
        [...history].reverse().forEach(item => {
            const card = document.createElement('div');
            card.className = 'v-card';
            card.innerHTML = `
                <img src="${item.thumbnail}" onerror="this.style.display='none'">
                <div class="card-body">
                    <div class="card-title">${item.title}</div>
                    <div class="card-tags">
                        <span class="tag-quality">${item.quality}</span>
                        ${item.filesize ? `<span class="tag-size">💾 ${item.filesize}</span>` : ''}
                    </div>
                    <div class="card-actions">
                        <button class="play-b" data-file="${item.fileName}" data-title="${item.title}" data-folderpath="${item.folderPath || ''}">▶ Play</button>
                    </div>
                </div>
                <button class="del-b" data-file="${item.fileName}">🗑</button>
            `;

            card.querySelector('.play-b').onclick = function () {
                const player = document.getElementById('v-player');
                document.getElementById('p-title').textContent = this.dataset.title;
                const fp = this.dataset.folderpath;
                const fn = this.dataset.file;
                if (fp) {
                    // File from a scanned folder — use stream endpoint
                    const fullPath = fp.replace(/\/$/, '') + '/' + fn;
                    const key = btoa(encodeURIComponent(fullPath).replace(/%([0-9A-F]{2})/g,
                        (_, p1) => String.fromCharCode('0x' + p1)))
                        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                    player.src = `${API_URL}/api/stream/${key}`;
                } else {
                    player.src = `${API_URL}/files/${fn}`;
                }
                player.play();
            };
            card.querySelector('.del-b').onclick = function () {
                if (!confirm('Hapus file ini secara permanen?')) return;
                GM_xmlhttpRequest({
                    method: 'DELETE',
                    url: `${API_URL}/api/history`,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ fileName: this.dataset.file }),
                    onload: () => { lastHistoryCount = -1; loadHistory(true); }
                });
            };
            list.appendChild(card);
        });
    }

    /* ─────────────────────────── QUALITY POPUP HELPER ─────────────────────────── */
    function openQualityPopup(videoUrl, titleHint) {
        document.getElementById('q-popup-title').textContent = titleHint || 'Menganalisis...';
        document.getElementById('q-mini-list').innerHTML = '<span style="color:#666;font-size:13px;">Menganalisis format...</span>';
        miniPopup.classList.add('active');

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${API_URL}/api/info?url=${encodeURIComponent(videoUrl)}`,
            onload: (res) => {
                const data = JSON.parse(res.responseText);
                document.getElementById('q-popup-title').textContent = data.title?.substring(0, 50) || '';
                const cont = document.getElementById('q-mini-list');
                cont.innerHTML = '';
                if (!data.formats || !data.formats.length) {
                    cont.innerHTML = '<span style="color:#f55">Gagal memuat format.</span>';
                    return;
                }
                data.formats.forEach(f => {
                    const btn = document.createElement('button');
                    btn.className = 'q-mini-btn';
                    btn.innerHTML = `${f.quality}${f.filesize ? `<span class="q-size">~${f.filesize}</span>` : ''}`;
                    btn.onclick = () => {
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: `${API_URL}/api/download`,
                            headers: { 'Content-Type': 'application/json' },
                            data: JSON.stringify({
                                url: videoUrl,
                                format_id: f.format_id,
                                title: data.title,
                                quality: f.quality,
                                thumbnail: data.thumbnail
                            })
                        });
                        miniPopup.classList.remove('active');
                    };
                    cont.appendChild(btn);
                });
            },
            onerror: () => {
                document.getElementById('q-mini-list').innerHTML = '<span style="color:#f55">Koneksi ke server gagal.</span>';
            }
        });
    }

    /* ─────────────────────────── WATCH PAGE BUTTON ─────────────────────────── */
    function injectWatchBtn() {
        if (!location.pathname.startsWith('/watch')) return;
        if (document.querySelector('.ytdl-trigger-btn')) return;
        const target = document.querySelector('#top-level-buttons-computed') ||
                       document.querySelector('ytd-watch-metadata #actions');
        if (!target) return;
        const btn = document.createElement('button');
        btn.className = 'ytdl-trigger-btn';
        btn.textContent = '⬇ DOWNLOAD';
        btn.onclick = () => openQualityPopup(location.href, document.title);
        target.appendChild(btn);
    }

    /* ─────────────────────────── HOMEPAGE 3-DOT MENU INJECTION ─────────────────────────── */
    let ctxMenu = null;
    function removeCtxMenu() {
        if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    }

    function getVideoUrlFromMenu(menuBtn) {
        // Walk up to find the video renderer
        const renderers = [
            'ytd-rich-item-renderer',
            'ytd-video-renderer',
            'ytd-compact-video-renderer',
            'ytd-grid-video-renderer',
            'ytd-playlist-video-renderer'
        ];
        let el = menuBtn;
        for (let i = 0; i < 12; i++) {
            el = el.parentElement;
            if (!el) break;
            const tag = el.tagName?.toLowerCase();
            if (renderers.includes(tag)) {
                const anchor = el.querySelector('a#video-title, a#thumbnail, a.yt-simple-endpoint[href*="/watch"]');
                if (anchor) {
                    const href = anchor.getAttribute('href');
                    return href ? 'https://www.youtube.com' + href : null;
                }
            }
        }
        return null;
    }

    function getVideoTitleFromMenu(menuBtn) {
        let el = menuBtn;
        for (let i = 0; i < 12; i++) {
            el = el.parentElement;
            if (!el) break;
            const title = el.querySelector('#video-title, .ytd-video-meta-block #video-title, yt-formatted-string#video-title');
            if (title) return title.textContent?.trim() || '';
        }
        return '';
    }

    // Intercept clicks on 3-dot menu buttons across the page
    document.addEventListener('click', (e) => {
        // If clicking away from our ctx menu, close it
        if (ctxMenu && !ctxMenu.contains(e.target)) {
            removeCtxMenu();
        }
    }, true);

    // Watch for 3-dot (⋮) popup menus that YT opens
    const menuObserver = new MutationObserver(() => {
        // YT's native context popup for video items
        const ytMenus = document.querySelectorAll('ytd-menu-popup-renderer:not([ytdl-injected])');
        ytMenus.forEach(menu => {
            menu.setAttribute('ytdl-injected', '1');

            // Find the trigger button that opened this menu
            // We'll add our item into the YT menu renderer directly
            const items = menu.querySelector('ytd-menu-service-item-renderer, tp-yt-paper-listbox');
            if (!items) return;

            // Find video URL via the menu button's context
            // YT stores the renderer's data; easier to parse URL from nearby anchor
            // We'll inject a custom item at top
            const dlItem = document.createElement('ytd-menu-service-item-renderer');
            dlItem.style.cssText = 'cursor:pointer;';
            dlItem.innerHTML = `
                <tp-yt-paper-item role="option" style="display:flex;align-items:center;gap:12px;padding:0 16px;min-height:36px;cursor:pointer;">
                    <yt-icon style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;">⬇</yt-icon>
                    <yt-formatted-string style="font-size:14px;font-family:Roboto,sans-serif;">Download</yt-formatted-string>
                </tp-yt-paper-item>
            `;
            dlItem.onclick = (ev) => {
                ev.stopPropagation();
                // Find the video url from what's currently in the popup
                // YT's popup is associated with a renderer via the active button
                const activeBtn = document.querySelector('ytd-menu-renderer button.yt-icon-button:focus, ytd-menu-renderer button[aria-expanded="true"]');
                let videoUrl = null;
                let videoTitle = '';
                if (activeBtn) {
                    videoUrl = getVideoUrlFromMenu(activeBtn);
                    videoTitle = getVideoTitleFromMenu(activeBtn);
                }
                // fallback: try any open renderer
                if (!videoUrl) {
                    const anchor = menu.closest('ytd-rich-item-renderer, ytd-video-renderer')?.querySelector('a[href*="/watch"]');
                    if (anchor) videoUrl = 'https://www.youtube.com' + anchor.getAttribute('href');
                }
                if (videoUrl) {
                    // Close YT's menu
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    setTimeout(() => openQualityPopup(videoUrl, videoTitle), 100);
                }
            };

            const firstChild = items.firstChild;
            items.insertBefore(dlItem, firstChild);
        });
    });
    menuObserver.observe(document.body, { childList: true, subtree: true });

    /* ─────────────────────────── CLOSE HANDLERS ─────────────────────────── */
    document.getElementById('close-mini').onclick = () => miniPopup.classList.remove('active');
    document.getElementById('close-ytdl').onclick = () => {
        modal.classList.remove('active');
        document.getElementById('v-player').pause();
    };

    /* ─────────────────────────── AUTO-REFRESH HISTORY ─────────────────────────── */
    // Reload history when a download finishes
    let prevProgressKeys = '';
    setInterval(() => {
        const keys = Object.keys(_win.__ytdlProgress || {}).join(',');
        if (keys !== prevProgressKeys) {
            prevProgressKeys = keys;
            // If a key disappeared (download finished), refresh history
            if (keys.length < prevProgressKeys.length || keys === '') {
                loadHistory(true);
            }
        }
        if (modal.classList.contains('active')) {
            loadHistory();
        }
    }, 2000);

    /* ─────────────────────────── SPA NAV SUPPORT ─────────────────────────── */
    // Re-inject watch button after YouTube SPA navigation
    setInterval(injectWatchBtn, 2000);

    // Restore active downloads UI on page change
    setInterval(() => {
        if (_win.__ytdlProgress && Object.keys(_win.__ytdlProgress).length > 0) {
            renderActiveDownloads(_win.__ytdlProgress);
        }
    }, 1000);

})();