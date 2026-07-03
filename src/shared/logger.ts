/**
 * Structured logger — outputs JSON in production, readable format in dev.
 * Supports pino-style API: logger.info({ key: val }, 'message') or logger.info('message')
 */

type LogData = Record<string, unknown>;

interface Logger {
  info(msg: string): void;
  info(data: LogData, msg: string): void;
  warn(msg: string): void;
  warn(data: LogData, msg: string): void;
  error(msg: string): void;
  error(data: LogData, msg: string): void;
  debug(msg: string): void;
  debug(data: LogData, msg: string): void;
  child(bindings: LogData): Logger;
}

const LOG_LEVELS: Record<string, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? 20;
const isDev = process.env.NODE_ENV !== 'production';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: string): boolean {
  return (LOG_LEVELS[level] ?? 20) >= currentLevel;
}

function createLogFn(
  level: string,
  name: string,
  bindings: LogData
): {
  (msg: string): void;
  (data: LogData, msg: string): void;
} {
  return (...args: [string] | [LogData, string]) => {
    if (!shouldLog(level)) return;

    let msg: string;
    let data: LogData = {};

    if (typeof args[0] === 'string') {
      msg = args[0];
    } else {
      data = args[0];
      msg = args[1] as string;
    }

    const entry = {
      timestamp: formatTimestamp(),
      level,
      name,
      msg,
      ...bindings,
      ...data,
    };

    if (isDev) {
      const levelColor: Record<string, string> = {
        debug: '\x1b[36m', // cyan
        info: '\x1b[32m',  // green
        warn: '\x1b[33m',  // yellow
        error: '\x1b[31m', // red
      };
      const reset = '\x1b[0m';
      const color = levelColor[level] || '';
      const extra = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      consoleFn(
        `${color}[${entry.timestamp}] ${level.toUpperCase().padEnd(5)} [${name}]${reset} ${msg}${extra}`
      );
    } else {
      const consoleFn = level === 'error' ? console.error : console.log;
      consoleFn(JSON.stringify(entry));
    }
  };
}

export function createLogger(name: string, parentBindings: LogData = {}): Logger {
  return {
    info: createLogFn('info', name, parentBindings) as Logger['info'],
    warn: createLogFn('warn', name, parentBindings) as Logger['warn'],
    error: createLogFn('error', name, parentBindings) as Logger['error'],
    debug: createLogFn('debug', name, parentBindings) as Logger['debug'],
    child(bindings: LogData): Logger {
      return createLogger(name, { ...parentBindings, ...bindings });
    },
  };
}

export const logger = createLogger('job-scheduler');
