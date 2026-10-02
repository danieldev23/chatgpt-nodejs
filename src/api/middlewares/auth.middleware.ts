import type { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../../services/config.service.js";

function extractToken(request: FastifyRequest): string {
  const authHeader = request.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      return parts[1].trim();
    }
    return authHeader.trim();
  }

  const apiKeyHeader = request.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  return "";
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // If no auth key is configured or it's empty, allow all requests
  if (!config.authKey || config.authKey === "your_secure_admin_api_key_here") {
    return;
  }

  const token = extractToken(request);
  if (!token) {
    reply.status(401).send({
      error: {
        message: "Missing authorization token. Provide 'Authorization: Bearer <key>' or 'x-api-key: <key>'.",
        type: "invalid_request_error",
        code: "unauthorized",
      },
    });
    return;
  }

  if (token !== config.authKey) {
    reply.status(401).send({
      error: {
        message: "Incorrect API key provided.",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });
    return;
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractToken(request);
  if (config.authKey && token !== config.authKey) {
    reply.status(403).send({
      error: {
        message: "Admin authentication required.",
        type: "permission_error",
        code: "forbidden",
      },
    });
    return;
  }
}
