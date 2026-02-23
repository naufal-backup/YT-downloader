const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 8989;
const CONFIG_PATH = path.join(os.homedir(), '.ytdl-config.json');

// ─── HELPERS (defined first) ───
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return null;
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.m4v', '.ts', '.wmv', '.3gp']);
function isVideoFile(filename) {
    return VIDEO_EXTS.has(path.extname(filename).toLowerCase());
}

// ─── CONFIG ───
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (_) {}
    return { downloadFolder: path.join(os.homedir(), 'Downloads', 'YT-Downloads'), scanFolders: [] };
}
function saveConfig(cfg) {
    try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch (e) { console.error('Config save error:', e.message); }
}

let config = loadConfig();
if (!fs.existsSync(config.downloadFolder)) {
    fs.mkdirSync(config.downloadFolder, { recursive: true });
}

// ─── STATE ───
let downloadHistory = [];
let currentProgress = {};
let activeProcesses = {};

// ─── STATIC: dynamic so it follows config.downloadFolder changes ───
app.use('/files', (req, res, next) => express.static(config.downloadFolder)(req, res, next));

// ─── CONFIG ENDPOINTS ───
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

// ─── SCAN ───
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
    const folders = [config.downloadFolder, ...(config.scanFolders || [])].filter(Boolean);
    const seen = new Set();
    const allFiles = [];
    folders.forEach(folder => {
        scanFolder(folder).forEach(f => {
            const key = path.join(f.folderPath, f.fileName);
            if (seen.has(key)) return;
            seen.add(key);
            const inHistory = downloadHistory.some(
                h => h.fileName === f.fileName && (h.folderPath || config.downloadFolder) === f.folderPath
            );
            allFiles.push({ ...f, inHistory });
        });
    });
    allFiles.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(allFiles);
});

// ─── STREAM (with Range support for seeking) ───
app.get('/api/stream/:key', (req, res) => {
    try {
        const filePath = Buffer.from(req.params.key, 'base64url').toString('utf8');
        const allowedFolders = [config.downloadFolder, ...(config.scanFolders || [])].filter(Boolean);
        const safe = allowedFolders.some(f => filePath.startsWith(path.resolve(f)));
        if (!safe) return res.status(403).send('Akses ditolak');
        if (!fs.existsSync(filePath)) return res.status(404).send('File tidak ditemukan');

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const mimeMap = { '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.ts': 'video/mp2t', '.flv': 'video/x-flv' };
        const mime = mimeMap[path.extname(filePath).toLowerCase()] || 'video/mp4';

        const range = req.headers.range;
        if (range) {
            const [s, e] = range.replace(/bytes=/, '').split('-');
            const start = parseInt(s, 10);
            const end = e ? parseInt(e, 10) : fileSize - 1;
            res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': mime });
            fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (e) {
        if (!res.headersSent) res.status(500).send('Stream error: ' + e.message);
    }
});

// ─── VIDEO INFO ───
app.get('/api/info', (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL diperlukan' });
    exec(`yt-dlp --cookies-from-browser firefox -J "${url}"`, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: 'Gagal memuat info video' });
        try {
            const info = JSON.parse(stdout);
            const seen = new Set();
            const formats = [];
            info.formats
                .filter(f => f.vcodec !== 'none' && f.height)
                .sort((a, b) => b.height - a.height)
                .forEach(f => {
                    if (seen.has(f.height)) return;
                    seen.add(f.height);
                    const total = (f.filesize || f.filesize_approx || 0) + 1024 * 1024 * 5;
                    formats.push({ format_id: f.format_id, quality: `${f.height}p`, filesize: total > 5 * 1024 * 1024 ? formatBytes(total) : null });
                });
            res.json({ title: info.title, thumbnail: info.thumbnail, formats });
        } catch (e) { res.status(500).json({ error: 'Parsing metadata gagal' }); }
    });
});

// ─── SSE PROGRESS ───
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const iv = setInterval(() => res.write(`data: ${JSON.stringify(currentProgress)}\n\n`), 500);
    req.on('close', () => clearInterval(iv));
});

