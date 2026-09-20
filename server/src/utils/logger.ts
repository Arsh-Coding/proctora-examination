/* Tiny dependency-free logger with timestamps and levels. */

type Level = 'info' | 'warn' | 'error' | 'debug';

const COLORS: Record<Level, string> = {
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
};
const RESET = '\x1b[0m';

function write(level: Level, args: unknown[]): void {
  const stamp = new Date().toISOString().slice(11, 23);
  const tag = `${COLORS[level]}[${level.toUpperCase()}]${RESET}`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(`${stamp} ${tag}`, ...args);
}

export const logger = {
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') write('debug', args);
  },
};
