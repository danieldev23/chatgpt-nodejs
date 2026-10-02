import { randomUUID } from "node:crypto";
import { ProxyAgent } from "undici";
import {
  buildLegacyRequirementsToken,
  parsePowResources,
  solvePow,
} from "../utils/pow.util.js";
import { solveTurnstileToken } from "../utils/turnstile.util.js";
import { logger } from "../utils/logger.util.js";
import { config } from "./config.service.js";

export interface ChatRequirements {
  token: string;
  proofToken: string;
  turnstileToken: string;
}

export interface ConversationMessage {
  role: string;
  content: string | unknown[];
}

export class OpenAIBackendAPI {
  private baseUrl = "https://chatgpt.com";
  private clientVersion = "prod-a194cd50d4416d3c0b47c740f206b12ce60f5887";
  private clientBuildNumber = "6708908";
  public accessToken: string;
  private userAgent: string;
  private deviceId: string;
  private sessionId: string;
  private cookies: string[] = [];
  private powScriptSources: string[] = [];
  private powDataBuild = "";
  private proxyAgent?: ProxyAgent;

  constructor(accessToken = "", proxyUrl?: string) {
    this.accessToken = accessToken.trim();
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
    this.deviceId = randomUUID();
    this.sessionId = randomUUID();

    const activeProxy = proxyUrl || config.proxyUrl;
    if (activeProxy) {
      try {
        this.proxyAgent = new ProxyAgent(activeProxy);
      } catch (err) {
        logger.warn(`Failed to initialize ProxyAgent for ${activeProxy}:`, err);
      }
    }
  }

  private getCookieHeader(): string {
    return this.cookies.map((c) => c.split(";")[0]).join("; ");
  }

