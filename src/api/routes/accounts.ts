import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAdmin } from "../middlewares/auth.js";
import { accountService } from "../../services/accountService.js";
import { OpenAIBackendAPI } from "../../services/openaiBackend.js";
import { logger } from "../../utils/logger.js";

export async function accountRoutes(fastify: FastifyInstance): Promise<void> {
  // 1. List accounts
  fastify.get("/api/accounts", { preHandler: requireAdmin }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const accounts = accountService.listAccounts();
    return reply.send({
      total: accounts.length,
      accounts: accounts.map((acc) => ({
        email: acc.email,
        access_token: acc.access_token.slice(0, 15) + "..." + acc.access_token.slice(-10),
        status: acc.status,
        type: acc.type,
        quota: acc.quota,
        created_at: acc.created_at,
        last_used_at: acc.last_used_at,
        last_refresh_error: acc.last_refresh_error,
      })),
    });
  });

  // 2. Add accounts / tokens
  fastify.post("/api/accounts", { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      tokens?: string[];
      accounts?: Array<{ access_token: string; refresh_token?: string; email?: string }>;
    };

    let count = 0;
    if (Array.isArray(body?.tokens) && body.tokens.length > 0) {
      count += accountService.addTokens(body.tokens);
    }
    if (Array.isArray(body?.accounts) && body.accounts.length > 0) {
      count += accountService.addAccounts(body.accounts);
    }

    return reply.send({
      ok: true,
      message: `Added/updated ${count} account(s).`,
      count,
    });
  });

  // 3. Delete accounts / tokens
  fastify.delete("/api/accounts", { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { tokens?: string[] };
    if (!Array.isArray(body?.tokens) || body.tokens.length === 0) {
      return reply.status(400).send({ error: { message: "tokens array is required" } });
    }

    const removed = accountService.removeTokens(body.tokens);
    return reply.send({
      ok: true,
      message: `Removed ${removed} account(s).`,
      removed,
    });
  });

  // 4. Refresh account tokens
  fastify.post("/api/accounts/refresh", { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { access_tokens?: string[] };
    const tokens = body?.access_tokens;

    if (!tokens || tokens.length === 0) {
      // Refresh all accounts
      const result = await accountService.refreshAllAccounts();
      return reply.send({
        ok: true,
        message: "Refreshed all accounts",
        ...result,
      });
    }

    const results = [];
    for (const t of tokens) {
      try {
        const refreshed = await accountService.refreshToken(t, true);
        results.push({ token: t, status: "success", new_token: refreshed?.access_token });
      } catch (err) {
        results.push({ token: t, status: "failed", error: (err as Error).message });
      }
    }

    return reply.send({
      ok: true,
      results,
    });
  });

  // 5. Account pool status summary
  fastify.get("/api/accounts/status", { preHandler: requireAdmin }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const all = accountService.listAccounts();
    const normal = all.filter((a) => a.status === "normal").length;
    const error = all.filter((a) => a.status === "error").length;
    const disabled = all.filter((a) => a.status === "disabled").length;

    return reply.send({
      total: all.length,
      normal,
      error,
      disabled,
    });
  });

  // 6. Test account connectivity
  fastify.post("/api/accounts/test", { preHandler: requireAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { access_token?: string };
    const token = body?.access_token;
    if (!token) {
      return reply.status(400).send({ error: { message: "access_token is required" } });
    }

    try {
      const backend = new OpenAIBackendAPI(token);
      const userInfo = await backend.getUserInfo();
      return reply.send({
        ok: true,
        user_info: userInfo,
      });
    } catch (err) {
      return reply.status(502).send({
        ok: false,
        error: (err as Error).message,
      });
    }
  });
}
