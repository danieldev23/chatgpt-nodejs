import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middlewares/auth.js";
import {
  handleChatCompletion,
  handleChatCompletionStream,
  type ChatCompletionRequest,
} from "../../protocol/chatCompletion.js";
import {
  handleAnthropicMessage,
  handleAnthropicMessageStream,
  type AnthropicMessageRequest,
} from "../../protocol/anthropicMessages.js";
import { OpenAIBackendAPI } from "../../services/openaiBackend.js";
import { accountService } from "../../services/accountService.js";
import { logger } from "../../utils/logger.js";

export async function aiRoutes(fastify: FastifyInstance): Promise<void> {
  // 1. OpenAI Models
  fastify.get("/v1/models", { preHandler: requireAuth }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const account = await accountService.getAvailableAccount();
      const backend = new OpenAIBackendAPI(account?.access_token || "", account?.proxy);
      const models = await backend.listModels();
      return reply.send({ object: "list", data: models });
    } catch (err) {
      logger.error("List models error:", err);
      return reply.status(500).send({
        error: { message: (err as Error).message, type: "api_error" },
      });
    }
  });

  // 2. OpenAI Chat Completions
  fastify.post("/v1/chat/completions", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as ChatCompletionRequest;

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return reply.status(400).send({
        error: {
          message: "Request must include 'messages' array with at least one message.",
          type: "invalid_request_error",
        },
      });
    }

    if (body.stream) {
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");

      try {
        for await (const chunk of handleChatCompletionStream(body)) {
          reply.raw.write(chunk);
        }
      } catch (err) {
        logger.error("Stream write error:", err);
        reply.raw.write(
          `data: ${JSON.stringify({
            error: { message: (err as Error).message, type: "upstream_error" },
          })}\n\n`
        );
      } finally {
        reply.raw.end();
      }
      return;
    }

    try {
      const response = await handleChatCompletion(body);
      return reply.send(response);
    } catch (err) {
      logger.error("Non-stream error:", err);
      return reply.status(502).send({
        error: { message: (err as Error).message, type: "upstream_error" },
      });
    }
  });

  // 3. Anthropic Messages (/v1/messages)
  fastify.post("/v1/messages", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as AnthropicMessageRequest;

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return reply.status(400).send({
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "messages is required and must not be empty",
        },
      });
    }

    if (body.stream) {
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");

      try {
        for await (const chunk of handleAnthropicMessageStream(body)) {
          reply.raw.write(chunk);
        }
      } catch (err) {
        logger.error("Anthropic stream error:", err);
        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({
            type: "error",
            error: { type: "api_error", message: (err as Error).message },
          })}\n\n`
        );
      } finally {
        reply.raw.end();
      }
      return;
    }

    try {
      const response = await handleAnthropicMessage(body);
      return reply.send(response);
    } catch (err) {
      logger.error("Anthropic non-stream error:", err);
      return reply.status(502).send({
        type: "error",
        error: { type: "api_error", message: (err as Error).message },
      });
    }
  });

  // 4. OpenAI Search (/v1/search)
  fastify.post("/v1/search", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { prompt?: string };
    const prompt = body?.prompt || "";
    if (!prompt) {
      return reply.status(400).send({ error: { message: "Prompt is required" } });
    }

    try {
      const response = await handleChatCompletion({
        model: "auto",
        messages: [{ role: "user", content: prompt }],
      });
      return reply.send({
        object: "search.result",
        query: prompt,
        content: response.choices[0]?.message?.content || "",
      });
    } catch (err) {
      return reply.status(500).send({ error: { message: (err as Error).message } });
    }
  });

  // 5. OpenAI Responses (/v1/responses)
  fastify.post("/v1/responses", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { input?: unknown; model?: string; stream?: boolean };
    const inputText = typeof body.input === "string" ? body.input : JSON.stringify(body.input || "");

    const completion = await handleChatCompletion({
      model: body.model || "auto",
      messages: [{ role: "user", content: inputText }],
    });

    return reply.send({
      id: completion.id,
      object: "response",
      created: completion.created,
      model: completion.model,
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: completion.choices[0]?.message?.content || "" }],
        },
      ],
    });
  });
}
