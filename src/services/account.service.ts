import { storage, type AccountData } from "./storage.service.js";
import { oauthService } from "./oauth.service.js";
import { logger } from "../utils/logger.util.js";

export class AccountService {
  private accounts = new Map<string, AccountData>();
  private roundRobinIndex = 0;

  constructor() {
    this.reloadAccounts();
  }

  reloadAccounts(): void {
    const loaded = storage.loadAccounts();
    this.accounts.clear();
    for (const acc of loaded) {
      if (acc.access_token) {
        this.accounts.set(acc.access_token, this.normalizeAccount(acc));
      }
    }
    logger.info(`Loaded ${this.accounts.size} account(s) into memory pool`);
  }

  saveAccounts(): void {
    storage.saveAccounts(Array.from(this.accounts.values()));
  }

  private normalizeAccount(acc: Partial<AccountData> & { access_token: string }): AccountData {
    const payload = this.decodeJwtPayload(acc.access_token);
    const email = acc.email || (payload["https://api.openai.com/profile"] as Record<string, unknown>)?.email as string || "";
    const authPayload = payload["https://api.openai.com/auth"] as Record<string, unknown> | undefined;
    const planType = (acc.type || authPayload?.chatgpt_plan_type || "free") as string;

    return {
      ...acc,
      email,
      access_token: acc.access_token,
      refresh_token: acc.refresh_token || "",
      status: acc.status || "normal",
      shared: acc.shared ?? true,
      account_type: acc.account_type || planType,
      type: planType,
      quota: acc.quota ?? (planType === "free" ? 5 : 40),
      image_quota_unknown: acc.image_quota_unknown ?? false,
      user_id: acc.user_id || (payload.sub as string) || null,
      proxy: acc.proxy || "",
      source_type: acc.source_type || "web",
      limits_progress: acc.limits_progress || [],
      default_model_slug: acc.default_model_slug || "auto",
      restore_at: acc.restore_at || null,
      success: acc.success || 0,
      fail: acc.fail || 0,
      invalid_count: acc.invalid_count || 0,
      last_used_at: acc.last_used_at || null,
      last_invalid_at: acc.last_invalid_at || null,
      last_refresh_error: acc.last_refresh_error || null,
      last_token_refresh_at: acc.last_token_refresh_at || null,
      created_at: acc.created_at || new Date().toISOString(),
    };
  }

  decodeJwtPayload(token: string): Record<string, unknown> {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return {};
      let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const json = Buffer.from(b64, "base64").toString("utf-8");
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  isTokenExpired(token: string, bufferSeconds = 300): boolean {
    const payload = this.decodeJwtPayload(token);
    if (!payload.exp || typeof payload.exp !== "number") return false;
    const expMs = payload.exp * 1000;
    return Date.now() + bufferSeconds * 1000 >= expMs;
  }

  listAccounts(): AccountData[] {
    return Array.from(this.accounts.values());
  }

  getAccount(token: string): AccountData | undefined {
    return this.accounts.get(token);
  }

  addTokens(tokens: string[]): number {
    let added = 0;
    for (const t of tokens) {
      const clean = t.trim();
      if (!clean) continue;
      if (!this.accounts.has(clean)) {
        const acc = this.normalizeAccount({ access_token: clean });
        this.accounts.set(clean, acc);
        added++;
      }
    }
    if (added > 0) this.saveAccounts();
    return added;
  }

  addAccounts(accounts: Array<Partial<AccountData> & { access_token: string }>): number {
    let added = 0;
    for (const acc of accounts) {
      if (!acc.access_token) continue;
      const cleanToken = acc.access_token.trim();
      const existing = this.accounts.get(cleanToken);
      const normalized = this.normalizeAccount({ ...existing, ...acc, access_token: cleanToken });
      this.accounts.set(cleanToken, normalized);
      added++;
    }
    if (added > 0) this.saveAccounts();
    return added;
  }

  removeTokens(tokens: string[]): number {
    let removed = 0;
    for (const t of tokens) {
      const clean = t.trim();
      if (this.accounts.delete(clean)) {
        removed++;
      }
    }
    if (removed > 0) this.saveAccounts();
    return removed;
  }

  updateAccount(token: string, updates: Partial<AccountData>): AccountData | undefined {
    const acc = this.accounts.get(token);
    if (!acc) return undefined;
    const updated = { ...acc, ...updates };
    this.accounts.set(token, updated);
    this.saveAccounts();
    return updated;
  }

  async getAvailableAccount(): Promise<AccountData | null> {
    const all = Array.from(this.accounts.values()).filter(
      (a) => a.status !== "disabled" && a.status !== "error"
    );
    if (all.length === 0) return null;

    // Filter normal status first
    const normalAccounts = all.filter((a) => a.status === "normal");
    const pool = normalAccounts.length > 0 ? normalAccounts : all;

    // Round-robin selection
    this.roundRobinIndex = (this.roundRobinIndex + 1) % pool.length;
    let selected = pool[this.roundRobinIndex];

    // Check if token is expired and refresh if possible
    if (this.isTokenExpired(selected.access_token) && selected.refresh_token) {
      try {
        const refreshed = await this.refreshToken(selected.access_token);
        if (refreshed) selected = refreshed;
      } catch (err) {
        logger.warn(`Failed auto-refresh for account ${selected.email}:`, err);
      }
    }

    return selected;
  }

  async refreshToken(oldToken: string, force = false): Promise<AccountData | null> {
    const acc = this.accounts.get(oldToken);
    if (!acc || !acc.refresh_token) return null;

    if (!force && !this.isTokenExpired(acc.access_token)) {
      return acc;
    }

    try {
      const { access_token, refresh_token } = await oauthService.refreshAccessToken(acc.refresh_token);
      this.accounts.delete(oldToken);
      const updated: AccountData = {
        ...acc,
        access_token,
        refresh_token: refresh_token || acc.refresh_token,
        status: "normal",
        invalid_count: 0,
        last_token_refresh_at: new Date().toISOString(),
        last_refresh_error: null,
      };
      this.accounts.set(access_token, updated);
      this.saveAccounts();
      logger.info(`Successfully refreshed token for ${acc.email || "account"}`);
      return updated;
    } catch (err) {
      const errMsg = (err as Error).message;
      acc.last_refresh_error = errMsg;
      acc.invalid_count = (acc.invalid_count || 0) + 1;
      if (acc.invalid_count >= 3) {
        acc.status = "error";
      }
      this.saveAccounts();
      logger.error(`Refresh failed for ${acc.email}:`, errMsg);
      throw err;
    }
  }

  async refreshAllAccounts(): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    for (const acc of Array.from(this.accounts.values())) {
      if (!acc.refresh_token) continue;
      try {
        await this.refreshToken(acc.access_token, true);
        success++;
      } catch {
        failed++;
      }
    }
    return { success, failed };
  }

