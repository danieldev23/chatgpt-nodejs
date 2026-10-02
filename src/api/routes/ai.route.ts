import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  handleChatCompletion,
  handleChatCompletionStream,
  type ChatCompletionRequest,
} from "../../protocol/chat-completion.protocol.js";
import {
  handleAnthropicMessage,
  handleAnthropicMessageStream,
  type AnthropicMessageRequest,
} from "../../protocol/anthropic-messages.protocol.js";
import {
  handleImageGeneration,
  type ImageGenerationRequest,
} from "../../protocol/images.protocol.js";
import { handleCompletion, type CompletionRequest } from "../../protocol/completions.protocol.js";
import { handleEmbeddings, type EmbeddingRequest } from "../../protocol/embeddings.protocol.js";
import { handleModeration, type ModerationRequest } from "../../protocol/moderation.protocol.js";
import {
  handleSpeech,
  handleTranscription,
  handleTranslation,
  type SpeechRequest,
} from "../../protocol/audio.protocol.js";
import {
  listFiles,
  uploadFile,
  getFile,
  deleteFile,
  getFileContent,
} from "../../protocol/files.protocol.js";
import {
  createAssistant,
  listAssistants,
  getAssistant,
  deleteAssistant,
  createVectorStore,
  listVectorStores,
  createBatch,
  listBatches,
  createFineTuningJob,
  listFineTuningJobs,
} from "../../protocol/assistants.protocol.js";
import { OpenAIBackendAPI } from "../../services/openai-backend.service.js";
import { accountService } from "../../services/account.service.js";
import { logger } from "../../utils/logger.util.js";

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

  // 3. Image Generations (/v1/images/generations)
  fastify.post("/v1/images/generations", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as ImageGenerationRequest;
    if (!body || !body.prompt) {
      return reply.status(400).send({ error: { message: "prompt is required" } });
    }

    try {
      const result = await handleImageGeneration(body);
      return reply.send(result);
    } catch (err) {
      logger.error("Image generation error:", err);
      return reply.status(502).send({ error: { message: (err as Error).message } });
    }
  });

  // 4. Image Edits (/v1/images/edits)
  fastify.post("/v1/images/edits", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      let prompt = "";
      if (req.isMultipart()) {
        const parts = req.parts();
        for await (const part of parts) {
          if (part.type === "field" && part.fieldname === "prompt") {
            prompt = part.value as string;
          }
        }
      } else {
        prompt = (req.body as { prompt?: string })?.prompt || "";
      }

      if (!prompt) {
        return reply.status(400).send({ error: { message: "prompt is required for image edits" } });
      }

      const result = await handleImageGeneration({ prompt, model: "gpt-image-2" });
      return reply.send(result);
    } catch (err) {
      logger.error("Image edit error:", err);
      return reply.status(502).send({ error: { message: (err as Error).message } });
    }
  });

  // 5. Legacy Completions (/v1/completions)
  fastify.post("/v1/completions", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as CompletionRequest;
    if (!body || !body.prompt) {
      return reply.status(400).send({ error: { message: "prompt is required" } });
    }

    try {
      const result = await handleCompletion(body);
      return reply.send(result);
    } catch (err) {
      logger.error("Completion error:", err);
      return reply.status(502).send({ error: { message: (err as Error).message } });
    }
  });

  // 6. Embeddings (/v1/embeddings)
  fastify.post("/v1/embeddings", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as EmbeddingRequest;
    if (!body || !body.input) {
      return reply.status(400).send({ error: { message: "input is required" } });
    }

    const result = handleEmbeddings(body);
    return reply.send(result);
  });

  // 7. Moderations (/v1/moderations)
  fastify.post("/v1/moderations", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as ModerationRequest;
    if (!body || !body.input) {
      return reply.status(400).send({ error: { message: "input is required" } });
    }

    const result = handleModeration(body);
    return reply.send(result);
  });

  // 8. Audio Speech (/v1/audio/speech)
  fastify.post("/v1/audio/speech", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as SpeechRequest;
    if (!body || !body.input) {
      return reply.status(400).send({ error: { message: "input is required" } });
    }

    try {
      const audioBuffer = await handleSpeech(body);
      reply.header("Content-Type", "audio/mpeg");
      return reply.send(audioBuffer);
    } catch (err) {
      logger.error("Speech generation error:", err);
      return reply.status(502).send({ error: { message: (err as Error).message } });
    }
  });

  // 9. Audio Transcriptions (/v1/audio/transcriptions)
  fastify.post("/v1/audio/transcriptions", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    let filename = "audio.mp3";
    if (req.isMultipart()) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          filename = part.filename || filename;
        }
      }
    }
    const result = handleTranscription(filename);
    return reply.send(result);
  });

  // 10. Audio Translations (/v1/audio/translations)
  fastify.post("/v1/audio/translations", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    let filename = "audio.mp3";
    if (req.isMultipart()) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          filename = part.filename || filename;
        }
      }
    }
    const result = handleTranslation(filename);
    return reply.send(result);
  });

  // 11. Files API
  fastify.get("/v1/files", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { purpose?: string };
    return reply.send(listFiles(query?.purpose));
  });

  fastify.post("/v1/files", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.isMultipart()) {
      return reply.status(400).send({ error: { message: "multipart form data required" } });
    }

    let filename = "upload.bin";
    let purpose = "user_data";
    let fileBuffer: Buffer | null = null;

    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file") {
        filename = part.filename || filename;
        fileBuffer = await part.toBuffer();
      } else if (part.type === "field" && part.fieldname === "purpose") {
        purpose = String(part.value || purpose);
      }
    }

    if (!fileBuffer) {
      return reply.status(400).send({ error: { message: "file is required" } });
    }

    const result = uploadFile(fileBuffer, filename, purpose);
    return reply.send(result);
  });

  fastify.get("/v1/files/:file_id", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { file_id } = req.params as { file_id: string };
    try {
      return reply.send(getFile(file_id));
    } catch (err) {
      return reply.status(404).send({ error: { message: (err as Error).message } });
    }
  });

  fastify.delete("/v1/files/:file_id", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { file_id } = req.params as { file_id: string };
    try {
      return reply.send(deleteFile(file_id));
    } catch (err) {
      return reply.status(404).send({ error: { message: (err as Error).message } });
    }
  });

  fastify.get("/v1/files/:file_id/content", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { file_id } = req.params as { file_id: string };
    try {
      const content = getFileContent(file_id);
      reply.header("Content-Type", "application/octet-stream");
      return reply.send(content);
    } catch (err) {
      return reply.status(404).send({ error: { message: (err as Error).message } });
    }
  });

  // 12. Assistants API
  fastify.post("/v1/assistants", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(createAssistant((req.body as Record<string, unknown>) || {}));
  });

  fastify.get("/v1/assistants", { preHandler: requireAuth }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(listAssistants());
  });

  fastify.get("/v1/assistants/:id", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.send(getAssistant(id));
    } catch (err) {
      return reply.status(404).send({ error: { message: (err as Error).message } });
    }
  });

  fastify.delete("/v1/assistants/:id", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      return reply.send(deleteAssistant(id));
    } catch (err) {
      return reply.status(404).send({ error: { message: (err as Error).message } });
    }
  });

  // 13. Vector Stores API
  fastify.post("/v1/vector_stores", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(createVectorStore((req.body as Record<string, unknown>) || {}));
  });

  fastify.get("/v1/vector_stores", { preHandler: requireAuth }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(listVectorStores());
  });

  // 14. Batches API
  fastify.post("/v1/batches", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(createBatch((req.body as Record<string, unknown>) || {}));
  });

  fastify.get("/v1/batches", { preHandler: requireAuth }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(listBatches());
  });

  // 15. Fine-Tuning Jobs API
  fastify.post("/v1/fine_tuning/jobs", { preHandler: requireAuth }, async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(createFineTuningJob((req.body as Record<string, unknown>) || {}));
  });

  fastify.get("/v1/fine_tuning/jobs", { preHandler: requireAuth }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(listFineTuningJobs());
  });

  // 16. Anthropic Messages (/v1/messages)
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

  // 17. OpenAI Search (/v1/search)
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

  // 18. OpenAI Responses (/v1/responses)
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
