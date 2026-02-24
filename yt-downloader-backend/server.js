const express = require('express');
const cors    = require('cors');
const { spawn, exec } = require('child_process');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8989;

// ─── PATHS (semua relatif terhadap folder server.js) ──────────────────────────
const ROOT         = __dirname;
const CONFIG_PATH  = path.join(ROOT, 'ytdl-config.json');
const LIBRARY_PATH = path.join(ROOT, 'ytdl-library.json');

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return null;
    if (bytes < 1024 * 1024)        return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const VIDEO_EXTS = new Set(['.mp4','.mkv','.webm','.avi','.mov','.flv','.m4v','.ts','.wmv','.3gp']);
function isVideoFile(f) { return VIDEO_EXTS.has(path.extname(f).toLowerCase()); }

function libKey(folderPath, fileName) {
    return path.resolve(folderPath, fileName);
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (_) {}
    return { downloadFolder: path.join(os.homedir(), 'Downloads', 'YT-Downloads'), scanFolders: [] };
}
function saveConfig(cfg) {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }
    catch (e) { console.error('Config save error:', e.message); }
}

let config = loadConfig();
if (!fs.existsSync(config.downloadFolder)) fs.mkdirSync(config.downloadFolder, { recursive: true });

// ─── PERSISTENT LIBRARY ──────────────────────────────────────────────────────
// Entry schema:
// { fileName, folderPath, title, quality, thumbnail, filesize, isShorts, sourceUrl, date }

function loadLibrary() {
    try {
        if (fs.existsSync(LIBRARY_PATH)) {
            const raw = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
            if (Array.isArray(raw)) return raw;
        }
    } catch (e) { console.error('Library load error:', e.message); }
    return [];
}

function saveLibrary() {
    try { fs.writeFileSync(LIBRARY_PATH, JSON.stringify(downloadHistory, null, 2)); }
    catch (e) { console.error('Library save error:', e.message); }
}

let downloadHistory = loadLibrary();

// Startup: hapus entry yang file videonya sudah tidak ada di disk
(function pruneOrphans() {
    const before = downloadHistory.length;
    downloadHistory = downloadHistory.filter(h => {
        const fp = h.folderPath || config.downloadFolder;
        return fs.existsSync(path.join(fp, h.fileName));
    });
    if (downloadHistory.length !== before) {
        console.log(`🧹 Pruned ${before - downloadHistory.length} orphaned entries`);
        saveLibrary();
    }
})();

// ─── RUNTIME STATE ───────────────────────────────────────────────────────────
let currentProgress = {};
let activeProcesses = {};
let pausedProcesses = {}; // set of paused URLs

// ─── STATIC VIDEO FILES ──────────────────────────────────────────────────────
app.use('/files', (req, res, next) => express.static(config.downloadFolder)(req, res, next));

// ─── THUMBNAIL PROXY ─────────────────────────────────────────────────────────
// Proxies YouTube thumbnail URLs to avoid CORS/mixed-content blocks in browser.
// Usage: GET /api/thumb?url=https://i.ytimg.com/vi/...
app.get('/api/thumb', (req, res) => {
    const remoteUrl = req.query.url;
    if (!remoteUrl) return res.status(400).send('Missing url');

    // Only allow ytimg.com and yt3.ggpht.com (YouTube CDN domains)
    let parsed;
    try { parsed = new URL(remoteUrl); } catch (_) { return res.status(400).send('Invalid url'); }
    const allowed = ['i.ytimg.com', 'i9.ytimg.com', 'yt3.ggpht.com', 'lh3.googleusercontent.com'];
    if (!allowed.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
        return res.status(403).send('Domain not allowed');
    }

    const proto = remoteUrl.startsWith('https') ? https : http;
    const proxyReq = proto.get(remoteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, upstream => {
        if (upstream.statusCode !== 200) {
            return res.status(upstream.statusCode).send('Upstream error');
        }
        res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        upstream.pipe(res);
    });
    proxyReq.on('error', () => res.status(502).send('Proxy error'));
});

