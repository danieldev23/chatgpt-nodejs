import { randomUUID } from "node:crypto";
import { OpenAIBackendAPI, type ConversationMessage } from "../services/openai-backend.service.js";
import { streamConversationDeltas, collectConversationText } from "./conversation.protocol.js";
import { accountService } from "../services/account.service.js";
import { logger } from "../utils/logger.util.js";

export interface ChatMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  name?: string;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  [key: string]: unknown;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
  };
  finish_reason: string | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  // Approximation: ~4 chars per token for English, ~1-2 chars for CJK/Vietnamese
  return Math.ceil(text.length / 3);
}

function normalizeMessages(messages: ChatMessage[]): ConversationMessage[] {
  return messages.map((m) => {
    let contentStr = "";
    if (typeof m.content === "string") {
      contentStr = m.content;
    } else if (Array.isArray(m.content)) {
      const texts = m.content
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text);
      contentStr = texts.join("\n");
    } else {
      contentStr = String(m.content || "");
    }
    return {
      role: m.role || "user",
      content: contentStr,
    };
  });
}

export function resolveModelSlug(model?: string): string {
  if (!model) return "auto";
  const m = model.toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    "gpt-3.5-turbo": "gpt-4o-mini",
    "gpt-4": "gpt-4o",
    "gpt-4-turbo": "gpt-4o",
    "gpt-4o": "gpt-4o",
    "gpt-4o-mini": "gpt-4o-mini",
    "o1": "o1",
    "o1-mini": "o1-mini",
    "o1-preview": "o1",
    "o3-mini": "o3-mini",
    "chatgpt-4o-latest": "gpt-4o",
  };
  return aliasMap[m] || model;
}

export async function* handleChatCompletionStream(
  req: ChatCompletionRequest
): AsyncGenerator<string, void, unknown> {
  const requestedModel = req.model || "auto";
  const upstreamModel = resolveModelSlug(requestedModel);
  const messages = normalizeMessages(req.messages || []);
  const completionId = `chatcmpl-${randomUUID().replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);

  let account = await accountService.getAvailableAccount();
  let token = account ? account.access_token : "";
  let backend = new OpenAIBackendAPI(token, account?.proxy);

  let sentRole = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      for await (const delta of streamConversationDeltas(backend, messages, upstreamModel)) {
        if (!sentRole) {
          sentRole = true;
          const firstChunk: ChatCompletionChunk = {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: requestedModel,
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: delta },
                finish_reason: null,
              },
            ],
          };
          yield `data: ${JSON.stringify(firstChunk)}\n\n`;
        } else {
          const chunk: ChatCompletionChunk = {
            id: completionId,
            object: "chat.completion.chunk",
            created,
            model: requestedModel,
            choices: [
              {
                index: 0,
                delta: { content: delta },
                finish_reason: null,
              },
            ],
          };
          yield `data: ${JSON.stringify(chunk)}\n\n`;
        }
      }

      if (!sentRole) {
        const emptyChunk: ChatCompletionChunk = {
          id: completionId,
          object: "chat.completion.chunk",
          created,
          model: requestedModel,
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "" },
              finish_reason: null,
            },
          ],
        };
        yield `data: ${JSON.stringify(emptyChunk)}\n\n`;
      }

      const finalChunk: ChatCompletionChunk = {
        id: completionId,
        object: "chat.completion.chunk",
        created,
        model: requestedModel,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      };
      yield `data: ${JSON.stringify(finalChunk)}\n\n`;
      yield `data: [DONE]\n\n`;

      if (token) {
        accountService.markAccountUsed(token, true);
      }
      return;
    } catch (err) {
      const errMsg = (err as Error).message || "";
      const is401 = errMsg.includes("401") || errMsg.includes("Token invalidated");

      if (is401 && !sentRole && attempt === 0 && token) {
        logger.warn(`Stream encountered 401 on initial handshake. Auto-refreshing token...`);
        const newAccount = await accountService.handleToken401(token);
        if (newAccount) {
          account = newAccount;
          token = account.access_token;
          backend = new OpenAIBackendAPI(token, account.proxy);
          continue; // Retry with refreshed/healthy account!
        }
      }

      if (token) {
        accountService.markAccountUsed(token, false, errMsg);
      }
      logger.error("Chat completion stream error:", err);
      throw err;
    }
  }
}

export async function handleChatCompletion(
  req: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const requestedModel = req.model || "auto";
  const upstreamModel = resolveModelSlug(requestedModel);
  const messages = normalizeMessages(req.messages || []);
  const completionId = `chatcmpl-${randomUUID().replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);

  let account = await accountService.getAvailableAccount();
  let token = account ? account.access_token : "";
  let backend = new OpenAIBackendAPI(token, account?.proxy);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fullText = await collectConversationText(backend, messages, upstreamModel);

      const promptText = messages.map((m) => m.content).join("\n");
      const promptTokens = estimateTokens(promptText);
      const completionTokens = estimateTokens(fullText);

      if (token) {
        accountService.markAccountUsed(token, true);
      }

      return {
        id: completionId,
        object: "chat.completion",
        created,
        model: requestedModel,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: fullText,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      };
    } catch (err) {
      const errMsg = (err as Error).message || "";
      const is401 = errMsg.includes("401") || errMsg.includes("Token invalidated");

      if (is401 && attempt === 0 && token) {
        logger.warn(`Encountered 401 on completion. Auto-refreshing token...`);
        const newAccount = await accountService.handleToken401(token);
        if (newAccount) {
          account = newAccount;
          token = account.access_token;
          backend = new OpenAIBackendAPI(token, account.proxy);
          continue; // Retry with refreshed/healthy account!
        }
      }

      if (token) {
        accountService.markAccountUsed(token, false, errMsg);
      }
      logger.error("Chat completion error:", err);
      throw err;
    }
  }

  throw new Error("Chat completion failed after token auto-fix retry");
}
