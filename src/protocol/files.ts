import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../services/config.js";

const UPLOADS_DIR = path.join(config.dataDir, "uploads");
const METADATA_FILE = path.join(config.dataDir, "files_metadata.json");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface FileRecord {
  id: string;
  object: "file";
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  status: string;
  _local_path?: string;
}

function loadMetadata(): FileRecord[] {
  try {
    if (!fs.existsSync(METADATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(METADATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveMetadata(records: FileRecord[]): void {
  fs.writeFileSync(METADATA_FILE, JSON.stringify(records, null, 2), "utf-8");
}

export function listFiles(purpose?: string): { object: "list"; data: Array<Omit<FileRecord, "_local_path">> } {
  let files = loadMetadata();
  if (purpose) {
    files = files.filter((f) => f.purpose === purpose);
  }
  return {
    object: "list",
    data: files.map(({ _local_path, ...rest }) => rest),
  };
}

export function uploadFile(content: Buffer, filename: string, purpose = "user_data"): Omit<FileRecord, "_local_path"> {
  const fileId = `file-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const localPath = path.join(UPLOADS_DIR, `${fileId}_${filename}`);
  fs.writeFileSync(localPath, content);

  const record: FileRecord = {
    id: fileId,
    object: "file",
    bytes: content.length,
    created_at: Math.floor(Date.now() / 1000),
    filename,
    purpose,
    status: "processed",
    _local_path: localPath,
  };

  const files = loadMetadata();
  files.push(record);
  saveMetadata(files);

  const { _local_path, ...clean } = record;
  return clean;
}

export function getFile(fileId: string): Omit<FileRecord, "_local_path"> {
  const files = loadMetadata();
  const found = files.find((f) => f.id === fileId);
  if (!found) {
    throw new Error(`File '${fileId}' not found.`);
  }
  const { _local_path, ...clean } = found;
  return clean;
}

export function deleteFile(fileId: string): { id: string; object: "file"; deleted: boolean } {
  const files = loadMetadata();
  const idx = files.findIndex((f) => f.id === fileId);
  if (idx === -1) {
    throw new Error(`File '${fileId}' not found.`);
  }

  const [removed] = files.splice(idx, 1);
  if (removed._local_path && fs.existsSync(removed._local_path)) {
    try {
      fs.unlinkSync(removed._local_path);
    } catch {}
  }
  saveMetadata(files);

  return { id: fileId, object: "file", deleted: true };
}

export function getFileContent(fileId: string): Buffer {
  const files = loadMetadata();
  const found = files.find((f) => f.id === fileId);
  if (!found || !found._local_path || !fs.existsSync(found._local_path)) {
    throw new Error(`File content for '${fileId}' not found.`);
  }
  return fs.readFileSync(found._local_path);
}