// ─── CONFIG ENDPOINTS ────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
    res.json({ downloadFolder: config.downloadFolder, scanFolders: config.scanFolders || [] });
});

app.post('/api/config', (req, res) => {
    const { downloadFolder: newFolder, scanFolders } = req.body;
    if (newFolder && typeof newFolder === 'string') {
        config.downloadFolder = newFolder;
        if (!fs.existsSync(config.downloadFolder)) {
            try { fs.mkdirSync(config.downloadFolder, { recursive: true }); } catch (_) {}
        }
    }
    if (Array.isArray(scanFolders)) config.scanFolders = scanFolders;
    saveConfig(config);
    res.json({ success: true, config });
});

// ─── SCAN ────────────────────────────────────────────────────────────────────
function scanFolder(folderPath) {
    const results = [];
    if (!folderPath || !fs.existsSync(folderPath)) return results;
    try {
        fs.readdirSync(folderPath, { withFileTypes: true }).forEach(entry => {
            if (!entry.isFile() || !isVideoFile(entry.name)) return;
            if (entry.name.endsWith('.part') || entry.name.endsWith('.ytdl')) return;
            try {
                const fullPath = path.join(folderPath, entry.name);
                const stat = fs.statSync(fullPath);
                results.push({
                    fileName: entry.name,
                    title: entry.name.replace(/\.[^.]+$/, '').replace(/[_.-]+/g, ' ').trim(),
                    filesize: formatBytes(stat.size),
                    date: stat.mtime.toISOString(),
                    folderPath,
                    streamKey: Buffer.from(fullPath).toString('base64url')
                });
            } catch (_) {}
        });
    } catch (e) { console.error('Scan error:', folderPath, e.message); }
    return results;
}

app.get('/api/scan', (req, res) => {
    const folders  = [config.downloadFolder, ...(config.scanFolders || [])].filter(Boolean);
    const seen     = new Set();
    const allFiles = [];
    let newCount   = 0;

    folders.forEach(folder => {
        scanFolder(folder).forEach(f => {
            const key = libKey(f.folderPath, f.fileName);
            if (seen.has(key)) return;
            seen.add(key);

            const existing = downloadHistory.find(
                h => libKey(h.folderPath || config.downloadFolder, h.fileName) === key
            );

            if (!existing) {
                // File baru — tambahkan ke library dengan metadata dasar
                const entry = {
                    fileName:   f.fileName,
                    folderPath: f.folderPath,
                    title:      f.title,
                    quality:    f.fileName.split('.').pop().toUpperCase(),
                    thumbnail:  '',
                    filesize:   f.filesize,
                    isShorts:   false,
                    sourceUrl:  '',
                    date:       f.date
                };
                downloadHistory.push(entry);
                newCount++;
                allFiles.push({ ...f, inHistory: true, thumbnail: '', isShorts: false });
            } else {
                // Sudah ada — kembalikan metadata tersimpan (thumbnail, title, dll)
                allFiles.push({
                    ...f,
                    title:     existing.title     || f.title,
                    thumbnail: existing.thumbnail || '',
                    isShorts:  existing.isShorts  || false,
                    quality:   existing.quality   || f.fileName.split('.').pop().toUpperCase(),
                    inHistory: true
                });
            }
        });
    });

    if (newCount > 0) {
        saveLibrary();
        console.log(`📚 Auto-added ${newCount} file(s) to library`);
    }

    allFiles.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(allFiles);
});

