import type { Page } from 'playwright';
import {
  bodyText,
  firstVisibleLocator,
  LOGIN_SELECTORS,
  TEXT_INDICATORS,
} from '../hh/selectors.js';
import { logBanner, logger } from '../utils/logger.js';
import { sleep } from '../utils/sleep.js';

export type GuardKind = 'captcha' | 'auth' | 'limit' | 'blocked';
export type HardStopKind = 'limit' | 'blocked' | 'browser_closed' | 'consecutive_errors';

export interface GuardDetection {
  kind: GuardKind;
  detail: string;
}

export class AuthRequiredError extends Error {
  constructor(message = 'Требуется вход в hh.ru. Запустите `hh-autoapply login`.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export class HardStopError extends Error {
  constructor(
    public readonly kind: HardStopKind,
    message: string,
  ) {
    super(message);
    this.name = 'HardStopError';
  }
}

const CAPTCHA_SELECTORS = [
  '[data-qa="captcha"]',
  '[data-qa="captcha-form"]',
  '[data-qa*="captcha"]',
  'iframe[src*="captcha"]',
  'iframe[src*="recaptcha"]',
  'form[action*="captcha"]',
  '#captcha',
] as const;

const BLOCK_SELECTORS = [
  '[data-qa*="account-blocked"]',
  '[data-qa*="account-restricted"]',
  '[data-qa*="restriction"]',
] as const;

const AUTH_SELECTORS = [...LOGIN_SELECTORS.form] as const;

/**
 * Определяет ситуации, в которых нельзя продолжать автоматически.
 * Капчу НЕ обходим: возвращаем captcha, а вызывающий код ждёт человека.
 */
export async function detectGuard(page: Page): Promise<GuardDetection | null> {
  let url = '';
  try {
    url = page.url();
  } catch {
    return null;
  }

  if (/\/captcha(?:[/?]|$)/iu.test(url)) {
    return { kind: 'captcha', detail: 'URL страницы капчи' };
  }

  if (await firstVisibleLocator(page, CAPTCHA_SELECTORS)) {
    return { kind: 'captcha', detail: 'элемент капчи на странице' };
  }

  if (/\/account\/login/iu.test(url) || (await firstVisibleLocator(page, AUTH_SELECTORS))) {
    return { kind: 'auth', detail: 'форма входа / запрос авторизации' };
  }

  if (await firstVisibleLocator(page, BLOCK_SELECTORS)) {
    return { kind: 'blocked', detail: 'элемент ограничения аккаунта' };
  }

  const text = await bodyText(page);

  if (TEXT_INDICATORS.captcha.test(text)) {
    return { kind: 'captcha', detail: 'текст проверки «вы не робот»' };
  }
  if (TEXT_INDICATORS.limit.test(text)) {
    return { kind: 'limit', detail: 'сообщение о лимите откликов' };
  }
  if (TEXT_INDICATORS.blocked.test(text)) {
    return { kind: 'blocked', detail: 'сообщение об ограничении аккаунта' };
  }

  return null;
}

/**
 * Ждёт, пока человек решит капчу в открытом headed-браузере.
 * Никаких обходов, кликов по капче и подмены User-Agent.
 */
export async function waitForHuman(page: Page, detection: GuardDetection): Promise<void> {
  logBanner('Нужно действие человека');
  logger.warn(
    `Обнаружена проверка (${detection.detail}). Решите её вручную в открытом окне браузера. ` +
      'Приложение ждёт и ничего не нажимает.',
  );

  let lastNotice = Date.now();

  while (true) {
    if (page.isClosed()) {
      throw new HardStopError('browser_closed', 'Браузер закрыт, пока ожидалось действие человека');
    }

    const current = await detectGuard(page);

    if (!current) {
      logger.info('Проверка пройдена. Продолжаю работу.');
      return;
    }

    if (current.kind === 'captcha') {
      if (Date.now() - lastNotice > 30_000) {
        logger.warn('Всё ещё жду решения капчи в открытом окне браузера...');
        lastNotice = Date.now();
      }
      await sleep(2000);
      continue;
    }

    if (current.kind === 'auth') {
      throw new AuthRequiredError(
        'Сессия истекла или вход не выполнен. Запустите `hh-autoapply login`.',
      );
    }

    if (current.kind === 'limit') {
      throw new HardStopError('limit', 'hh.ru сообщает о достигнутом лимите откликов');
    }

    throw new HardStopError('blocked', 'hh.ru сообщает об ограничении аккаунта');
  }
}

/** Проверяет страницу перед действием и либо ждёт человека, либо останавливает процесс. */
export async function ensurePageReady(page: Page): Promise<void> {
  const detection = await detectGuard(page);
  if (!detection) {
    return;
  }

  if (detection.kind === 'captcha') {
    await waitForHuman(page, detection);
    await ensurePageReady(page);
    return;
  }

  if (detection.kind === 'auth') {
    throw new AuthRequiredError();
  }

  if (detection.kind === 'limit') {
    throw new HardStopError('limit', 'hh.ru сообщает о достигнутом лимите откликов');
  }

  throw new HardStopError('blocked', 'hh.ru сообщает об ограничении аккаунта');
}
