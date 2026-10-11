# 🚀 ChatGPT-Nodejs (OpenAI & Anthropic Compatible REST API)

A high-performance, lightweight **ChatGPT Web to OpenAI & Anthropic REST API Reverse Proxy** written in modern Node.js & TypeScript.

Direct drop-in replacement for `chatgpt2api` with ultra-low memory footprint, zero GIL/thread contention, native async SSE streaming, and native OpenSSL `sha3-512` Proof-of-Work execution.

---

## ⚡ Features

- **OpenAI Compatible REST API**:
  - `POST /v1/chat/completions` (Full support for SSE streaming `stream: true` and non-streaming)
  - `GET /v1/models` (Model discovery aligning with OpenAI standards)
  - `POST /v1/responses` (OpenAI Realtime/Responses format)
  - `POST /v1/search` (ChatGPT search query bridge)
- **Anthropic Claude Compatible API**:
  - `POST /v1/messages` (Full compatibility with Claude API clients)
- **Reverse Engineering & Sentinel Engine**:
  - **OpenAI Web Sentinel SDK Handshake**: automated `prepare` and `finalize` requirements negotiation.
  - **High-speed Proof-of-Work (PoW)**: native C++ `node:crypto` SHA3-512 solver completing in ~2ms.
  - **Turnstile Bytecode VM**: embedded virtual machine for solving Cloudflare/Turnstile challenges.
  - **Fingerprint Emulation**: realistic browser headers (`sec-ch-ua`, `oai-device-id`, `oai-session-id`, `user-agent`).
  - **JSON Patch Diff Engine**: parses RFC 6902 incremental patches and delta streams.
- **Account Pool Management**:
  - Round-robin token rotation with health monitoring.
  - Hot account injection via REST API without server restart.
  - Automated OAuth token refresh via `https://auth.openai.com/oauth/token`.
  - PKCE OAuth login bridge (`/api/accounts/oauth/start` and `/finish`).
  - JSON file persistence (`data/accounts.json`).

---

## 🛠 1. Quickstart

> 📖 **Xem hướng dẫn triển khai chi tiết Local & VPS tại**: [DEPLOYMENT.md](file:///Users/dangquochuy/Documents/Projects/ChatGPT-Nodejs/DEPLOYMENT.md)

### Option A: Run Locally with Node.js

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Build & Run
npm run build
npm start

# Or in development with auto-reload:
npm run dev
```

> Server listens at `http://localhost:3040`.

---

### Option B: Run with Docker Compose

```bash
docker compose up -d --build
```

---

## 🔑 2. Account & Token Management API

All management routes require:
`Authorization: Bearer <CHATGPT2API_AUTH_KEY>`

### 2.1 Add Token / Accounts (`POST /api/accounts`)

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

Or with bash helper:
```bash
./scripts/api_add_token.sh "eyJhbGciOi..." "refresh_token_optional"
```

### 2.2 List Accounts (`GET /api/accounts`)

```bash
curl -X GET "http://localhost:3040/api/accounts" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me"
```

### 2.3 Refresh Tokens (`POST /api/accounts/refresh`)

```bash
# Refresh all accounts
curl -X POST "http://localhost:3040/api/accounts/refresh" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me" \
  -d '{"access_tokens": []}'
```

### 2.4 Delete Accounts (`DELETE /api/accounts`)

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

## 🤖 3. OpenAI Chat Completions

### Non-streaming:

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

### Streaming (SSE):

```bash
curl -N -X POST "http://localhost:3040/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me" \
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Tell me a short joke." }
    ]
  }'
```

---

## 🎭 4. Anthropic Claude API

```bash
curl -X POST "http://localhost:3040/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer chatgpt2api_secret_key_change_me" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [
      { "role": "user", "content": "Hello Claude!" }
    ]
  }'
```

---

## ⚙️ 5. Environment Variables (`.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3040` | Port the server listens on |
| `CHATGPT2API_AUTH_KEY` | `chatgpt2api_secret_key_change_me` | Master API key for client & admin authorization |
| `STORAGE_BACKEND` | `json` | Storage engine (`json` or `memory`) |
| `DATA_DIR` | `./data` | Directory for accounts & data files |
| `PROXY_URL` | *(empty)* | Optional upstream proxy (HTTP, HTTPS, SOCKS5) |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

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

MIT License. Developed by [Danieldev](https://github.com/danieldev23).