// ─── STREAM (Range support untuk seeking) ────────────────────────────────────
app.get('/api/stream/:key', (req, res) => {
    try {
        const filePath = Buffer.from(req.params.key, 'base64url').toString('utf8');
        const allowedFolders = [config.downloadFolder, ...(config.scanFolders || [])].filter(Boolean);
        const safe = allowedFolders.some(f => filePath.startsWith(path.resolve(f)));
        if (!safe) return res.status(403).send('Akses ditolak');
        if (!fs.existsSync(filePath)) return res.status(404).send('File tidak ditemukan');

        const stat     = fs.statSync(filePath);
        const fileSize = stat.size;
        const mimeMap  = {
            '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm',
            '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.m4v': 'video/mp4',
            '.ts':  'video/mp2t', '.flv': 'video/x-flv'
        };
        const mime = mimeMap[path.extname(filePath).toLowerCase()] || 'video/mp4';

        const range = req.headers.range;
        if (range) {
            const [s, e] = range.replace(/bytes=/, '').split('-');
            const start  = parseInt(s, 10);
            const end    = e ? parseInt(e, 10) : fileSize - 1;
            res.writeHead(206, {
                'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges':  'bytes',
                'Content-Length': end - start + 1,
                'Content-Type':   mime
            });
            fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (e) {
        if (!res.headersSent) res.status(500).send('Stream error: ' + e.message);
    }
});

// ─── VIDEO INFO ──────────────────────────────────────────────────────────────
app.get('/api/info', (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL diperlukan' });
    const ytdlpPath = '/home/tb/.local/bin/yt-dlp';
    exec(`${ytdlpPath} --extractor-args "youtube:player_client=android_vr" -J "${url}"`, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: 'Gagal memuat info video', detail: stderr });
        try {
            const info    = JSON.parse(stdout);
            const seen    = new Set();
            const formats = [];
            info.formats
                .filter(f => f.vcodec !== 'none' && f.height)
                .sort((a, b) => b.height - a.height)
                .forEach(f => {
                    if (seen.has(f.height)) return;
                    seen.add(f.height);
                    const total = (f.filesize || f.filesize_approx || 0) + 1024 * 1024 * 5;
                    formats.push({
                        format_id: f.format_id,
                        quality:   `${f.height}p`,
                        filesize:  total > 5 * 1024 * 1024 ? formatBytes(total) : null
                    });
                });
            res.json({ title: info.title, thumbnail: info.thumbnail, formats });
        } catch (e) { res.status(500).json({ error: 'Parsing metadata gagal' }); }
    });
});

// ─── SSE PROGRESS ────────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const iv = setInterval(() => res.write(`data: ${JSON.stringify(currentProgress)}\n\n`), 500);
    req.on('close', () => clearInterval(iv));
});

