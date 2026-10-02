import { randomUUID } from "node:crypto";
import { OpenAIBackendAPI, type ConversationMessage } from "../services/openai-backend.service.js";
import { streamConversationDeltas, collectConversationText } from "./conversation.protocol.js";
import { accountService } from "../services/account.service.js";
import { logger } from "../utils/logger.util.js";

export interface AnthropicMessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface AnthropicMessage {
  role: string;
  content: string | AnthropicMessagePart[];
}

export interface AnthropicMessageRequest {
  model?: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicMessagePart[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

function normalizeAnthropicMessages(req: AnthropicMessageRequest): ConversationMessage[] {
  const result: ConversationMessage[] = [];

  if (req.system) {
    const systemText = typeof req.system === "string"
      ? req.system
      : req.system.map((p) => p.text || "").join("\n");
    if (systemText.trim()) {
      result.push({ role: "system", content: systemText.trim() });
    }
  }

  for (const m of req.messages || []) {
    let content = "";
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content.map((p) => p.text || "").join("\n");
    }
    result.push({
      role: m.role || "user",
      content,
    });
  }

  return result;
}

export async function* handleAnthropicMessageStream(
  req: AnthropicMessageRequest
): AsyncGenerator<string, void, unknown> {
  const model = req.model || "auto";
  const messages = normalizeAnthropicMessages(req);
  const msgId = `msg_${randomUUID().replace(/-/g, "")}`;

  const account = await accountService.getAvailableAccount();
  const token = account ? account.access_token : "";
  const backend = new OpenAIBackendAPI(token, account?.proxy);

  try {
    // 1. message_start
    yield `event: message_start\ndata: ${JSON.stringify({
      type: "message_start",
      message: {
        id: msgId,
        type: "message",
        role: "assistant",
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    })}\n\n`;

    // 2. content_block_start
    yield `event: content_block_start\ndata: ${JSON.stringify({
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    })}\n\n`;

    let totalTokens = 0;
    for await (const delta of streamConversationDeltas(backend, messages, model)) {
      totalTokens += Math.ceil(delta.length / 3);
      yield `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: delta },
      })}\n\n`;
    }

    // 3. content_block_stop
    yield `event: content_block_stop\ndata: ${JSON.stringify({
      type: "content_block_stop",
      index: 0,
    })}\n\n`;

    // 4. message_delta
    yield `event: message_delta\ndata: ${JSON.stringify({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: totalTokens },
    })}\n\n`;

    // 5. message_stop
    yield `event: message_stop\ndata: ${JSON.stringify({
      type: "message_stop",
    })}\n\n`;

    if (token) {
      accountService.markAccountUsed(token, true);
    }
  } catch (err) {
    if (token) {
      accountService.markAccountUsed(token, false, (err as Error).message);
    }
    logger.error("Anthropic message stream error:", err);
    throw err;
  }
}

export async function handleAnthropicMessage(
  req: AnthropicMessageRequest
): Promise<Record<string, unknown>> {
  const model = req.model || "auto";
  const messages = normalizeAnthropicMessages(req);
  const msgId = `msg_${randomUUID().replace(/-/g, "")}`;

  const account = await accountService.getAvailableAccount();
  const token = account ? account.access_token : "";
  const backend = new OpenAIBackendAPI(token, account?.proxy);

  try {
    const fullText = await collectConversationText(backend, messages, model);
    const outputTokens = Math.ceil(fullText.length / 3);

    if (token) {
      accountService.markAccountUsed(token, true);
    }

    return {
      id: msgId,
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text: fullText }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: outputTokens,
      },
    };
  } catch (err) {
    if (token) {
      accountService.markAccountUsed(token, false, (err as Error).message);
    }
    logger.error("Anthropic message error:", err);
    throw err;
  }
}
