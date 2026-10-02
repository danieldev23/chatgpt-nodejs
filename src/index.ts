import { createServer } from "./api/server.js";
import { config } from "./services/config.service.js";
import { logger } from "./utils/logger.util.js";
import { accountService } from "./services/account.service.js";

async function main() {
  const app = createServer();

  const accounts = accountService.listAccounts();
  logger.info(`Starting ChatGPT-Nodejs REST API server on port ${config.port}...`);
  logger.info(`Configured account pool size: ${accounts.length}`);
  if (config.authKey) {
    logger.info("Admin authentication key configured.");
  } else {
    logger.warn("No CHATGPT2API_AUTH_KEY set! API endpoints will be publicly accessible.");
  }

  // Start background auto-refresh worker for account tokens
  accountService.startBackgroundRefresh();

  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
    logger.info(`🚀 Server listening at http://0.0.0.0:${config.port}`);
  } catch (err) {
    logger.error("Failed to start server:", err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);
    accountService.stopBackgroundRefresh();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
