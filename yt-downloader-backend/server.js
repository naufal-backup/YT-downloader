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
const downloadFolder = path.join(os.homedir(), 'Downloads', 'YT-Downloads');

if (!fs.existsSync(downloadFolder)) {
    fs.mkdirSync(downloadFolder, { recursive: true });
}

// Media Server untuk streaming & akses file lokal
app.use('/files', express.static(downloadFolder));

let downloadHistory = [];
let currentProgress = {};

// Ambil Metadata Video dengan Cookies Firefox
app.get('/api/info', (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL diperlukan' });

    exec(`yt-dlp --cookies-from-browser firefox -J "${url}"`, { maxBuffer: 1024 * 1024 * 20 }, (error, stdout) => {
        if (error) return res.status(500).json({ error: 'Gagal memuat info' });
        try {
            const info = JSON.parse(stdout);
            let videoFormats = info.formats.filter(f => f.vcodec !== 'none' && f.height);
            const uniqueFormats = [];
            const seen = new Set();
            videoFormats.forEach(f => {
                if (!seen.has(f.height)) {
                    seen.add(f.height);
                    uniqueFormats.push({ format_id: f.format_id, quality: `${f.height}p` });
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

// Proses Download via yt-dlp
app.post('/api/download', (req, res) => {
    const { url, format_id, title, quality, thumbnail } = req.body;
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`;
    const outputPath = path.join(downloadFolder, fileName);
    
    const ytProcess = spawn('yt-dlp', [
        '--cookies-from-browser', 'firefox',
        '-f', `${format_id}+bestaudio/best`,
        '--merge-output-format', 'mp4',
        '-o', outputPath,
        '--newline',
        url
    ]);

    currentProgress[url] = { percent: "0%", status: "Starting..." };

    ytProcess.stdout.on('data', (data) => {
        const match = data.toString().match(/(\d+\.\d+)%/);
        if (match) currentProgress[url] = { percent: match[1] + "%", status: "Downloading" };
        if (data.toString().includes('Merging')) currentProgress[url].status = "Merging...";
    });

    ytProcess.on('close', () => {
        currentProgress[url] = { percent: "100%", status: "Finished" };
        downloadHistory.push({ title, quality, thumbnail, fileName, date: new Date().toISOString() });
        setTimeout(() => delete currentProgress[url], 10000);
    });

    res.json({ success: true });
});

// Hapus Riwayat & File Fisik
app.delete('/api/history', (req, res) => {
    const { fileName } = req.body;
    const filePath = path.join(downloadFolder, fileName);

    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) console.error("Gagal hapus file:", err);
        });
    }

    downloadHistory = downloadHistory.filter(item => item.fileName !== fileName);
    res.json({ success: true });
});

app.get('/api/history', (req, res) => res.json(downloadHistory));

app.listen(PORT, () => console.log(`Backend aktif di port ${PORT}`));