// ─── DOWNLOAD ───
app.post('/api/download', (req, res) => {
    const { url, format_id, title, quality, thumbnail } = req.body;
    if (!url || !format_id || !title) return res.status(400).json({ error: 'Parameter tidak lengkap' });

    const safeName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 120);
    const fileName = `${safeName}.mp4`;
    const outputPath = path.join(config.downloadFolder, fileName);

    currentProgress[url] = { title, quality, thumbnail, fileName, videoPercent: 0, audioPercent: 0, phase: 'video', speed: null, eta: null, filesize: null };

    // IMPORTANT: Do NOT use --progress-template — it suppresses [download] Destination: lines
    // which we need to detect video vs audio phase. Use default output + --newline.
    const ytProcess = spawn('yt-dlp', [
        '--cookies-from-browser', 'firefox',
        '-f', `${format_id}+bestaudio/best`,
        '--merge-output-format', 'mp4',
        '--newline',
        '-o', outputPath,
        url
    ]);
    activeProcesses[url] = ytProcess;

    let destCount = 0;
    let buf = '';

    function parseLine(line) {
        if (!currentProgress[url]) return;
        line = line.trim();
        if (!line) return;

        // Detect which stream is being downloaded
        if (line.includes('[download] Destination:')) {
            destCount++;
            // First destination = video, second = audio
            currentProgress[url].phase = destCount >= 2 ? 'audio' : 'video';
            return;
        }

        // Merger phase
        if (line.includes('[Merger]') || line.includes('Merging formats')) {
            currentProgress[url].phase = 'merging';
            return;
        }

        // Progress: [download]  45.3% of   ~100.00MiB at    4.20MiB/s ETA 00:14
        if (!line.startsWith('[download]')) return;
        const pct = line.match(/(\d+\.?\d*)%/);
        const speed = line.match(/at\s+([\d.]+\s*\w+iB\/s)/i);
        const eta = line.match(/ETA\s+(\d{2}:\d{2})/i);
        const size = line.match(/of\s+~?\s*([\d.]+\s*\w+iB)/i);

        if (pct) {
            const p = parseFloat(pct[1]);
            if (currentProgress[url].phase === 'video') currentProgress[url].videoPercent = p;
            else if (currentProgress[url].phase === 'audio') currentProgress[url].audioPercent = p;
        }
        if (speed) currentProgress[url].speed = speed[1];
        if (eta) currentProgress[url].eta = eta[1];
        if (size && !currentProgress[url].filesize) currentProgress[url].filesize = size[1];
    }

    const processChunk = (chunk) => {
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
            currentProgress[url].phase = 'done';
            currentProgress[url].videoPercent = 100;
            currentProgress[url].audioPercent = 100;
            currentProgress[url].filesize = size;
            downloadHistory.push({ title, quality, thumbnail, fileName, filesize: size, date: new Date().toISOString() });
        } else if (currentProgress[url].phase !== 'cancelled') {
            currentProgress[url].phase = 'done';
            downloadHistory.push({ title, quality, thumbnail, fileName, filesize: null, date: new Date().toISOString() });
        }
        setTimeout(() => delete currentProgress[url], 10000);
    });

    res.json({ success: true, fileName });
});

// ─── CANCEL ───
app.post('/api/cancel', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL diperlukan' });
    const proc = activeProcesses[url];
    if (!proc) return res.status(404).json({ error: 'Proses tidak ditemukan' });

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

// ─── HISTORY ───
app.get('/api/history', (req, res) => res.json(downloadHistory));

app.post('/api/history/add', (req, res) => {
    const { title, quality, thumbnail, fileName, filesize, folderPath } = req.body;
    if (!fileName) return res.status(400).json({ error: 'fileName diperlukan' });
    const fp = folderPath || config.downloadFolder;
    if (!downloadHistory.some(h => h.fileName === fileName && (h.folderPath || config.downloadFolder) === fp)) {
        downloadHistory.push({ title: title || fileName, quality: quality || 'LOCAL', thumbnail: thumbnail || '', fileName, filesize: filesize || null, folderPath: fp, date: new Date().toISOString() });
    }
    res.json({ success: true });
});

app.delete('/api/history', (req, res) => {
    const { fileName, folderPath } = req.body;
    if (!fileName) return res.status(400).json({ error: 'fileName diperlukan' });
    const fp = folderPath || config.downloadFolder;
    const filePath = path.join(fp, fileName);
    if (fs.existsSync(filePath)) fs.unlink(filePath, err => { if (err) console.error('Gagal hapus:', err.message); });
    downloadHistory = downloadHistory.filter(h => !(h.fileName === fileName && (h.folderPath || config.downloadFolder) === fp));
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`✅ YT-Downloader backend aktif di http://localhost:${PORT}`);
    console.log(`📁 Folder unduhan: ${config.downloadFolder}`);
});