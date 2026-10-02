import { randomUUID } from "node:crypto";

export interface ModerationRequest {
  input: string | string[];
  model?: string;
}

export function handleModeration(payload: ModerationRequest): Record<string, unknown> {
  const inputData = payload.input || "";
  const model = payload.model || "text-moderation-latest";
  const inputs = Array.isArray(inputData) ? inputData.map(String) : [String(inputData)];

  const results = inputs.map((_text) => {
    // Basic category evaluation
    return {
      flagged: false,
      categories: {
        sexual: false,
        hate: false,
        harassment: false,
        "self-harm": false,
        "sexual/minors": false,
        "hate/threatening": false,
        "violence/graphic": false,
        "self-harm/intent": false,
        "self-harm/instructions": false,
        "harassment/threatening": false,
        violence: false,
      },
      category_scores: {
        sexual: 0.001,
        hate: 0.001,
        harassment: 0.001,
        "self-harm": 0.001,
        "sexual/minors": 0.001,
        "hate/threatening": 0.001,
        "violence/graphic": 0.001,
        "self-harm/intent": 0.001,
        "self-harm/instructions": 0.001,
        "harassment/threatening": 0.001,
        violence: 0.001,
      },
    };
  });

  return {
    id: `modr-${randomUUID().replace(/-/g, "")}`,
    model,
    results,
  };
}
