import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../../services/config.service.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.middleware.js";

export async function systemRoutes(fastify: FastifyInstance): Promise<void> {
  // 1. Version
  fastify.get("/version", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ version: config.appVersion });
  });

  // 2. Health check
  fastify.get("/health", async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: "healthy", version: config.appVersion });
  });

  // 3. Admin login check
  fastify.post("/auth/login", { preHandler: requireAuth }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      ok: true,
      version: config.appVersion,
      role: "admin",
      name: "Admin",
    });
  });

  // 4. Settings
  fastify.get("/api/settings", { preHandler: requireAdmin }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      config: {
        port: config.port,
        storage_backend: config.storageBackend,
        has_auth_key: !!config.authKey,
        has_proxy: !!config.proxyUrl,
        version: config.appVersion,
      },
    });
  });
}
