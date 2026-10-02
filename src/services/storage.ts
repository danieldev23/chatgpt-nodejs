import fs from "node:fs";
import { config } from "./config.js";
import { logger } from "../utils/logger.js";

export interface AccountData {
  email?: string;
  access_token: string;
  refresh_token?: string;
  status: "normal" | "limited" | "error" | "disabled";
  shared?: boolean;
  account_type?: string;
  type?: string;
  quota?: number;
  image_quota_unknown?: boolean;
  user_id?: string | null;
  proxy?: string;
  source_type?: string;
  limits_progress?: unknown[];
  default_model_slug?: string | null;
  restore_at?: string | null;
  success?: number;
  fail?: number;
  invalid_count?: number;
  last_used_at?: string | null;
  last_invalid_at?: string | null;
  last_refresh_error?: string | null;
  last_token_refresh_at?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface IStorage {
  loadAccounts(): AccountData[];
  saveAccounts(accounts: AccountData[]): void;
}

export class JsonStorage implements IStorage {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  loadAccounts(): AccountData[] {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const raw = fs.readFileSync(this.filePath, "utf-8").trim();
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (err) {
      logger.error(`Failed to load accounts from ${this.filePath}:`, err);
      return [];
    }
  }

  saveAccounts(accounts: AccountData[]): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(accounts, null, 2), "utf-8");
    } catch (err) {
      logger.error(`Failed to save accounts to ${this.filePath}:`, err);
    }
  }
}

export class MemoryStorage implements IStorage {
  private accounts: AccountData[] = [];

  loadAccounts(): AccountData[] {
    return [...this.accounts];
  }

  saveAccounts(accounts: AccountData[]): void {
    this.accounts = [...accounts];
  }
}

export const storage: IStorage =
  config.storageBackend === "memory"
    ? new MemoryStorage()
    : new JsonStorage(config.accountsFile);
