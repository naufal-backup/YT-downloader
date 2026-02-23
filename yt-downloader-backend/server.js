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

// Load or initialize config
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (_) {}
    return { downloadFolder: path.join(os.homedir(), 'Downloads', 'YT-Downloads'), scanFolders: [] };
}
function saveConfig(cfg) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

let config = loadConfig();
let downloadFolder = config.downloadFolder;

if (!fs.existsSync(downloadFolder)) {
    fs.mkdirSync(downloadFolder, { recursive: true });
}

app.use('/files', express.static(downloadFolder));

// Serve files from all scan folders too (mapped by index)
function refreshStaticRoutes() {
    // Routes are registered once; we handle scan folders via explicit send instead
}

let downloadHistory = [];
let currentProgress = {};
let activeProcesses = {}; // url -> child process

// ─── VIDEO FILE EXTENSIONS ───
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.m4v', '.ts', '.wmv', '.3gp']);

function isVideoFile(filename) {
    return VIDEO_EXTS.has(path.extname(filename).toLowerCase());
}

// ─── CONFIG & FOLDER MANAGEMENT ───
app.get('/api/config', (req, res) => {
    res.json({ downloadFolder: config.downloadFolder, scanFolders: config.scanFolders || [] });
});

app.post('/api/config', (req, res) => {
    const { downloadFolder: newFolder, scanFolders } = req.body;
    if (newFolder) {
        config.downloadFolder = newFolder;
        downloadFolder = newFolder;
        if (!fs.existsSync(downloadFolder)) {
            try { fs.mkdirSync(downloadFolder, { recursive: true }); } catch (_) {}
        }
    }
    if (Array.isArray(scanFolders)) config.scanFolders = scanFolders;
    saveConfig(config);
    res.json({ success: true, config });
});

// ─── SCAN: read all video files from a folder ───
function scanFolder(folderPath) {
    const results = [];
    if (!fs.existsSync(folderPath)) return results;
    try {
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });
        entries.forEach(entry => {
            if (entry.isFile() && isVideoFile(entry.name)) {
                const fullPath = path.join(folderPath, entry.name);
                const stat = fs.statSync(fullPath);
                results.push({
                    fileName: entry.name,
                    title: entry.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
                    filesize: formatBytes(stat.size),
                    date: stat.mtime.toISOString(),
                    folderPath,
                    // URL-safe path for streaming
                    streamKey: Buffer.from(fullPath).toString('base64url')
                });
            }
        });
    } catch (e) { console.error('Scan error:', e.message); }
    return results;
}

app.get('/api/scan', (req, res) => {
    const foldersToScan = [config.downloadFolder, ...(config.scanFolders || [])];
    const allFiles = [];
    const seenPaths = new Set();

    foldersToScan.forEach(folder => {
        const files = scanFolder(folder);
        files.forEach(f => {
            const key = path.join(f.folderPath, f.fileName);
            if (!seenPaths.has(key)) {
                seenPaths.add(key);
                // Mark if already in history
                const inHistory = downloadHistory.some(h => h.fileName === f.fileName);
                allFiles.push({ ...f, inHistory });
            }
        });
    });

    // Sort: newest first
    allFiles.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(allFiles);
});

// Stream arbitrary local file by base64 key
app.get('/api/stream/:key', (req, res) => {
    try {
        const filePath = Buffer.from(req.params.key, 'base64url').toString('utf8');
        // Security: must be under one of our known folders
        const allowed = [config.downloadFolder, ...(config.scanFolders || [])];
        const safe = allowed.some(f => filePath.startsWith(f));
        if (!safe) return res.status(403).json({ error: 'Akses ditolak' });
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File tidak ditemukan' });

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
            const start = parseInt(startStr, 10);
            const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': end - start + 1,
                'Content-Type': 'video/mp4'
            });
            fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (e) {
        res.status(500).json({ error: 'Stream gagal' });
    }
});