  markAccountUsed(token: string, success: boolean, errorMessage = ""): void {
    const acc = this.accounts.get(token);
    if (!acc) return;

    acc.last_used_at = new Date().toISOString();
    if (success) {
      acc.success = (acc.success || 0) + 1;
      acc.invalid_count = 0;
      if (acc.status === "error") acc.status = "normal";
    } else {
      acc.fail = (acc.fail || 0) + 1;
      acc.invalid_count = (acc.invalid_count || 0) + 1;
      if (acc.invalid_count >= 3) {
        acc.status = "error";
        acc.last_invalid_at = new Date().toISOString();
        acc.last_refresh_error = errorMessage;
      }
    }
    this.saveAccounts();
  }

  async handleToken401(failedToken: string): Promise<AccountData | null> {
    const acc = this.accounts.get(failedToken);
    if (acc?.refresh_token) {
      try {
        logger.warn(`Token 401 received for ${acc.email || "account"}. Attempting immediate OAuth refresh...`);
        const refreshed = await this.refreshToken(failedToken, true);
        if (refreshed) {
          logger.info(`Successfully auto-fixed token after 401 for ${acc.email || "account"}`);
          return refreshed;
        }
      } catch (err) {
        logger.error(`Immediate refresh after 401 failed for ${acc.email}:`, err);
      }
    }

    // Mark failed account and fallback to next available in pool
    this.markAccountUsed(failedToken, false, "HTTP 401 Token Invalidated");
    return this.getAvailableAccount();
  }

  private refreshTimer: NodeJS.Timeout | null = null;

  startBackgroundRefresh(intervalMs = 10 * 60 * 1000): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(async () => {
      let refreshedCount = 0;
      for (const acc of Array.from(this.accounts.values())) {
        if (!acc.refresh_token || acc.status === "disabled") continue;
        // Check if token will expire in next 10 minutes
        if (this.isTokenExpired(acc.access_token, 600)) {
          try {
            await this.refreshToken(acc.access_token, true);
            refreshedCount++;
          } catch (err) {
            logger.warn(`Background refresh failed for ${acc.email}:`, (err as Error).message);
          }
        }
      }
      if (refreshedCount > 0) {
        logger.info(`[Background Refresh] Automatically refreshed ${refreshedCount} account token(s).`);
      }
    }, intervalMs);

    logger.info(`Background token refresh worker started (interval: ${intervalMs / 1000}s).`);
  }

  stopBackgroundRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

export const accountService = new AccountService();
