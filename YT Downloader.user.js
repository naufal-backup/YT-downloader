// ==UserScript==
// @name         YouTube Downloader
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  yt-dlp + Cookies Firefox + FAB UI + Auto-Refresh + Delete
// @match        *://*.youtube.com/watch*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';
    const API_URL = 'http://localhost:8989';
    let lastHistoryCount = 0;

    const styles = `
        #ytdl-fab { position: fixed; bottom: 20px; right: 20px; width: 55px; height: 55px; background: #ff0000; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.4); z-index: 999999; font-size: 22px; transition: all 0.3s ease; border: 2px solid rgba(255,255,255,0.2); }
        .ytdl-mini-popup { display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #212121; color: white; padding: 20px; border-radius: 12px; z-index: 10000000; width: 300px; box-shadow: 0 0 30px rgba(0,0,0,0.8); border: 1px solid #444; text-align: center; }
        .ytdl-mini-popup.active { display: block; }
        .ytdl-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.97); z-index: 9999999; color: white; padding: 25px; box-sizing: border-box; }
        .ytdl-modal.active { display: grid; grid-template-columns: 1fr 400px; gap: 20px; }
        .main-p { display: flex; flex-direction: column; align-items: center; background: #000; border-radius: 12px; padding: 20px; border: 1px solid #333; }
        .side-p { background: #0f0f0f; padding: 20px; border-radius: 12px; overflow-y: auto; border: 1px solid #333; }
        .v-card { display: flex; gap: 12px; background: #1e1e1e; margin-bottom: 12px; padding: 10px; border-radius: 8px; border: 1px solid #444; position: relative; }
        .v-card img { width: 100px; height: 56px; border-radius: 4px; object-fit: cover; }
        .quality-tag { background: #ff0000; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; margin-bottom: 4px; display: inline-block; }
        .p-bar-bg { width: 100%; background: #333; height: 6px; border-radius: 3px; margin: 10px 0; overflow: hidden; }
        .p-bar-fill { width: 0%; height: 100%; background: #00ff00; transition: width 0.3s; }
        .q-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .q-mini-btn { background: #333; color: white; border: 1px solid #444; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold; }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);

    const modal = document.createElement('div');
    modal.className = 'ytdl-modal';
    modal.innerHTML = `
        <div class="main-p">
            <h2 id="p-title" style="margin-bottom:15px;">Library & Player</h2>
            <video id="v-player" controls style="width:100%; max-height:60vh; border-radius:8px; background:#000;"></video>
            <div id="p-container" style="width: 100%; margin-top: 20px; display:none;">
                <div id="p-status" style="color:#0f0; margin-bottom: 5px; font-weight:bold;">Status: Idle</div>
                <div class="p-bar-bg"><div id="p-fill" class="p-bar-fill"></div></div>
            </div>
            <button id="close-ytdl" style="margin-top:auto; background:#333; color:white; border:none; padding:10px 40px; border-radius:20px; cursor:pointer; font-weight:bold;">TUTUP</button>
        </div>
        <div class="side-p">
            <h3 style="border-bottom:1px solid #333; padding-bottom:10px;">Riwayat Unduhan</h3>
            <div id="h-list"></div>
        </div>
    `;
    document.body.appendChild(modal);

    const miniPopup = document.createElement('div');
    miniPopup.className = 'ytdl-mini-popup';
    miniPopup.innerHTML = `<h3>Pilih Kualitas</h3><div id="q-mini-list" class="q-grid"></div><button id="close-mini" style="margin-top:15px; background:none; border:none; color:#888; cursor:pointer;">Batal</button>`;
    document.body.appendChild(miniPopup);

    const fab = document.createElement('div');
    fab.id = 'ytdl-fab';
    fab.innerHTML = '📂';
    fab.onclick = () => { modal.classList.add('active'); loadHistory(); };
    document.body.appendChild(fab);

    // Monitoring Progress & Auto-Refresh
    const eventSource = new EventSource(`${API_URL}/api/events`);
    eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const url = window.location.href;
        if (data[url]) {
            document.getElementById('p-container').style.display = 'block';
            document.getElementById('p-fill').style.width = data[url].percent;
            document.getElementById('p-status').innerText = `Downloading: ${data[url].percent}`;
            if (data[url].percent === "100%") setTimeout(loadHistory, 1500);
            fab.innerHTML = '⏳';
            fab.style.background = '#00ff00';
        } else {
            fab.innerHTML = '📂';
            fab.style.background = '#ff0000';
        }
    };

    function loadHistory() {
        GM_xmlhttpRequest({
            method: "GET",
            url: `${API_URL}/api/history`,
            onload: (res) => {
                const history = JSON.parse(res.responseText);
                if (history.length === lastHistoryCount && document.getElementById('h-list').innerHTML !== '') return;
                lastHistoryCount = history.length;

                const list = document.getElementById('h-list');
                list.innerHTML = history.length ? '' : '<p style="text-align:center; color:#555;">Belum ada riwayat.</p>';

                [...history].reverse().forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'v-card';
                    div.innerHTML = `
                        <img src="${item.thumbnail}">
                        <div style="flex:1;">
                            <span class="quality-tag">${item.quality}</span>
                            <div style="font-weight:bold; font-size:11px; margin-bottom:5px; line-height:1.2; padding-right:20px;">${item.title.substring(0,40)}...</div>
                            <button class="play-b" style="background:#3ea6ff; border:none; color:white; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:10px; font-weight:bold;"
                                    data-file="${item.fileName}" data-title="${item.title}">▶ PLAY</button>
                            <button class="del-b" style="background:none; border:none; color:#ff4444; cursor:pointer; font-size:14px; position:absolute; top:10px; right:10px;"
                                    data-file="${item.fileName}">🗑</button>
                        </div>
                    `;
                    list.appendChild(div);
                });

                document.querySelectorAll('.play-b').forEach(b => {
                    b.onclick = function() {
                        const player = document.getElementById('v-player');
                        document.getElementById('p-title').innerText = `Memutar: ${this.dataset.title}`;
                        player.src = `${API_URL}/files/${this.dataset.file}`;
                        player.play();
                    };
                });

                document.querySelectorAll('.del-b').forEach(b => {
                    b.onclick = function() {
                        if (confirm('Hapus file ini secara permanen?')) {
                            GM_xmlhttpRequest({
                                method: "DELETE",
                                url: `${API_URL}/api/history`,
                                headers: {"Content-Type": "application/json"},
                                data: JSON.stringify({ fileName: this.dataset.file }),
                                onload: () => { lastHistoryCount = -1; loadHistory(); }
                            });
                        }
                    };
                });
            }
        });
    }

    function injectBtn() {
        if (document.querySelector('.ytdl-trigger-btn')) return;
        const target = document.querySelector('#top-level-buttons-computed') || document.querySelector('.YtActionButtonsOwnerSegmentRenderershape');
        if (target) {
            const btn = document.createElement('button');
            btn.className = 'ytdl-trigger-btn';
            btn.innerText = '⬇ DOWNLOAD';
            btn.style = "background:#ff0000; color:white; border-radius:18px; padding:8px 16px; cursor:pointer; font-weight:bold; border:none; margin-left:8px; font-size:12px;";
            btn.onclick = () => {
                miniPopup.classList.add('active');
                document.getElementById('q-mini-list').innerHTML = 'Menganalisis...';
                GM_xmlhttpRequest({
                    method: "GET",
                    url: `${API_URL}/api/info?url=${encodeURIComponent(window.location.href)}`,
                    onload: (res) => {
                        const data = JSON.parse(res.responseText);
                        const listCont = document.getElementById('q-mini-list');
                        listCont.innerHTML = '';
                        data.formats.forEach(f => {
                            const b = document.createElement('button');
                            b.className = 'q-mini-btn';
                            b.innerText = f.quality;
                            b.onclick = () => {
                                GM_xmlhttpRequest({
                                    method: "POST",
                                    url: `${API_URL}/api/download`,
                                    headers: {"Content-Type": "application/json"},
                                    data: JSON.stringify({ url: window.location.href, format_id: f.format_id, title: data.title, quality: f.quality, thumbnail: data.thumbnail })
                                });
                                miniPopup.classList.remove('active');
                            };
                            listCont.appendChild(b);
                        });
                    }
                });
            };
            target.appendChild(btn);
        }
    }

    document.getElementById('close-mini').onclick = () => miniPopup.classList.remove('active');
    document.getElementById('close-ytdl').onclick = () => { modal.classList.remove('active'); document.getElementById('v-player').pause(); };
    setInterval(injectBtn, 2000);
})();