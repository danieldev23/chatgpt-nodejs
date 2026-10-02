import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAdmin } from "../middlewares/auth.js";
import { oauthService } from "../../services/oauthService.js";
import { accountService } from "../../services/accountService.js";
import { logger } from "../../utils/logger.js";

export async function oauthRoutes(fastify: FastifyInstance): Promise<void> {
  // 1. Start OAuth login
  fastify.post("/api/accounts/oauth/start", { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { email_hint?: string };
    try {
      const result = oauthService.start(body?.email_hint || "");
      return reply.send({
        ok: true,
        session_id: result.sessionId,
        authorize_url: result.authorizeUrl,
      });
    } catch (err) {
      logger.error("OAuth start error:", err);
      return reply.status(500).send({ error: { message: (err as Error).message } });
    }
  });

  // 2. Finish OAuth login
  fastify.post("/api/accounts/oauth/finish", { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { session_id?: string; callback?: string; code?: string };
    const sessionId = body?.session_id || "";
    const callback = body?.callback || body?.code || "";

    if (!callback) {
      return reply.status(400).send({ error: { message: "callback (URL or code) is required" } });
    }

    try {
      const tokens = await oauthService.finish(sessionId, callback);
      accountService.addAccounts([
        {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        },
      ]);

      return reply.send({
        ok: true,
        message: "Account authenticated and added successfully",
        tokens: {
          access_token: tokens.access_token.slice(0, 15) + "...",
          refresh_token: tokens.refresh_token ? tokens.refresh_token.slice(0, 15) + "..." : "",
        },
      });
    } catch (err) {
      logger.error("OAuth finish error:", err);
      return reply.status(400).send({ error: { message: (err as Error).message } });
    }
  });
}
