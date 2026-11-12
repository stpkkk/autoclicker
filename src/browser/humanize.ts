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
 * Вставляем письмо целиком: посимвольная печать длинного текста
 * не укладывается в таймаут. После fill проверяем, что поле реально заполнено.
 */
export async function humanType(locator: Locator, text: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.click();
  await humanPause(300, 800);
  await locator.fill(text);
  await humanPause(300, 800);

  const isFormField = await locator
    .evaluate((node) => node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
    .catch(() => false);
  const actual = isFormField ? await locator.inputValue() : ((await locator.textContent()) ?? '');

  if (normalizeValue(actual) !== normalizeValue(text)) {
    throw new Error(
      `Сопроводительное письмо не вставилось полностью: в поле ${actual.length} симв., ` +
        `ожидалось ${text.length}.`,
    );
  }
}

function normalizeValue(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

export async function humanScroll(page: Page): Promise<void> {
  await page.mouse.wheel(0, randomInt(200, 600));
  await sleep(randomInt(300, 900));
}
