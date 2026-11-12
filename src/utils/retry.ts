import { sleep } from './sleep.js';

export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * Небольшой ретрай для сетевых/навигационных операций.
 * Не используем его для отправки отклика: повторная отправка опаснее ошибки.
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 2;
  const delayMs = options.delayMs ?? 1500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      options.onRetry?.(error, attempt);
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