// ─── DOWNLOAD ────────────────────────────────────────────────────────────────
app.post('/api/download', (req, res) => {
    const { url, format_id, title, quality, thumbnail, isShorts, sourceUrl } = req.body;
    if (!url || !format_id || !title) return res.status(400).json({ error: 'Parameter tidak lengkap' });

    const safeName   = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 120);
    const fileName   = `${safeName}.mp4`;
    const outputPath = path.join(config.downloadFolder, fileName);

    currentProgress[url] = {
        title, quality, thumbnail, fileName,
        videoPercent: 0, audioPercent: 0,
        phase: 'video', speed: null, eta: null, filesize: null
    };

    const ytProcess = spawn('/home/tb/.local/bin/yt-dlp', [
        '--extractor-args', 'youtube:player_client=android_vr',
        '-f', `${format_id}+bestaudio[ext=m4a]/bestaudio/best`,
        '--merge-output-format', 'mp4',
        '--newline',
        '-o', outputPath,
        url
    ], {
        detached: true   // Buat process group sendiri agar SIGSTOP/SIGCONT bisa dikirim ke seluruh group
    });
    activeProcesses[url] = ytProcess;

    let destCount = 0;
    let buf = '';

    function parseLine(line) {
        if (!currentProgress[url]) return;
        line = line.trim();
        if (!line) return;
        if (line.includes('[download] Destination:')) {
            destCount++;
            currentProgress[url].phase = destCount >= 2 ? 'audio' : 'video';
            return;
        }
        if (line.includes('[Merger]') || line.includes('Merging formats')) {
            currentProgress[url].phase = 'merging';
            return;
        }
        if (!line.startsWith('[download]')) return;
        const pct   = line.match(/(\d+\.?\d*)%/);
        const speed = line.match(/at\s+([\d.]+\s*\w+iB\/s)/i);
        const eta   = line.match(/ETA\s+(\d{2}:\d{2})/i);
        const size  = line.match(/of\s+~?\s*([\d.]+\s*\w+iB)/i);
        if (pct) {
            const p = parseFloat(pct[1]);
            if (currentProgress[url].phase === 'video') currentProgress[url].videoPercent = p;
            else if (currentProgress[url].phase === 'audio') currentProgress[url].audioPercent = p;
        }
        if (speed) currentProgress[url].speed = speed[1];
        if (eta)   currentProgress[url].eta   = eta[1];
        if (size && !currentProgress[url].filesize) currentProgress[url].filesize = size[1];
    }

    const processChunk = chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        lines.forEach(parseLine);
    };

    ytProcess.stdout.on('data', processChunk);
    ytProcess.stderr.on('data', processChunk);

    ytProcess.on('close', (code) => {
        delete activeProcesses[url];
        if (!currentProgress[url]) return;

        if (code === 0 && fs.existsSync(outputPath)) {
            const size = formatBytes(fs.statSync(outputPath).size);
            currentProgress[url].phase        = 'done';
            currentProgress[url].videoPercent = 100;
            currentProgress[url].audioPercent = 100;
            currentProgress[url].filesize     = size;

            const entry = {
                fileName,
                folderPath: config.downloadFolder,
                title,
                quality,
                thumbnail:  thumbnail || '',
                filesize:   size,
                isShorts:   !!isShorts,
                sourceUrl:  sourceUrl || url,
                date:       new Date().toISOString()
            };

            const key = libKey(config.downloadFolder, fileName);
            const idx = downloadHistory.findIndex(
                h => libKey(h.folderPath || config.downloadFolder, h.fileName) === key
            );
            if (idx >= 0) downloadHistory[idx] = entry;
            else downloadHistory.push(entry);

            saveLibrary();

        } else if (currentProgress[url].phase !== 'cancelled') {
            currentProgress[url].phase = 'done';
        }

        setTimeout(() => delete currentProgress[url], 10000);
    });

    res.json({ success: true, fileName });
});

// ─── CANCEL ──────────────────────────────────────────────────────────────────
app.post('/api/cancel', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL diperlukan' });
    const proc = activeProcesses[url];
    if (!proc) return res.status(404).json({ error: 'Proses tidak ditemukan' });

    // Kalau sedang dijeda, resume dulu sebelum SIGKILL agar proses tidak hang
    if (pausedProcesses[url]) {
        try { process.kill(-proc.pid, 'SIGCONT'); } catch (_) {}
        delete pausedProcesses[url];
    }

    try { process.kill(-proc.pid, 'SIGKILL'); } catch (_) {
        try { proc.kill('SIGKILL'); } catch (__) {}
    }
    delete activeProcesses[url];

    if (currentProgress[url]) {
        const { fileName } = currentProgress[url];
        currentProgress[url].phase = 'cancelled';
        setTimeout(() => delete currentProgress[url], 5000);
        const base = path.basename(fileName, '.mp4');
        try {
            fs.readdirSync(config.downloadFolder).forEach(f => {
                if (f.startsWith(base)) fs.unlink(path.join(config.downloadFolder, f), () => {});
            });
        } catch (_) {}
    }
    res.json({ success: true });
});

