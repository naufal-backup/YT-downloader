# YT Downloader

YouTube video downloader berbasis **yt-dlp** dengan antarmuka browser via Tampermonkey. Terdiri dari backend Node.js (`server.js`) dan userscript (`YT_Downloader_user.js`).

---

## Requirements

| Komponen | Versi Minimum | Keterangan |
|---|---|---|
| Node.js | v18+ | JavaScript runtime untuk backend |
| npm | v8+ | Sudah termasuk bersama Node.js |
| yt-dlp | 2025+ | Downloader utama |
| ffmpeg | Terbaru | Wajib untuk merge video + audio |
| Firefox | Terbaru | Browser untuk Tampermonkey |
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
ffmpeg -version
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

Atau install via binary langsung (jika pip tidak tersedia):
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
     -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

Verifikasi:
```bash
yt-dlp --version
which yt-dlp    # catat path ini
```

---

### 4. Konfigurasi yt-dlp (penting untuk Ubuntu)

Node.js terkadang tidak bisa menemukan `yt-dlp` karena PATH environment yang berbeda. Tambahkan konfigurasi berikut:

```bash
mkdir -p ~/.config/yt-dlp
echo '--js-runtimes node:/usr/local/bin/node' >> ~/.config/yt-dlp/config
```

> **Catatan:** Sesuaikan path Node.js dengan output `which node` di sistem Anda.

---

### 5. Backend (server.js)

```bash
# Clone atau pindahkan file ke folder project
mkdir -p ~/YT-downloader/yt-downloader-backend
cd ~/YT-downloader/yt-downloader-backend

# Install dependencies Node.js
npm install express cors

# Jalankan server
node server.js
```

Jika berhasil, output akan tampil:
```
✅ YT-Downloader backend aktif di http://localhost:8989
📁 Download folder : /home/<user>/Downloads/YT-Downloads
```

---

### 6. Tampermonkey Userscript

1. Install ekstensi **Tampermonkey** di Firefox dari [addons.mozilla.org](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
2. Buka dashboard Tampermonkey → klik **"+"** untuk tambah script baru
3. Hapus isi default, paste seluruh isi file `YT_Downloader_user.js`
4. Tekan **Ctrl+S** untuk simpan
5. Buka YouTube — tombol download akan muncul otomatis

---

## Menjalankan

Setiap kali ingin menggunakan, jalankan backend terlebih dahulu:

```bash
cd ~/YT-downloader/yt-downloader-backend
node server.js
```

Lalu buka YouTube di Firefox seperti biasa.

---

## Troubleshooting

**Error: `yt-dlp` tidak ditemukan saat server jalan**

Jika yt-dlp terinstall via pip di `~/.local/bin`, set environment variable sebelum menjalankan server:
```bash
YTDLP_PATH=$(which yt-dlp) node server.js
```

**Error: `ffmpeg not found`**
```bash
sudo apt install ffmpeg -y   # Ubuntu
sudo pacman -S ffmpeg        # Arch
```

**Error: `n challenge solving failed`**

Pastikan konfigurasi yt-dlp sudah dibuat (lihat langkah 4) dan Node.js terdeteksi:
```bash
yt-dlp --verbose --list-formats "https://youtube.com/watch?v=dQw4w9WgXcQ" 2>&1 | grep -i node
```

Harus ada output: `node (available)`

**Port 8989 sudah dipakai**

```bash
lsof -i :8989
kill -9 <PID>
```

---

## Struktur File

```
yt-downloader-backend/
├── server.js              # Backend API
├── ytdl-config.json       # Konfigurasi (auto-generated)
├── ytdl-library.json      # Library video (auto-generated)
└── YT_Downloader_user.js  # Tampermonkey userscript
```

---

## Catatan Penting

- Backend harus berjalan di background setiap kali ingin download
- Video yang didownload tersimpan di `~/Downloads/YT-Downloads` (default, bisa diubah dari UI)
- Untuk video yang membutuhkan login (private/age-restricted), fitur cookies perlu dikonfigurasi ulang secara manual
