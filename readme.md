# 🚀 chatgpt-nodejs (Server Reverse Proxy Chuẩn OpenAI & Anthropic API)

Một server **Reverse Proxy từ ChatGPT Web sang chuẩn REST API của OpenAI & Anthropic**, được xây dựng hiện đại bằng **Node.js 22 LTS, TypeScript & Fastify**.

Giải pháp thay thế trực tiếp cho `chatgpt2api` (bản Python) với mức chiếm dụng RAM cực thấp, loại bỏ hoàn toàn hiện tượng nghẽn luồng (GIL), hỗ trợ native async Server-Sent Events (SSE) streaming tốc độ cao và tích hợp động cơ giải Proof-of-Work (PoW) `sha3-512` bằng C++ native OpenSSL chỉ trong ~2ms.

---

## ⚡ Tính Năng Nổi Bật

- **Chuẩn REST API OpenAI Tương Thích 100%**:
  - `POST /v1/chat/completions`: Đầy đủ chế độ phản hồi tức thì và Streaming SSE (`stream: true`) theo từng token.
  - `GET /v1/models`: Danh mục model chuẩn hóa tương thích hệ sinh thái OpenAI (`gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`, `chatgpt-4o-latest`...).
  - `POST /v1/responses`: Tương thích định dạng OpenAI Realtime / Responses.
  - `POST /v1/search`: Cầu nối truy vấn tìm kiếm trực tiếp trên ChatGPT.
- **Chuẩn API Anthropic Claude**:
  - `POST /v1/messages`: Tương thích toàn diện với các client và SDK của Claude (`claude-3-5-sonnet`, `claude-3-5-haiku`...).
- **Động Cơ Kỹ Thuật Đảo Ngược & Vượt Rào Sentinel**:
  - **OpenAI Web Sentinel Handshake**: Tự động đàm phán yêu cầu bảo mật qua 2 bước `/prepare` và `/finalize`.
  - **Siêu Thuật Toán PoW (Proof-of-Work)**: Giải toán mã hóa `sha3-512` native bằng `node:crypto` với tốc độ cực nhanh (~2ms).
  - **Turnstile Bytecode VM**: Máy ảo nhúng hỗ trợ giải mã challenge Cloudflare Turnstile token.
  - **Giả Lập Vân Tay Trình Duyệt**: Tự động giả lập đầy đủ headers chuẩn (`sec-ch-ua`, `oai-device-id`, `oai-session-id`, `user-agent`).
  - **JSON Patch Diff Engine**: Xử lý và giải mã các luồng incremental delta patch theo chuẩn RFC 6902.
- **Hệ Thống Quản Lý Account Pool Thông Minh**:
  - Tự động xoay vòng Token (Round-robin) cân bằng tải kèm kiểm tra sức khỏe tài khoản.
  - Hỗ trợ nạp / xóa tài khoản "nóng" qua REST API mà không cần khởi động lại server.
  - Tự động làm mới Token khi gặp mã lỗi 401 qua endpoint OAuth PKCE (`auth.openai.com/oauth/token`).
  - Lưu trữ dữ liệu bền vững bằng file JSON (`data/accounts.json`), hỗ trợ ánh xạ volume.
- **Tối Ưu Triển Khai Production**:
  - Tích hợp pipeline tự động Obfuscate mã hóa toàn bộ logic nghiệp vụ cốt lõi nhằm bảo vệ mã nguồn.
  - Hỗ trợ sẵn Docker Compose, PM2 Cluster (đa nhân CPU) và cấu hình Nginx chuẩn SSE.

---

## 🛠 1. Khởi Động Nhanh (Quickstart)

