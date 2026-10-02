import { OpenAIBackendAPI, type ConversationMessage } from "../services/openai-backend.service.js";

function sanitizeOutputText(text: string): string {
  let cleaned = text;
  // ChatGPT web sometimes returns rich annotation markers with private-use characters \ue200...\ue201
  cleaned = cleaned.replace(/\ue200([^\ue201]*)\ue201/g, (_match, p1) => {
    const parts = p1.split("\ue202").map((s: string) => s.trim());
    const kind = parts[0]?.toLowerCase() || "";
    const data = parts.slice(1);
    if (kind === "url") {
      const label = data[0] || "";
      const url = data[1] || "";
      if (label && (url.startsWith("http://") || url.startsWith("https://"))) {
        return `${label} (${url})`;
      }
      return label || url;
    }
    return data.find((d: string) => d.length > 0) || "";
  });
  cleaned = cleaned.replace(/\ue200[^\ue201]*$/g, "");
  return cleaned;
}

function extractMessageText(message: Record<string, unknown>): string {
  const content = message.content as Record<string, unknown> | undefined;
  if (!content) return "";
  const parts = content.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    return parts.filter((p) => typeof p === "string").join("");
  }
  if (typeof content.text === "string") {
    return content.text;
  }
  return "";
}

function applyPatchOp(operation: Record<string, unknown>, currentText: string): string {
  const op = operation.o;
  const value = String(operation.v || "");
  if (op === "append") {
    return currentText + value;
  }
  if (op === "replace") {
    return value;
  }
  return currentText;
}

function applyTextPatch(event: Record<string, unknown>, currentText: string): string {
  if (event.p === "/message/content/parts/0") {
    return applyPatchOp(event, currentText);
  }

  const operations = event.v;
  if (typeof operations === "string" && currentText && !event.p && !event.o) {
    return currentText + operations;
  }

  if (Array.isArray(operations)) {
    let text = currentText;
    for (const item of operations) {
      if (item && typeof item === "object") {
        text = applyTextPatch(item as Record<string, unknown>, text);
      }
    }
    return text;
  }

  return currentText;
}

function extractRawAssistantText(event: Record<string, unknown>, currentText: string): string {
  const candidates = [event, event.v as Record<string, unknown> | undefined];
  for (const cand of candidates) {
    if (!cand || typeof cand !== "object") continue;
    const message = cand.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== "object") continue;
    const author = message.author as Record<string, unknown> | undefined;
    if (author?.role === "assistant") {
      const text = extractMessageText(message);
      if (text) return text;
    }
  }
  return applyTextPatch(event, currentText);
}

export async function* streamConversationDeltas(
  backend: OpenAIBackendAPI,
  messages: ConversationMessage[],
  model = "auto"
): AsyncGenerator<string, void, unknown> {
  let fullRawText = "";
  let emittedText = "";

  for await (const payload of backend.streamConversation(messages, model)) {
    if (!payload) continue;
    if (payload === "[DONE]") break;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload);
    } catch {
      continue;
    }

    const nextRawText = extractRawAssistantText(event, fullRawText);
    const nextCleanText = sanitizeOutputText(nextRawText);
    fullRawText = nextRawText;

    if (nextCleanText !== emittedText) {
      const delta = nextCleanText.startsWith(emittedText)
        ? nextCleanText.slice(emittedText.length)
        : nextCleanText;
      emittedText = nextCleanText;
      if (delta) {
        yield delta;
      }
    }
  }
}

export async function collectConversationText(
  backend: OpenAIBackendAPI,
  messages: ConversationMessage[],
  model = "auto"
): Promise<string> {
  let result = "";
  for await (const delta of streamConversationDeltas(backend, messages, model)) {
    result += delta;
  }
  return result;
}
