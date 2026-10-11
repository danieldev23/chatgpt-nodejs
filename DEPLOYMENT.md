# 🚀 Hướng Dẫn Triển Khai chatgpt-nodejs (Local & VPS)

Tài liệu hướng dẫn chi tiết cách cài đặt, cấu hình và vận hành server reverse proxy **chatgpt-nodejs** trên máy cục bộ (Local) hoặc máy chủ ảo (VPS Linux/Ubuntu). Hỗ trợ cả 3 phương thức: **Chạy trực tiếp (Dev/Local)**, **Docker Compose (Khuyên dùng)** và **PM2 Cluster Production**.

---

## 📑 Mục Lục
1. [Yêu Cầu Hệ Thống (Prerequisites)](#1-yêu-cầu-hệ-thống-prerequisites)
2. [Cấu Hình Biến Môi Trường (.env)](#2-cấu-hình-biến-môi-trường-env)
3. [Triển Khai Cục Bộ (Local Machine)](#3-triển-khai-cục-bộ-local-machine)
4. [Triển Khai VPS - Cách 1: Docker Compose (Khuyên dùng)](#4-triển-khai-vps---cách-1-docker-compose-khuyên-dùng)
5. [Triển Khai VPS - Cách 2: Bare-Metal với PM2 Cluster](#5-triển-khai-vps---cách-2-bare-metal-với-pm2-cluster)
6. [Cấu Hình Nginx Reverse Proxy & SSL (Bắt buộc cho SSE Streaming)](#6-cấu-hình-nginx-reverse-proxy--ssl)
7. [Quản Lý Token & Account Pool](#7-quản-lý-token--account-pool)
8. [Troubleshooting & Fix Lỗi Thường Gặp (403, 401, Timeout)](#8-troubleshooting--fix-lỗi-thường-gặp)

---

## 1. Yêu Cầu Hệ Thống (Prerequisites)

- **Hệ điều hành**: Linux (Ubuntu 20.04/22.04/24.04 khuyên dùng cho VPS), macOS, hoặc Windows (WSL2).
- **Node.js**: Phiên bản **>= 20.x** hoặc **Node.js 22 LTS**.
- **RAM**: Tối thiểu 1GB (Khuyến nghị 2GB+ nếu build obfuscation và chạy cluster).
- **Lưu ý mạng/IP (Cực kỳ quan trọng)**:
  - Dải IP Datacenter của nhiều nhà cung cấp VPS (DigitalOcean, Vultr, Hetzner, AWS, Linode) thường bị Cloudflare của ChatGPT chặn với mã lỗi **`403 Forbidden`** hoặc ép giải Captcha.
  - Nếu gặp tình trạng này trên VPS, bắt buộc cấu hình **`PROXY_URL`** (Residential Proxy hoặc Socks5) hoặc cài đặt **Cloudflare WARP** (`warp-cli`) trên VPS.

---

## 2. Cấu Hình Biến Môi Trường (.env)

Tạo file `.env` từ file mẫu:
```bash
cp .env.example .env
```

Nội dung cấu hình chi tiết:
```ini
# Port server lắng nghe
PORT=3040

# Master API Key dùng để gọi API completions (/v1/chat/completions) và API quản lý accounts (/api/accounts)
CHATGPT2API_AUTH_KEY=your_super_secret_master_key_here

# Backend lưu trữ dữ liệu tài khoản ("json" hoặc "memory")
STORAGE_BACKEND=json

# Mức độ log: "debug" | "info" | "warn" | "error"
LOG_LEVEL=info

# (Tùy chọn) Proxy trung gian nếu IP VPS bị Cloudflare chặn (HTTP/HTTPS/SOCKS5)
# PROXY_URL=http://user:password@proxy.example.com:8080
# PROXY_URL=socks5://127.0.0.1:40000
```

---

## 3. Triển Khai Cục Bộ (Local Machine)

### Bước 1: Cài đặt Dependencies
```bash
cd /path/to/chatgpt-nodejs
npm install
```

### Bước 2: Khởi chạy chế độ Development
Chế độ này sử dụng `tsx watch`, tự động reload khi sửa code:
```bash
npm run dev
```
Server sẽ chạy tại: `http://localhost:3040`

### Bước 3: Build & Chạy Production tại Local
```bash
# 1. Biên dịch TypeScript & Obfuscate code lõi sang thư mục /production
npm run build

# 2. Chạy bản build production
npm run start:prod
# Hoặc chạy bản dist gốc:
npm start
```

---

## 4. Triển Khai VPS - Cách 1: Docker Compose (Khuyên dùng)

Phương pháp này cô lập môi trường, tự khởi động lại khi máy chủ reboot và không cần cài Node.js trên máy chủ chủ.

### Bước 1: Cài đặt Docker & Docker Compose trên VPS
```bash
# Chạy script cài đặt tự động của Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Kiểm tra phiên bản
docker --version
docker compose version
```

### Bước 2: Đưa mã nguồn lên VPS
Bạn có thể `git clone` hoặc rsync/scp thư mục dự án lên VPS:
```bash
cd /opt
git clone https://github.com/danieldev23/chatgpt-nodejs.git
cd chatgpt-nodejs
```

### Bước 3: Cấu hình .env
```bash
cp .env.example .env
nano .env # Thay đổi CHATGPT2API_AUTH_KEY và cấu hình PROXY_URL nếu cần
```

### Bước 4: Khởi chạy Container
```bash
# Build image và khởi chạy ngầm (-d)
docker compose up -d --build

# Xem log thời gian thực
docker compose logs -f

# Dừng server
docker compose down

# Khởi động lại
docker compose restart
```

Thư mục `./data` được mount trực tiếp ra máy chủ chủ (volume mapping), đảm bảo toàn bộ token và accounts trong `accounts.json` không bị mất khi container được rebuild.

---

## 5. Triển Khai VPS - Cách 2: Bare-Metal với PM2 Cluster

Dành cho người muốn hiệu năng tối đa, tận dụng toàn bộ số nhân CPU với cluster mode và mã nguồn đã được obfuscate bảo vệ.

### Bước 1: Cài đặt Node.js 22 & PM2 trên VPS
```bash
# Cài đặt NodeSource repository cho Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cài đặt PM2 toàn cục
sudo npm install -g pm2
```

### Bước 2: Build Production Release
```bash
cd /opt/chatgpt-nodejs
npm install
npm run build
```
Quá trình build sẽ:
1. Compile TypeScript với `tsc`.
2. Obfuscate toàn bộ logic nhạy cảm (`services/`, `utils/`, `protocol/`).
3. Đóng gói đầy đủ vào thư mục `./production`.

### Bước 3: Cài đặt Dependencies cho bản Production
```bash
cd /opt/chatgpt-nodejs/production
npm install --omit=dev
cp ../.env .env
```

### Bước 4: Khởi chạy với PM2 Cluster
File cấu hình `ecosystem.config.cjs` đã được thiết lập sẵn chế độ `cluster` với `instances: "max"`:
```bash
# Khởi chạy ứng dụng
pm2 start ecosystem.config.cjs

# Xem danh sách tiến trình & tài nguyên sử dụng
pm2 status

# Xem log realtime
pm2 logs chatgpt-nodejs

# Thiết lập PM2 tự khởi động cùng hệ thống khi reboot VPS
pm2 startup
pm2 save
```

---

## 6. Cấu Hình Nginx Reverse Proxy & SSL

> ⚠️ **LƯU Ý QUAN TRỌNG VỀ SSE STREAMING**:
> ChatGPT API trả về phản hồi dạng Server-Sent Events (SSE) theo từng token. Nginx mặc định sẽ buffer dữ liệu này dẫn đến hiện tượng phản hồi bị đơ và chỉ trả về 1 cục khi hoàn thành. Cấu hình bên dưới đã bật `proxy_buffering off;` để fix triệt để vấn đề này.

### Bước 1: Cài đặt Nginx & Certbot
```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Bước 2: Tạo cấu hình Virtual Host Nginx
```bash
sudo nano /etc/nginx/sites-available/chatgpt-api.conf
```

Dán nội dung cấu hình sau (thay `api.yourdomain.com` bằng domain thật của bạn):
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3040;
        proxy_http_version 1.1;

        # Headers chuẩn
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # TẮT BUFFERING CHO SSE STREAMING (BẮT BUỘC)
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;

        # Tăng timeout cho các prompt dài
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Kích hoạt site và reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/chatgpt-api.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Bước 3: Cấp chứng chỉ SSL HTTPS miễn phí với Certbot
```bash
sudo certbot --nginx -d api.yourdomain.com
```

---

## 7. Quản Lý Token & Account Pool

Server quản lý xoay vòng tài khoản (round-robin) qua REST API mà không cần khởi động lại server.

### 7.1 Lấy Access Token từ ChatGPT Web
1. Đăng nhập vào [https://chatgpt.com](https://chatgpt.com).
2. Mở URL: [https://chatgpt.com/api/auth/session](https://chatgpt.com/api/auth/session).
3. Copy chuỗi `accessToken` (dạng `eyJhbGciOi...`).

### 7.2 Thêm Access Token vào Pool qua API
```bash
curl -X POST "http://localhost:3040/api/accounts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_super_secret_master_key_here" \
  -d '{
    "tokens": [
      "eyJhbGciOiJKV1QiLC..."
    ]
  }'
```

Hoặc dùng script có sẵn:
```bash
./scripts/api_add_token.sh "eyJhbGciOiJKV1QiLC..."
```

### 7.3 Kiểm tra danh sách Accounts
```bash
curl -X GET "http://localhost:3040/api/accounts" \
  -H "Authorization: Bearer your_super_secret_master_key_here"
```

### 7.4 Test gọi Chat Completion (OpenAI Client format)
```bash
curl -X POST "http://localhost:3040/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_super_secret_master_key_here" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "user", "content": "Hello! Are you working properly?" }
    ]
  }'
```

---

## 8. Troubleshooting & Fix Lỗi Thường Gặp

### Lỗi 1: `status=403, body=""` trên `/backend-anon/conversation` hoặc `/backend-api/conversation`
- **Nguyên nhân**:
  1. **Chưa có Account nào trong pool**: Server không tìm thấy access token nào hợp lệ trong `data/accounts.json`, nên nó tự động fallback về chế độ anonymous (`/backend-anon/`). Nhưng Cloudflare chặn toàn bộ request anonymous từ IP Datacenter của VPS.
  2. **IP VPS bị Cloudflare đưa vào Blacklist**: OpenAI áp dụng Cloudflare WAF chặn IP Datacenter gọi trực tiếp đến `chatgpt.com`.
- **Cách xử lý**:
  - **Bước 1**: Nạp ít nhất 1 Access Token hợp lệ vào pool (xem [Mục 7](#7-quản-lý-token--account-pool)).
  - **Bước 2**: Cấu hình `PROXY_URL` trong file `.env` trỏ qua 1 Residential Proxy hoặc Socks5 uy tín:
    ```ini
    PROXY_URL=socks5://username:password@proxy-ip:port
    ```
  - **Bước 3 (Miễn phí trên VPS)**: Cài đặt **Cloudflare WARP** để định tuyến outbound traffic qua IP sạch của Cloudflare:
    ```bash
    curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | sudo gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflare-client.list
    sudo apt-get update && sudo apt-get install -y cloudflare-warp
    warp-cli registration new
    warp-cli mode proxy
    warp-cli proxy port 40000
    warp-cli connect
    ```
    Sau đó trong `.env` đặt:
    ```ini
    PROXY_URL=socks5://127.0.0.1:40000
    ```

### Lỗi 2: `status=401 Token invalidated`
- **Nguyên nhân**: Access token của tài khoản ChatGPT đã hết hạn (thường hạn 10-14 ngày).
- **Cách xử lý**:
  - Gọi endpoint refresh token nếu tài khoản được import kèm `refresh_token` qua OAuth:
    ```bash
    curl -X POST "http://localhost:3040/api/accounts/refresh" \
      -H "Authorization: Bearer your_super_secret_master_key_here" \
      -H "Content-Type: application/json" \
      -d '{"access_tokens": []}'
    ```
  - Hoặc lấy accessToken mới từ `chatgpt.com/api/auth/session` và update lại vào pool.

### Lỗi 3: Streaming SSE bị giật hoặc đơ không hiển thị token từng chữ
- **Nguyên nhân**: Nginx hoặc Cloudflare Proxy bật cache/buffering.
- **Cách xử lý**:
  - Đảm bảo trong config Nginx có dòng `proxy_buffering off;` và `chunked_transfer_encoding on;`.
  - Nếu domain trỏ qua Cloudflare Dashboard, vào **Rules** -> **Page Rules** -> tắt `Response Buffering` và `Browser Cache`.

---

## 💖 Support & Donate

Nếu dự án này giúp ích cho bạn trong công việc hoặc hệ thống, bạn có thể ủng hộ tác giả qua mã QR dưới đây:

<div align="center">
  <img src="assets/donate.jpg" alt="Donate QR Code - Đặng Quốc Huy" width="300" style="border-radius: 12px;" />
  <br/>
  <p><b>Chủ tài khoản:</b> ĐẶNG QUỐC HUY<br/>
  <b>Hỗ trợ:</b> MoMo | VietQR | Napas 247</p>
</div>

