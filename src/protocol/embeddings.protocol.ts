import { createHash } from "node:crypto";

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
}

function generateDeterministicEmbedding(text: string, dim = 1536): number[] {
  const hash = createHash("sha512").update(text).digest();
  const vector: number[] = [];

  for (let i = 0; i < dim; i++) {
    const idx = (hash[i % hash.length] + i * 31) % hash.length;
    const val = (hash[idx] - 128) / 128.0;
    vector.push(parseFloat(val.toFixed(6)));
  }

  const magnitude = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  if (magnitude > 0) {
    return vector.map((x) => parseFloat((x / magnitude).toFixed(6)));
  }
  return vector;
}

export function handleEmbeddings(payload: EmbeddingRequest): Record<string, unknown> {
  const inputData = payload.input || "";
  const model = payload.model || "text-embedding-3-small";

  const inputs = Array.isArray(inputData) ? inputData.map(String) : [String(inputData)];
  let totalTokens = 0;

  const data = inputs.map((textStr, idx) => {
    const tokens = Math.max(1, Math.ceil(textStr.length / 4));
    totalTokens += tokens;
    return {
      object: "embedding",
      index: idx,
      embedding: generateDeterministicEmbedding(textStr),
    };
  });

  return {
    object: "list",
    data,
    model,
    usage: {
      prompt_tokens: totalTokens,
      total_tokens: totalTokens,
    },
  };
}
