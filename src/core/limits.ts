export const HARD_DAILY_LIMIT = 100;

/**
 * Итоговый лимит на запуск = min(лимит из конфига, --limit, жёсткий максимум 100).
 * Даже если пользователь передаст --limit 500, приложение остановится на 100.
 */
export function resolveDailyLimit(configLimit: number, cliLimit?: number): number {
  const requested = cliLimit ?? configLimit;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error('Лимит должен быть целым положительным числом');
  }
  return Math.min(requested, configLimit, HARD_DAILY_LIMIT);
}

export function calculateRemaining(limit: number, sentToday: number): number {
  return Math.max(0, limit - sentToday);
}
