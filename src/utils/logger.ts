import pino from 'pino';
import pretty from 'pino-pretty';

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const usePretty = !isTest && process.stdout.isTTY;

const options: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger = usePretty
  ? pino(
      options,
      // Поток pino-pretty в основном потоке и вывод через process.stdout:
      // так Node сам корректно пишет Unicode в консоль Windows,
      // в отличие от worker-транспорта, который пишет сырые UTF-8 байты.
      pretty({
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname',
        destination: process.stdout,
        sync: true,
      }),
    )
  : pino(options);

export function logBanner(message: string): void {
  logger.warn(`\n=== ${message} ===`);
}
