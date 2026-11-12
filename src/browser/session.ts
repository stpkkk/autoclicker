import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { logger } from '../utils/logger.js';

export const PROFILE_DIR = path.resolve(process.cwd(), '.browser-profile');
export const HH_HOME_URL = 'https://hh.ru/';

export interface BrowserSession {
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

/**
 * Persistent context — единственный способ входа без хранения пароля.
 * Cookie и localStorage лежат в .browser-profile/ (в .gitignore).
 * Headed-режим обязателен: человек должен видеть окно и решать капчу сам.
 */
export async function openSession(): Promise<BrowserSession> {
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1440, height: 900 },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      colorScheme: 'light',
      acceptDownloads: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Не удалось открыть профиль браузера (${PROFILE_DIR}).\n` +
        'Возможно, приложение уже запущено или профиль занят другим процессом.\n' +
        `Детали: ${message}`,
    );
  }

  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(60_000);

  const page = context.pages()[0] ?? (await context.newPage());

  return {
    context,
    page,
    close: async () => {
      try {
        await context.close();
      } catch {
        // Контекст мог быть уже закрыт пользователем — это нормально.
      }
    },
  };
}

export async function dismissCookieBanner(page: Page): Promise<void> {
  const button = page.locator('[data-qa="cookies-policy-informer-accept"]').first();
  try {
    if (await button.isVisible()) {
      logger.debug('Закрываю баннер cookies');
      await button.click();
    }
  } catch {
    // Баннера может не быть — не считаем это ошибкой.
  }
}
