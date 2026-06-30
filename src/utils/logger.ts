export type LogLevel = "debug" | "info" | "warn" | "error";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  scope: "\x1b[35m",
} as const;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LoggerOptions = {
  level?: LogLevel;
  colors?: boolean;
};

function resolveLogLevel(level?: LogLevel): LogLevel {
  const envLevel = process.env.LOG_LEVEL;
  if (level) {
    return level;
  }
  if (envLevel === "debug" || envLevel === "info" || envLevel === "warn" || envLevel === "error") {
    return envLevel;
  }
  return "info";
}

function shouldUseColors(colors?: boolean): boolean {
  if (colors !== undefined) {
    return colors;
  }
  return process.stdout.isTTY ?? false;
}

function formatMeta(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) {
    return "";
  }
  return ` ${JSON.stringify(data)}`;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly colors: boolean;

  constructor(
    private readonly scope: string,
    options: LoggerOptions = {},
  ) {
    this.level = resolveLogLevel(options.level);
    this.colors = shouldUseColors(options.colors);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.write("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.write("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.write("error", message, data);
  }

  private write(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const meta = formatMeta(data);

    if (!this.colors) {
      console.log(`[${timestamp}] ${level.toUpperCase()} [${this.scope}] ${message}${meta}`);
      return;
    }

    const line = `${COLORS.dim}${timestamp}${COLORS.reset} ${COLORS[level]}${level.toUpperCase()}${COLORS.reset} ${COLORS.scope}[${this.scope}]${COLORS.reset} ${message}${COLORS.dim}${meta}${COLORS.reset}`;
    console.log(line);
  }
}

export function createLogger(scope: string, options?: LoggerOptions): Logger {
  return new Logger(scope, options);
}
