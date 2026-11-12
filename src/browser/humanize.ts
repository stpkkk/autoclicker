import type { Locator, Page } from 'playwright';
import { randomInt, sleep, sleepRandom } from '../utils/sleep.js';

/** Пауза «как человек»: по умолчанию 2–6 секунд. */
export function humanPause(minMs = 2000, maxMs = 6000): Promise<void> {
  return sleepRandom(minMs, maxMs);
}

export async function humanClick(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await sleepRandom(400, 1200);
  await locator.click();
}

/**
 * Печатаем письмо посимвольно с человеческой задержкой.
 * Для длинного текста это медленно, зато не похоже на мгновенный `fill`.
 */
export async function humanType(locator: Locator, text: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.click();
  await locator.fill('').catch(() => undefined);
  await locator.pressSequentially(text, { delay: randomInt(15, 40) });
}

export async function humanScroll(page: Page): Promise<void> {
  await page.mouse.wheel(0, randomInt(200, 600));
  await sleep(randomInt(300, 900));
}