// ─── PAUSE / RESUME ──────────────────────────────────────────────────────────
app.post('/api/pause', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL diperlukan' });
    const proc = activeProcesses[url];
    if (!proc) return res.status(404).json({ error: 'Proses tidak ditemukan' });

    // Karena spawn memakai detached:true, proc.pid adalah process group leader.
    // Kirim sinyal ke -pid agar seluruh group (termasuk yt-dlp child) ikut kena.
    const sendSignal = (sig) => {
        try {
            process.kill(-proc.pid, sig); // seluruh process group
        } catch (e1) {
            try { proc.kill(sig); } catch (e2) {
                console.error(`[pause] Gagal kirim ${sig}:`, e2.message);
            }
        }
    };

    if (pausedProcesses[url]) {
        // RESUME
        sendSignal('SIGCONT');
        delete pausedProcesses[url];
        if (currentProgress[url]) currentProgress[url].paused = false;
        console.log(`▶ Resumed: ${url}`);
        res.json({ success: true, paused: false });
    } else {
        // PAUSE
        sendSignal('SIGSTOP');
        pausedProcesses[url] = true;
        if (currentProgress[url]) currentProgress[url].paused = true;
        console.log(`⏸ Paused: ${url}`);
        res.json({ success: true, paused: true });
    }
});

// ─── LIBRARY ENDPOINTS ───────────────────────────────────────────────────────

// GET: semua entri library
app.get('/api/history', (req, res) => res.json(downloadHistory));

// POST: tambah file ke library secara manual (dari Scan panel)
app.post('/api/history/add', (req, res) => {
    const { title, quality, thumbnail, fileName, filesize, folderPath, isShorts, sourceUrl } = req.body;
    if (!fileName) return res.status(400).json({ error: 'fileName diperlukan' });

    const fp  = folderPath || config.downloadFolder;
    const key = libKey(fp, fileName);

    const entry = {
        fileName,
        folderPath: fp,
        title:      title     || fileName,
        quality:    quality   || 'LOCAL',
        thumbnail:  thumbnail || '',
        filesize:   filesize  || null,
        isShorts:   !!isShorts,
        sourceUrl:  sourceUrl || '',
        date:       new Date().toISOString()
    };

    const idx = downloadHistory.findIndex(
        h => libKey(h.folderPath || config.downloadFolder, h.fileName) === key
    );
    if (idx >= 0) downloadHistory[idx] = entry;
    else downloadHistory.push(entry);

    saveLibrary();
    res.json({ success: true });
});

// DELETE: hapus dari library + hapus file video dari disk
app.delete('/api/history', (req, res) => {
    const { fileName, folderPath } = req.body;
    if (!fileName) return res.status(400).json({ error: 'fileName diperlukan' });

    const fp       = folderPath || config.downloadFolder;
    const filePath = path.join(fp, fileName);
    const key      = libKey(fp, fileName);

    // Hapus file video
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, err => { if (err) console.error('Gagal hapus video:', err.message); });
    }

    // Hapus dari library
    downloadHistory = downloadHistory.filter(
        h => libKey(h.folderPath || config.downloadFolder, h.fileName) !== key
    );
    saveLibrary();

    res.json({ success: true });
});

// POST: hapus entry yang file videonya sudah tidak ada di disk
app.post('/api/history/prune', (req, res) => {
    const before = downloadHistory.length;
    downloadHistory = downloadHistory.filter(h => {
        const fp = h.folderPath || config.downloadFolder;
        return fs.existsSync(path.join(fp, h.fileName));
    });
    const removed = before - downloadHistory.length;
    if (removed > 0) saveLibrary();
    res.json({ success: true, removed });
});

// ─── START ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ YT-Downloader backend aktif di http://localhost:${PORT}`);
    console.log(`📁 Download folder : ${config.downloadFolder}`);
    console.log(`📄 Config JSON     : ${CONFIG_PATH}`);
    console.log(`📚 Library JSON    : ${LIBRARY_PATH}`);
    console.log(`📖 Library entries : ${downloadHistory.length}`);
});