> 📖 **Xem hướng dẫn chi tiết triển khai Local, VPS (Docker & PM2 Cluster) và cấu hình Nginx SSL tại**: [DEPLOYMENT.md](file:///Users/dangquochuy/Documents/Projects/ChatGPT-Nodejs/DEPLOYMENT.md)

### Cách A: Chạy trực tiếp trên máy với Node.js

```bash
# 1. Cài đặt thư viện phụ thuộc
npm install

# 2. Tạo file cấu hình môi trường
cp .env.example .env

# 3. Biên dịch & Chạy Production
npm run build
npm start

# Hoặc chạy chế độ phát triển (tự động reload khi sửa code):
npm run dev
```

> Mặc định server sẽ lắng nghe tại: `http://localhost:3040`.

---

### Cách B: Chạy nhanh với Docker Compose

```bash
docker compose up -d --build
```

---

## 🔑 2. API Quản Lý Tài Khoản & Token Pool

Mọi request đến route quản trị đều yêu cầu header:
`Authorization: Bearer <CHATGPT2API_AUTH_KEY>`

### 2.1 Thêm Token / Tài Khoản (`POST /api/accounts`)

```bash
curl -X POST "http://localhost:3040/api/accounts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me" \
  -d '{
    "tokens": [
      "eyJhbGciOiJKV1QiLC..."
    ]
  }'
```

Hoặc dùng script bash tiện ích:
```bash
./scripts/api_add_token.sh "eyJhbGciOi..." "refresh_token_tuy_chon"
```

### 2.2 Xem Danh Sách Tài Khoản (`GET /api/accounts`)

```bash
curl -X GET "http://localhost:3040/api/accounts" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me"
```

### 2.3 Tự Động Làm Mới Token (`POST /api/accounts/refresh`)

```bash
# Làm mới tất cả tài khoản có refresh token trong pool
curl -X POST "http://localhost:3040/api/accounts/refresh" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me" \
  -d '{"access_tokens": []}'
```

### 2.4 Xóa Tài Khoản Khỏi Pool (`DELETE /api/accounts`)

```bash
curl -X DELETE "http://localhost:3040/api/accounts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me" \
  -d '{
    "tokens": [
      "eyJhbGciOiJKV1QiLC..."
    ]
  }'
```

---

## 🤖 3. Gọi OpenAI Chat Completions

### Chế độ Non-streaming:

```bash
curl -X POST "http://localhost:3040/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "user", "content": "Xin chào! Bạn là ai?" }
    ]
  }'
```

### Chế độ Streaming (SSE từng token):

```bash
curl -N -X POST "http://localhost:3040/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me" \
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Kể cho tôi nghe một câu chuyện cười ngắn." }
    ]
  }'
```

---

## 🎭 4. Gọi Anthropic Claude API

```bash
curl -X POST "http://localhost:3040/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      { "role": "user", "content": "Chào Claude!" }
    ]
  }'
```

---

## ⚙️ 5. Cấu Hình Biến Môi Trường (`.env`)

| Biến môi trường | Mặc định | Mô tả chi tiết |
| :--- | :--- | :--- |
| `PORT` | `3040` | Port server lắng nghe |
| `CHATGPT2API_AUTH_KEY` | `chatgpt2api_secret_key_change_me` | Master API Key dùng cho client và route quản trị |
| `STORAGE_BACKEND` | `json` | Cơ chế lưu trữ (`json` hoặc `memory`) |
| `DATA_DIR` | `./data` | Thư mục lưu trữ accounts và dữ liệu |
| `PROXY_URL` | *(để trống)* | Proxy trung gian nếu IP VPS bị chặn (HTTP, HTTPS, SOCKS5) |
| `LOG_LEVEL` | `info` | Mức độ hiển thị log (`debug`, `info`, `warn`, `error`) |

---

## 💖 Support & Donate (Ủng Hộ Tác Giả)

Nếu dự án này hữu ích với công việc hoặc hệ thống của bạn, hãy mời tác giả một tách cà phê để tiếp tục duy trì và cập nhật các thuật toán reverse mới nhất nhé! ☕

<div align="center">
  <img src="assets/donate.jpg" alt="Donate QR Code - Đặng Quốc Huy" width="320" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);" />
  <br/>
  <p><b>Chủ tài khoản:</b> ĐẶNG QUỐC HUY<br/>
  <b>Hỗ trợ thanh toán:</b> MoMo | VietQR | Napas 247</p>
</div>

---

## 🛡️ License

Giấy phép mã nguồn mở MIT. Phát triển bởi [Danieldev](https://github.com/danieldev23).
