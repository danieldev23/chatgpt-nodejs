import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../services/config.js";

const STORE_FILE = path.join(config.dataDir, "openai_store.json");

interface OpenAiStore {
  assistants: Record<string, Record<string, unknown>>;
  vector_stores: Record<string, Record<string, unknown>>;
  batches: Record<string, Record<string, unknown>>;
  fine_tuning: Record<string, Record<string, unknown>>;
}

function loadStore(): OpenAiStore {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { assistants: {}, vector_stores: {}, batches: {}, fine_tuning: {} };
    }
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
  } catch {
    return { assistants: {}, vector_stores: {}, batches: {}, fine_tuning: {} };
  }
}

function saveStore(store: OpenAiStore): void {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// 1. Assistants
export function createAssistant(payload: Record<string, unknown>): Record<string, unknown> {
  const store = loadStore();
  const id = `asst_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const record = {
    id,
    object: "assistant",
    created_at: Math.floor(Date.now() / 1000),
    name: payload.name || "ChatGPT Assistant",
    description: payload.description || null,
    model: payload.model || "auto",
    instructions: payload.instructions || "",
    tools: payload.tools || [],
    file_ids: payload.file_ids || [],
    metadata: payload.metadata || {},
  };
  store.assistants[id] = record;
  saveStore(store);
  return record;
}

export function listAssistants(): { object: "list"; data: Array<Record<string, unknown>> } {
  const store = loadStore();
  return { object: "list", data: Object.values(store.assistants) };
}

export function getAssistant(id: string): Record<string, unknown> {
  const store = loadStore();
  if (store.assistants[id]) return store.assistants[id];
  throw new Error(`Assistant '${id}' not found`);
}

export function deleteAssistant(id: string): { id: string; object: "assistant.deleted"; deleted: boolean } {
  const store = loadStore();
  if (!store.assistants[id]) throw new Error(`Assistant '${id}' not found`);
  delete store.assistants[id];
  saveStore(store);
  return { id, object: "assistant.deleted", deleted: true };
}

// 2. Vector Stores
export function createVectorStore(payload: Record<string, unknown>): Record<string, unknown> {
  const store = loadStore();
  const id = `vs_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const record = {
    id,
    object: "vector_store",
    created_at: Math.floor(Date.now() / 1000),
    name: payload.name || "Default Vector Store",
    usage_bytes: 0,
    file_counts: { in_progress: 0, completed: 0, failed: 0, cancelled: 0, total: 0 },
    status: "completed",
    expires_after: null,
    expires_at: null,
    last_active_at: Math.floor(Date.now() / 1000),
    metadata: payload.metadata || {},
  };
  store.vector_stores[id] = record;
  saveStore(store);
  return record;
}

export function listVectorStores(): { object: "list"; data: Array<Record<string, unknown>> } {
  const store = loadStore();
  return { object: "list", data: Object.values(store.vector_stores) };
}

// 3. Batches
export function createBatch(payload: Record<string, unknown>): Record<string, unknown> {
  const store = loadStore();
  const id = `batch_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const record = {
    id,
    object: "batch",
    endpoint: payload.endpoint || "/v1/chat/completions",
    input_file_id: payload.input_file_id || "",
    completion_window: payload.completion_window || "24h",
    status: "completed",
    output_file_id: null,
    error_file_id: null,
    created_at: Math.floor(Date.now() / 1000),
    in_progress_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    finalizing_at: Math.floor(Date.now() / 1000),
    completed_at: Math.floor(Date.now() / 1000),
    failed_at: null,
    expired_at: null,
    cancelling_at: null,
    cancelled_at: null,
    request_counts: { total: 1, completed: 1, failed: 0 },
    metadata: payload.metadata || {},
  };
  store.batches[id] = record;
  saveStore(store);
  return record;
}

export function listBatches(): { object: "list"; data: Array<Record<string, unknown>> } {
  const store = loadStore();
  return { object: "list", data: Object.values(store.batches) };
}

// 4. Fine-Tuning
export function createFineTuningJob(payload: Record<string, unknown>): Record<string, unknown> {
  const store = loadStore();
  const id = `ftjob-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const record = {
    id,
    object: "fine_tuning.job",
    model: payload.model || "gpt-4o-mini",
    created_at: Math.floor(Date.now() / 1000),
    finished_at: Math.floor(Date.now() / 1000),
    fine_tuned_model: `ft:${payload.model || "gpt-4o-mini"}:custom-${randomUUID().slice(0, 8)}`,
    organization_id: "org-default",
    result_files: [],
    status: "succeeded",
    validation_file: null,
    training_file: payload.training_file || "",
    hyperparameters: { n_epochs: 3 },
    trained_tokens: 1000,
  };
  store.fine_tuning[id] = record;
  saveStore(store);
  return record;
}

export function listFineTuningJobs(): { object: "list"; data: Array<Record<string, unknown>> } {
  const store = loadStore();
  return { object: "list", data: Object.values(store.fine_tuning) };
}
