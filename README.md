# YT Downloader

YouTube video downloader berbasis **yt-dlp** dengan antarmuka browser via Tampermonkey.
Terdiri dari backend Node.js (`server.js`) dan userscript (`YT_Downloader_user.js`).

---

## Requirements

| Komponen | Versi Minimum | Keterangan |
|---|---|---|
| Node.js | v18+ | Runtime backend |
| npm | v8+ | Sudah termasuk bersama Node.js |
| yt-dlp | 2025+ | Downloader utama |
| ffmpeg | Terbaru | Wajib untuk merge video + audio |
| Firefox / Chrome / Brave | Terbaru | Browser dengan Tampermonkey |
| Tampermonkey | Terbaru | Ekstensi untuk userscript |

---

## Instalasi

### 1. Node.js

**Ubuntu / Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # pastikan v18+
```

**Arch Linux:**
```bash
sudo pacman -S nodejs npm
```

---

### 2. ffmpeg

**Ubuntu / Debian:**
```bash
sudo apt install ffmpeg -y
```

**Arch Linux:**
```bash
sudo pacman -S ffmpeg
```

---

### 3. yt-dlp

```bash
pip install yt-dlp --break-system-packages
```

> yt-dlp akan terinstall di `~/.local/bin/yt-dlp`. Server akan menemukannya secara otomatis.

Verifikasi:
```bash
yt-dlp --version
```

Jika `yt-dlp: command not found`, tambahkan ke PATH:

**Bash/Zsh:**
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

**Fish:**
```bash
fish_add_path ~/.local/bin
```

---

### 4. Backend

```bash
mkdir -p ~/YT-downloader/yt-downloader-backend
cd ~/YT-downloader/yt-downloader-backend

# Install dependencies
npm install express cors

# Jalankan server
node server.js
```

Output saat berhasil:
```
🔧 yt-dlp  : /home/<user>/.local/bin/yt-dlp
✅ YT-Downloader backend aktif di http://localhost:8989
📁 Download folder : /home/<user>/Downloads/YT-Downloads
```

> **Port selalu 8989.** Tidak perlu dikonfigurasi.

---

### 5. Jalankan Otomatis saat Boot (systemd)

```bash
mkdir -p ~/.config/systemd/user
nano ~/.config/systemd/user/yt-downloader.service
```

Isi file:
```ini
[Unit]
Description=YT Downloader Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/YT-downloader/yt-downloader-backend
ExecStart=/usr/local/bin/node %h/YT-downloader/yt-downloader-backend/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

> `%h` adalah shortcut systemd untuk home directory — tidak perlu hardcode username.

Aktifkan:
```bash
systemctl --user enable yt-downloader.service
systemctl --user start yt-downloader.service
loginctl enable-linger $USER
```

Perintah berguna:
```bash
systemctl --user status yt-downloader.service
systemctl --user restart yt-downloader.service
journalctl --user -u yt-downloader.service -f
```

---

### 6. Tampermonkey Userscript

1. Install ekstensi **Tampermonkey** di browser
2. Buka dashboard Tampermonkey → klik **"+"**
3. Hapus isi default, paste seluruh isi `YT_Downloader_user.js`
4. **Ctrl+S** untuk simpan
5. Buka YouTube — tombol download muncul otomatis

---

## Konfigurasi Opsional

### yt-dlp path kustom (jika auto-detect gagal)

```bash
YTDLP_PATH=/path/kustom/yt-dlp node server.js
```

Atau di file `.service`:
```ini
[Service]
Environment=YTDLP_PATH=/path/kustom/yt-dlp
```

### Akses dari perangkat lain di jaringan lokal

1. Cari IP lokal komputer server:
   ```bash
   ip addr | grep "inet " | grep -v 127
   # contoh output: 192.168.1.10
   ```

2. Di browser perangkat lain, buka konsol JavaScript (F12) lalu jalankan:
   ```javascript
   localStorage.setItem('ytdl_host', 'http://192.168.1.10:8989')
   ```

3. Reload halaman YouTube.

> Port tetap **8989**.

---

## Struktur File

```
yt-downloader-backend/
├── server.js              # Backend API
├── ytdl-config.json       # Konfigurasi folder (auto-generated)
├── ytdl-library.json      # Library video (auto-generated)
├── YT_Downloader_user.js  # Tampermonkey userscript
└── README.md              # Dokumentasi ini
```

---

## Troubleshooting

**yt-dlp tidak ditemukan saat server start**
```bash
which yt-dlp
pip install yt-dlp --break-system-packages
fish_add_path ~/.local/bin   # Fish shell
```

**ffmpeg not found**
```bash
sudo apt install ffmpeg -y   # Ubuntu/Debian
sudo pacman -S ffmpeg        # Arch Linux
```

**Port 8989 sudah dipakai**
```bash
lsof -i :8989
kill -9 <PID>
```

**Koneksi terputus di userscript**
- Pastikan `node server.js` sudah berjalan
- Cek log: `journalctl --user -u yt-downloader.service -f`
