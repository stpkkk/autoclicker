import { describe, expect, it } from 'vitest';
import { calculateRemaining, HARD_DAILY_LIMIT, resolveDailyLimit } from '../src/core/limits.js';

describe('resolveDailyLimit', () => {
  it('берёт лимит из конфига, если --limit не задан', () => {
    expect(resolveDailyLimit(30)).toBe(30);
  });

  it('не превышает лимит из конфига', () => {
    expect(resolveDailyLimit(30, 50)).toBe(30);
  });

  it('позволяет уменьшить лимит через --limit', () => {
    expect(resolveDailyLimit(30, 10)).toBe(10);
  });

  it('жёстко ограничивает 100 откликами', () => {
    expect(resolveDailyLimit(100, 500)).toBe(HARD_DAILY_LIMIT);
    expect(resolveDailyLimit(100, 101)).toBe(100);
  });

  it('отклоняет некорректный лимит', () => {
    expect(() => resolveDailyLimit(30, 0)).toThrow();
    expect(() => resolveDailyLimit(30, 1.5)).toThrow();
  });
});

describe('calculateRemaining', () => {
  it('считает остаток и не уходит в минус', () => {
    expect(calculateRemaining(30, 12)).toBe(18);
    expect(calculateRemaining(30, 30)).toBe(0);
    expect(calculateRemaining(30, 42)).toBe(0);
  });
});
