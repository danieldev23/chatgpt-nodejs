export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function formatTime(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHTS[level] >= LEVEL_WEIGHTS[currentLevel];
}

export const logger = {
  debug(message: string | Record<string, unknown>, ...args: unknown[]) {
    if (shouldLog("debug")) {
      console.debug(`[${formatTime()}] [DEBUG]`, typeof message === "string" ? message : JSON.stringify(message), ...args);
    }
  },
  info(message: string | Record<string, unknown>, ...args: unknown[]) {
    if (shouldLog("info")) {
      console.info(`[${formatTime()}] [INFO]`, typeof message === "string" ? message : JSON.stringify(message), ...args);
    }
  },
  warn(message: string | Record<string, unknown>, ...args: unknown[]) {
    if (shouldLog("warn")) {
      console.warn(`[${formatTime()}] [WARN]`, typeof message === "string" ? message : JSON.stringify(message), ...args);
    }
  },
  error(message: string | Record<string, unknown>, ...args: unknown[]) {
    if (shouldLog("error")) {
      console.error(`[${formatTime()}] [ERROR]`, typeof message === "string" ? message : JSON.stringify(message), ...args);
    }
  },
};
