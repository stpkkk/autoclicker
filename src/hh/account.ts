import type { Page } from 'playwright';
import { detectGuard, waitForHuman } from '../browser/guards.js';
import { dismissCookieBanner } from '../browser/session.js';
import { logger } from '../utils/logger.js';
import { firstLocator, RESUME_SELECTORS } from './selectors.js';

export interface SessionCheckResult {
  authenticated: boolean;
  resumes: string[];
}

/**
 * Проверка сессии: открываем страницу резюме.
 * Если hh показывает форму логина — значит, cookie больше не действуют.
 */
export async function checkSession(page: Page): Promise<SessionCheckResult> {
  await page.goto('https://hh.ru/applicant/resumes', { waitUntil: 'domcontentloaded' });
  await dismissCookieBanner(page);

  let guard = await detectGuard(page);
  if (guard?.kind === 'captcha') {
    await waitForHuman(page, guard);
    guard = await detectGuard(page);
  }

  if (guard?.kind === 'auth') {
    return { authenticated: false, resumes: [] };
  }

  if (guard?.kind === 'limit' || guard?.kind === 'blocked') {
    logger.warn(`hh.ru вернул ограничение: ${guard.detail}`);
  }

  const titles = new Set<string>();

  for (const selector of RESUME_SELECTORS.title) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const text = (
        await locator
          .nth(index)
          .innerText()
          .catch(() => '')
      ).trim();
      if (text.length > 0) {
        titles.add(text);
      }
    }
  }

  if (titles.size === 0) {
    for (const selector of RESUME_SELECTORS.card) {
      const card = await firstLocator(page, [selector]);
      if (!card) {
        continue;
      }
      const text = (await card.innerText().catch(() => '')).trim();
      if (text.length > 0) {
        titles.add(text.split('\n')[0] ?? text);
      }
    }
  }

  return { authenticated: true, resumes: [...titles] };
}
