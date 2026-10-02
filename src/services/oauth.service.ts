import { randomBytes, randomUUID } from "node:crypto";
import { generatePkce } from "../utils/pkce.util.js";
import { logger } from "../utils/logger.util.js";
import { config } from "./config.service.js";

const OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OAUTH_CLIENT_ID = "app_2SKx67EdpoN0G6j64rFvigXD";
const PLATFORM_OAUTH_CLIENT_ID = "pdlLIX2Y72MIlZrhLhTE9V9Aff9hfTi1";
const PLATFORM_OAUTH_REDIRECT_URI = "https://platform.openai.com/auth/callback";
const PLATFORM_OAUTH_AUDIENCE = "https://api.openai.com/v1";
const AUTH_BASE = "https://auth.openai.com";
const OAUTH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

export interface PkceSession {
  sessionId: string;
  verifier: string;
  challenge: string;
  createdAt: number;
}

export class OAuthService {
  private sessions = new Map<string, PkceSession>();
  private readonly sessionTtl = 10 * 60 * 1000; // 10 minutes

  start(emailHint = ""): { sessionId: string; authorizeUrl: string } {
    this.purgeExpired();
    const { codeVerifier, codeChallenge } = generatePkce();
    const sessionId = randomUUID().replace(/-/g, "");
    const nonce = randomBytes(16).toString("hex");
    const deviceId = randomUUID();
    const state = `${sessionId}.${randomBytes(8).toString("hex")}`;

    this.sessions.set(sessionId, {
      sessionId,
      verifier: codeVerifier,
      challenge: codeChallenge,
      createdAt: Date.now(),
    });

    const params = new URLSearchParams({
      issuer: AUTH_BASE,
      client_id: PLATFORM_OAUTH_CLIENT_ID,
      audience: PLATFORM_OAUTH_AUDIENCE,
      redirect_uri: PLATFORM_OAUTH_REDIRECT_URI,
      device_id: deviceId,
      screen_hint: "login_or_signup",
      max_age: "0",
      scope: "openid profile email offline_access",
      response_type: "code",
      response_mode: "query",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    if (emailHint.trim()) {
      params.set("login_hint", emailHint.trim());
    }

    const authorizeUrl = `${AUTH_BASE}/authorize?${params.toString()}`;
    return { sessionId, authorizeUrl };
  }

  async finish(sessionId: string, callbackOrCode: string): Promise<{
    access_token: string;
    refresh_token: string;
    id_token: string;
  }> {
    this.purgeExpired();
    let actualSessionId = sessionId;
    let code = callbackOrCode.trim();

    if (callbackOrCode.includes("?") || callbackOrCode.includes("&")) {
      try {
        const urlStr = callbackOrCode.startsWith("http") ? callbackOrCode : `https://dummy/${callbackOrCode}`;
        const url = new URL(urlStr);
        code = url.searchParams.get("code") || code;
        const state = url.searchParams.get("state") || "";
        if (state.includes(".")) {
          actualSessionId = state.split(".")[0];
        }
      } catch {
        // Fallback to raw code
      }
    }

    const session = this.sessions.get(actualSessionId);
    if (!session) {
      throw new Error("OAuth session expired or not found. Please start login again.");
    }

    this.sessions.delete(actualSessionId);

    const bodyParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: PLATFORM_OAUTH_CLIENT_ID,
      code,
      code_verifier: session.verifier,
      redirect_uri: PLATFORM_OAUTH_REDIRECT_URI,
    });

    const res = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": OAUTH_USER_AGENT,
      },
      body: bodyParams.toString(),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok || !data.access_token) {
      const err = (data.error_description || data.error || res.statusText) as string;
      throw new Error(`OAuth token exchange failed (${res.status}): ${err}`);
    }

    return {
      access_token: String(data.access_token),
      refresh_token: String(data.refresh_token || ""),
      id_token: String(data.id_token || ""),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
    id_token: string;
  }> {
    if (!refreshToken) {
      throw new Error("Refresh token is required");
    }

    const bodyParams = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: OAUTH_CLIENT_ID,
    });

    const res = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": OAUTH_USER_AGENT,
      },
      body: bodyParams.toString(),
    });

    const data = await res.json() as Record<string, unknown>;
    if (!res.ok || !data.access_token) {
      const detail = (data.error_description || data.error || res.statusText) as string;
      throw new Error(`Token refresh failed HTTP ${res.status}: ${detail}`);
    }

    return {
      access_token: String(data.access_token).trim(),
      refresh_token: String(data.refresh_token || refreshToken).trim(),
      id_token: String(data.id_token || "").trim(),
    };
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [sid, sess] of this.sessions.entries()) {
      if (now - sess.createdAt > this.sessionTtl) {
        this.sessions.delete(sid);
      }
    }
  }
}

export const oauthService = new OAuthService();