// Ambil Metadata Video dengan Cookies Firefox
app.get('/api/info', (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL diperlukan' });

    exec(`yt-dlp --cookies-from-browser firefox -J "${url}"`, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout) => {
        if (error) return res.status(500).json({ error: 'Gagal memuat info' });
        try {
            const info = JSON.parse(stdout);

            // Build format list with filesize info
            let videoFormats = info.formats.filter(f => f.vcodec !== 'none' && f.height);
            const uniqueFormats = [];
            const seen = new Set();
            videoFormats.sort((a, b) => b.height - a.height).forEach(f => {
                if (!seen.has(f.height)) {
                    seen.add(f.height);
                    // Estimate total size: video + best audio (~128kbps)
                    const videobytes = f.filesize || f.filesize_approx || 0;
                    const audiobytes = 1024 * 1024 * 5; // rough 5MB estimate for audio
                    const totalBytes = videobytes + audiobytes;
                    uniqueFormats.push({
                        format_id: f.format_id,
                        quality: `${f.height}p`,
                        filesize: totalBytes > 0 ? formatBytes(totalBytes) : null
                    });
                }
            });

            res.json({
                title: info.title,
                formats: uniqueFormats,
                thumbnail: info.thumbnail
            });
        } catch (e) { res.status(500).json({ error: 'Parsing metadata gagal' }); }
    });
});

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return null;
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Event Stream untuk Progress Download
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const interval = setInterval(() => {
        res.write(`data: ${JSON.stringify(currentProgress)}\n\n`);
    }, 500);
    req.on('close', () => clearInterval(interval));
});

