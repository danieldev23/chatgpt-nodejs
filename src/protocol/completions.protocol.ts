import { randomUUID } from "node:crypto";
import { handleChatCompletion, type ChatCompletionRequest } from "./chat-completion.protocol.js";

export interface CompletionRequest {
  model?: string;
  prompt: string | string[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

export async function handleCompletion(req: CompletionRequest): Promise<Record<string, unknown>> {
  const model = req.model || "auto";
  const userContent = Array.isArray(req.prompt) ? req.prompt.join("\n") : String(req.prompt || "");

  const chatPayload: ChatCompletionRequest = {
    ...req,
    model,
    messages: [{ role: "user", content: userContent }],
    stream: false,
  };

  const result = await handleChatCompletion(chatPayload);
  const textContent = result.choices[0]?.message?.content || "";

  return {
    id: `cmpl-${randomUUID().replace(/-/g, "")}`,
    object: "text_completion",
    created: result.created,
    model: result.model,
    choices: [
      {
        text: textContent,
        index: 0,
        logprobs: null,
        finish_reason: result.choices[0]?.finish_reason || "stop",
      },
    ],
    usage: result.usage,
  };
}