  private saveCookies(res: Response): void {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      this.cookies.push(c);
    }
  }

  private getFetchOptions(init: RequestInit = {}): RequestInit & { dispatcher?: ProxyAgent } {
    const options: RequestInit & { dispatcher?: ProxyAgent } = { ...init };
    if (this.proxyAgent) {
      options.dispatcher = this.proxyAgent;
    }
    return options;
  }

  private baseHeaders(path: string): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      "Origin": this.baseUrl,
      "Referer": `${this.baseUrl}/`,
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Sec-Ch-Ua": '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "OAI-Device-Id": this.deviceId,
      "OAI-Session-Id": this.sessionId,
      "OAI-Language": "en-US",
      "OAI-Client-Version": this.clientVersion,
      "OAI-Client-Build-Number": this.clientBuildNumber,
      "X-OpenAI-Target-Path": path,
      "X-OpenAI-Target-Route": path,
    };

    const cookieStr = this.getCookieHeader();
    if (cookieStr) {
      headers["Cookie"] = cookieStr;
    }

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    return headers;
  }

  async bootstrap(): Promise<void> {
    try {
      const res = await fetch(
        `${this.baseUrl}/`,
        this.getFetchOptions({
          headers: {
            "User-Agent": this.userAgent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Sec-Ch-Ua": '"Microsoft Edge";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
          },
        })
      );
      this.saveCookies(res);
      const html = await res.text();
      const parsed = parsePowResources(html);
      this.powScriptSources = parsed.scriptSources;
      this.powDataBuild = parsed.dataBuild;
    } catch (err) {
      logger.warn("Bootstrap fetch warning (continuing with defaults):", err);
    }
  }

  async getChatRequirements(): Promise<ChatRequirements> {
    const base = this.accessToken
      ? "/backend-api/sentinel/chat-requirements"
      : "/backend-anon/sentinel/chat-requirements";

    const pToken = buildLegacyRequirementsToken(
      this.userAgent,
      this.powScriptSources,
      this.powDataBuild
    );

    // 1. Prepare
    const prepPath = `${base}/prepare`;
    const prepRes = await fetch(
      `${this.baseUrl}${prepPath}`,
      this.getFetchOptions({
        method: "POST",
        headers: {
          ...this.baseHeaders(prepPath),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p: pToken }),
      })
    );
    this.saveCookies(prepRes);

    if (!prepRes.ok) {
      const errText = await prepRes.text();
      throw new Error(`Chat requirements prepare failed HTTP ${prepRes.status}: ${errText}`);
    }

    const prepData = (await prepRes.json()) as Record<string, unknown>;
    const prepareToken = (prepData.prepare_token as string) || "";

    // 2. Proof of work
    let proofToken = "";
    const powInfo = prepData.proofofwork as { required?: boolean; seed?: string; difficulty?: string } | undefined;
    if (powInfo?.required && powInfo.seed && powInfo.difficulty) {
      const powConfig = [
        3000,
        new Date().toString(),
        4294705152,
        1,
        this.userAgent,
        this.powScriptSources[0] || "https://chatgpt.com/backend-api/sentinel/sdk.js",
        this.powDataBuild,
        "en-US",
        "en-US,es-US,en,es",
        Math.random(),
        "hardwareConcurrency−8",
        "location",
        "window",
        performance.now(),
        randomUUID(),
        "",
        8,
        Date.now() - performance.now(),
        0, 0, 0, 0, 0, 0,
        0,
      ];
      const solved = solvePow(powInfo.seed, powInfo.difficulty, powConfig);
      proofToken = solved.token;
    }

    // 3. Turnstile
    let turnstileToken = "";
    const turnstileInfo = prepData.turnstile as { required?: boolean; dx?: string } | undefined;
    if (turnstileInfo?.required && turnstileInfo.dx) {
      turnstileToken = solveTurnstileToken(turnstileInfo.dx, pToken) || "";
    }

    // 4. Finalize
    const finPath = `${base}/finalize`;
    const finRes = await fetch(
      `${this.baseUrl}${finPath}`,
      this.getFetchOptions({
        method: "POST",
        headers: {
          ...this.baseHeaders(finPath),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prepare_token: prepareToken,
          proof_token: proofToken,
          turnstile_token: turnstileToken,
        }),
      })
    );
    this.saveCookies(finRes);

    if (!finRes.ok) {
      const errText = await finRes.text();
      throw new Error(`Chat requirements finalize failed HTTP ${finRes.status}: ${errText}`);
    }

    const finData = (await finRes.json()) as Record<string, unknown>;
    const sentinelToken = (finData.token as string) || "";

    if (!sentinelToken) {
      throw new Error(`Missing sentinel chat requirements token: ${JSON.stringify(finData)}`);
    }

    return {
      token: sentinelToken,
      proofToken,
      turnstileToken,
    };
  }

  async *streamConversation(
    messages: ConversationMessage[],
    model = "auto"
  ): AsyncGenerator<string, void, unknown> {
    await this.bootstrap();
    const requirements = await this.getChatRequirements();

    const isAuth = !!this.accessToken;
    const path = isAuth ? "/backend-api/conversation" : "/backend-anon/conversation";
    const timezone = isAuth ? "Asia/Shanghai" : "America/Los_Angeles";

    const convMessages = messages.map((m) => ({
      id: randomUUID(),
      author: { role: m.role || "user" },
      content: {
        content_type: "text",
        parts: [typeof m.content === "string" ? m.content : JSON.stringify(m.content)],
      },
    }));

    const payload = {
      action: "next",
      messages: convMessages,
      model,
      parent_message_id: randomUUID(),
      conversation_mode: { kind: "primary_assistant" },
      conversation_origin: null,
      force_paragen: false,
      force_rate_limit: false,
      force_use_sse: true,
      history_and_training_disabled: false,
      reset_rate_limits: false,
      suggestions: [],
      supported_encodings: [],
      system_hints: [],
      timezone,
      timezone_offset_min: -480,
      variant_purpose: "comparison_implicit",
      websocket_request_id: randomUUID(),
    };

    const headers: Record<string, string> = {
      ...this.baseHeaders(path),
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      "OpenAI-Sentinel-Chat-Requirements-Token": requirements.token,
    };
    if (requirements.proofToken) {
      headers["OpenAI-Sentinel-Proof-Token"] = requirements.proofToken;
    }
    if (requirements.turnstileToken) {
      headers["OpenAI-Sentinel-Turnstile-Token"] = requirements.turnstileToken;
    }

    const res = await fetch(
      `${this.baseUrl}${path}`,
      this.getFetchOptions({
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      })
    );

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 401) {
        throw new Error(`Token invalidated HTTP 401 (${path}): ${errText}`);
      }
      throw new Error(`Conversation upstream error HTTP ${res.status}: ${errText}`);
    }

    if (!res.body) {
      throw new Error("No response body received from upstream conversation");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            yield trimmed.slice(6);
          }
        }
      }
      if (buffer.trim().startsWith("data: ")) {
        yield buffer.trim().slice(6);
      }
    } finally {
      reader.releaseLock();
    }
  }

  async getFileDownloadUrl(fileId: string): Promise<string> {
    const path = `/backend-api/files/${fileId}/download`;
    const res = await fetch(
      `${this.baseUrl}${path}`,
      this.getFetchOptions({
        headers: this.baseHeaders(path),
      })
    );
    if (!res.ok) {
      throw new Error(`Failed to get file download url for ${fileId}: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { download_url?: string; url?: string };
    return data.download_url || data.url || "";
  }

  async getUserInfo(): Promise<Record<string, unknown>> {
    if (!this.accessToken) {
      throw new Error("Access token is required to fetch user info");
    }

    const mePath = "/backend-api/me";
    const meRes = await fetch(
      `${this.baseUrl}${mePath}`,
      this.getFetchOptions({
        headers: this.baseHeaders(mePath),
      })
    );

    if (!meRes.ok) {
      throw new Error(`Failed to fetch /backend-api/me: HTTP ${meRes.status}`);
    }

    const meData = (await meRes.json()) as Record<string, unknown>;

    const initPath = "/backend-api/conversation/init";
    const initRes = await fetch(
      `${this.baseUrl}${initPath}`,
      this.getFetchOptions({
        method: "POST",
        headers: {
          ...this.baseHeaders(initPath),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gizmo_id: null,
          requested_default_model: null,
          conversation_id: null,
          timezone_offset_min: -480,
        }),
      })
    );

    const initData = initRes.ok ? ((await initRes.json()) as Record<string, unknown>) : {};

    return {
      email: meData.email,
      user_id: meData.id,
      default_model_slug: initData.default_model_slug || "auto",
      limits_progress: initData.limits_progress || [],
      status: "normal",
    };
  }

  async listModels(): Promise<Array<{ id: string; object: string; created: number; owned_by: string }>> {
    await this.bootstrap();
    const isAuth = !!this.accessToken;
    const path = isAuth
      ? "/backend-api/models?history_and_training_disabled=false"
      : "/backend-anon/models?iim=false&is_gizmo=false";

    const res = await fetch(
      `${this.baseUrl}${path}`,
      this.getFetchOptions({
        headers: this.baseHeaders(isAuth ? "/backend-api/models" : "/backend-anon/models"),
      })
    );

    const standardModels = [
      { id: "gpt-4o", object: "model", created: 1715367049, owned_by: "openai" },
      { id: "gpt-4o-mini", object: "model", created: 1721237833, owned_by: "openai" },
      { id: "chatgpt-4o-latest", object: "model", created: 1723600000, owned_by: "openai" },
      { id: "o1", object: "model", created: 1726000000, owned_by: "openai" },
      { id: "o1-mini", object: "model", created: 1726000000, owned_by: "openai" },
      { id: "o1-preview", object: "model", created: 1726000000, owned_by: "openai" },
      { id: "o3-mini", object: "model", created: 1738000000, owned_by: "openai" },
      { id: "gpt-4-turbo", object: "model", created: 1712361441, owned_by: "openai" },
      { id: "gpt-4", object: "model", created: 1687882411, owned_by: "openai" },
      { id: "gpt-3.5-turbo", object: "model", created: 1677610602, owned_by: "openai" },
      { id: "claude-3-5-sonnet-20241022", object: "model", created: 1729555200, owned_by: "anthropic" },
      { id: "claude-3-5-haiku-20241022", object: "model", created: 1729555200, owned_by: "anthropic" },
      { id: "claude-3-opus-20240229", object: "model", created: 1709251200, owned_by: "anthropic" },
      { id: "gpt-image-2", object: "model", created: 1700000000, owned_by: "openai" },
      { id: "dall-e-3", object: "model", created: 1700000000, owned_by: "openai" },
      { id: "auto", object: "model", created: 1700000000, owned_by: "chatgpt" },
    ];

    if (!res.ok) {
      return standardModels;
    }

    try {
      const data = (await res.json()) as { models?: Array<{ slug?: string; created?: number; owned_by?: string }> };
      const modelMap = new Map<string, { id: string; object: string; created: number; owned_by: string }>();

      // Put standard public models first
      for (const m of standardModels) {
        modelMap.set(m.id, m);
      }

      // Add upstream internal models
      if (data.models && Array.isArray(data.models)) {
        for (const item of data.models) {
          if (item.slug && !modelMap.has(item.slug)) {
            modelMap.set(item.slug, {
              id: item.slug,
              object: "model",
              created: item.created || Math.floor(Date.now() / 1000),
              owned_by: item.owned_by || "chatgpt",
            });
          }
        }
      }

      return Array.from(modelMap.values());
    } catch {
      return standardModels;
    }
  }
}