// Proses Download via yt-dlp — Pisah video dan audio lalu merge
app.post('/api/download', (req, res) => {
    const { url, format_id, title, quality, thumbnail } = req.body;
    const safeName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${safeName}.mp4`;
    const outputPath = path.join(downloadFolder, fileName);

    // Initialize progress state
    currentProgress[url] = {
        title,
        quality,
        thumbnail,
        fileName,
        videoPercent: 0,
        audioPercent: 0,
        mergePercent: 0,
        phase: 'video',   // 'video' | 'audio' | 'merging' | 'done'
        speed: null,
        eta: null,
        filesize: null
    };

    // yt-dlp with --newline for per-line progress output
    const args = [
        '--cookies-from-browser', 'firefox',
        '-f', `${format_id}+bestaudio/best`,
        '--merge-output-format', 'mp4',
        '-o', outputPath,
        '--newline',
        '--progress-template', '%(progress.status)s %(progress._percent_str)s %(progress._speed_str)s %(progress._eta_str)s %(progress.total_bytes_str)s',
        url
    ];

    const ytProcess = spawn('yt-dlp', args);
    activeProcesses[url] = ytProcess;

    let isAudioPhase = false;

    ytProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            // Detect phase changes from yt-dlp output
            if (line.includes('[download] Destination:')) {
                // Second destination = audio track
                if (isAudioPhase === false && currentProgress[url] && currentProgress[url].videoPercent >= 99) {
                    isAudioPhase = true;
                    currentProgress[url].phase = 'audio';
                } else if (!isAudioPhase) {
                    currentProgress[url].phase = 'video';
                }
            }

            if (line.includes('Merging formats')) {
                currentProgress[url].phase = 'merging';
                currentProgress[url].mergePercent = 50;
                isAudioPhase = false;
            }

            // Parse progress line: status percent speed eta totalsize
            const pMatch = line.match(/(\d+\.?\d*)%/);
            const speedMatch = line.match(/([\d.]+\s*[KMG]iB\/s)/i);
            const etaMatch = line.match(/ETA\s+([\d:]+)/i) || line.match(/(\d{2}:\d{2})/);
            const sizeMatch = line.match(/([\d.]+\s*[KMG]iB)\s*$/) || line.match(/([\d.]+\s*[KMG]B)\s*$/);

            if (pMatch && currentProgress[url]) {
                const pct = parseFloat(pMatch[1]);
                const phase = currentProgress[url].phase;

                if (phase === 'video') currentProgress[url].videoPercent = pct;
                else if (phase === 'audio') currentProgress[url].audioPercent = pct;
            }

            if (speedMatch && currentProgress[url]) {
                currentProgress[url].speed = speedMatch[1];
            }
            if (etaMatch && currentProgress[url]) {
                currentProgress[url].eta = etaMatch[1];
            }
            if (sizeMatch && currentProgress[url] && !currentProgress[url].filesize) {
                currentProgress[url].filesize = sizeMatch[1];
            }
        });
    });

    ytProcess.stderr.on('data', (data) => {
        const line = data.toString();
        if (line.includes('Merging') && currentProgress[url]) {
            currentProgress[url].phase = 'merging';
        }
    });

    ytProcess.on('close', (code) => {
        delete activeProcesses[url];
        if (currentProgress[url]) {
            currentProgress[url].phase = 'done';
            currentProgress[url].videoPercent = 100;
            currentProgress[url].audioPercent = 100;
            currentProgress[url].mergePercent = 100;

            // Get actual file size
            if (fs.existsSync(outputPath)) {
                const stat = fs.statSync(outputPath);
                const actualSize = formatBytes(stat.size);
                currentProgress[url].filesize = actualSize;

                downloadHistory.push({
                    title,
                    quality,
                    thumbnail,
                    fileName,
                    filesize: actualSize,
                    date: new Date().toISOString()
                });
            } else {
                downloadHistory.push({ title, quality, thumbnail, fileName, filesize: null, date: new Date().toISOString() });
            }

            setTimeout(() => delete currentProgress[url], 10000);
        }
    });

    res.json({ success: true });
});

// Cancel download
app.post('/api/cancel', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL diperlukan' });

    const proc = activeProcesses[url];
    if (!proc) return res.status(404).json({ error: 'Proses tidak ditemukan' });

    // Kill the process tree
    try {
        process.kill(-proc.pid, 'SIGKILL');
    } catch (e) {
        try { proc.kill('SIGKILL'); } catch (_) {}
    }

    delete activeProcesses[url];

    // Mark as cancelled and clean up temp files
    if (currentProgress[url]) {
        const { fileName } = currentProgress[url];
        currentProgress[url].phase = 'cancelled';
        setTimeout(() => delete currentProgress[url], 5000);

        // Remove partial files left by yt-dlp
        const baseName = fileName.replace(/\.mp4$/, '');
        ['.mp4', '.webm', '.m4a', '.part', '.ytdl', '.temp'].forEach(ext => {
            const p = path.join(downloadFolder, baseName + ext);
            if (fs.existsSync(p)) fs.unlink(p, () => {});
        });
        // Also remove any .part files
        try {
            fs.readdirSync(downloadFolder).forEach(f => {
                if (f.startsWith(baseName) && (f.endsWith('.part') || f.endsWith('.ytdl'))) {
                    fs.unlink(path.join(downloadFolder, f), () => {});
                }
            });
        } catch (_) {}
    }

    res.json({ success: true });
});

// Hapus Riwayat & File Fisik
app.delete('/api/history', (req, res) => {
    const { fileName } = req.body;
    const filePath = path.join(downloadFolder, fileName);
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => { if (err) console.error("Gagal hapus file:", err); });
    }
    downloadHistory = downloadHistory.filter(item => item.fileName !== fileName);
    res.json({ success: true });
});

app.get('/api/history', (req, res) => res.json(downloadHistory));

// Add a scanned file manually to history/library
app.post('/api/history/add', (req, res) => {
    const { title, quality, thumbnail, fileName, filesize, folderPath } = req.body;
    // Don't add duplicates
    const exists = downloadHistory.some(h => h.fileName === fileName && h.folderPath === folderPath);
    if (!exists) {
        downloadHistory.push({
            title: title || fileName,
            quality: quality || 'LOCAL',
            thumbnail: thumbnail || '',
            fileName,
            filesize: filesize || null,
            folderPath: folderPath || config.downloadFolder,
            date: new Date().toISOString()
        });
    }
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Backend aktif di port ${PORT}`));