import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { aiRoutes } from "./routes/ai.js";
import { accountRoutes } from "./routes/accounts.js";
import { oauthRoutes } from "./routes/oauth.js";
import { systemRoutes } from "./routes/system.js";
import { logger } from "../utils/logger.js";

export function createServer(): FastifyInstance {
  const app = Fastify({
    logger: false, // We use custom structured logger
    bodyLimit: 50 * 1024 * 1024, // 50MB
  });

  // Enable CORS
  app.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["*"],
  });

  // Enable Multipart
  app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // Register routes
  app.register(aiRoutes);
  app.register(accountRoutes);
  app.register(oauthRoutes);
  app.register(systemRoutes);

  // Global error handler
  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
    logger.error("Unhandled error:", error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: {
        message: error.message || "Internal server error",
        type: "api_error",
        code: error.code || "internal_error",
      },
    });
  });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        message: `Endpoint ${request.method} ${request.url} not found.`,
        type: "invalid_request_error",
        code: "not_found",
      },
    });
  });

  return app;
}
