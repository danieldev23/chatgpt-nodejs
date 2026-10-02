import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

dotenv.config();

export interface AppConfig {
  port: number;
  authKey: string;
  storageBackend: "json" | "memory";
  dataDir: string;
  accountsFile: string;
  proxyUrl?: string;
  appVersion: string;
}

const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || "3040", 10),
  authKey: process.env.CHATGPT2API_AUTH_KEY || "chatgpt2api_secret_key_change_me",
  storageBackend: (process.env.STORAGE_BACKEND as "json" | "memory") || "json",
  dataDir,
  accountsFile: path.join(dataDir, "accounts.json"),
  proxyUrl: process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY,
  appVersion: "1.0.0",
};
