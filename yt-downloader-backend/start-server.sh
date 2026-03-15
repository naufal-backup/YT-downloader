#!/bin/bash

# Memastikan script dijalankan dengan akses root
if [ "$EUID" -ne 0 ]; then
  echo "Akses ditolak. Harap jalankan script ini menggunakan sudo."
  exit 1
fi

SERVICE_NAME="yt-downloader.service"
SERVICE_PATH="/etc/systemd/system/$SERVICE_NAME"

# Konfigurasi pengguna dan path
SERVICE_USER="tb"
WORK_DIR="/home/tb/YT-downloader/yt-downloader-backend"
EXEC_CMD="/usr/bin/node server.js"

echo "Membuat file konfigurasi systemd di $SERVICE_PATH..."

cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=YouTube Downloader Backend Service
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$WORK_DIR
ExecStart=$EXEC_CMD
Restart=on-failure
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=ytdl-backend

[Install]
WantedBy=multi-user.target
EOF

echo "Memuat ulang daemon systemd..."
systemctl daemon-reload

echo "Mengaktifkan service agar berjalan saat booting..."
systemctl enable "$SERVICE_NAME"

echo "Memulai service..."
systemctl start "$SERVICE_NAME"

echo "Instalasi selesai. Memeriksa status service..."
systemctl status "$SERVICE_NAME" --no-pager
