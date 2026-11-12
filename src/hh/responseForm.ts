import type { Locator, Page } from 'playwright';
import { humanClick, humanType } from '../browser/humanize.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/sleep.js';
import {
  bodyText,
  firstLocator,
  firstVisibleLocator,
  hasQuestionnaireForm,
  RESPONSE_SELECTORS,
  TEXT_INDICATORS,
  VACANCY_SELECTORS,
  waitForAny,
} from './selectors.js';

type Root = Page | Locator;

export interface ResponseForm {
  root: Root;
  isModal: boolean;
}

export interface ResumeSelectionResult {
  ok: boolean;
  selected?: string;
  reason?: string;
  options?: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function waitForResponseForm(
  page: Page,
  timeoutMs = 20_000,
): Promise<ResponseForm | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const popup = await firstVisibleLocator(page, RESPONSE_SELECTORS.popup);
    if (popup) {
      // Контейнер может появиться раньше полей — ждём поле письма или кнопку.
      const field = await waitForAny(
        popup,
        [...RESPONSE_SELECTORS.letter, ...RESPONSE_SELECTORS.submit],
        5000,
      );
      if (field) {
        return { root: popup, isModal: true };
      }
    }

    const letter = await firstVisibleLocator(page, RESPONSE_SELECTORS.letter);
    const submit = await firstVisibleLocator(page, RESPONSE_SELECTORS.submit);
    if (letter || submit) {
      return { root: page, isModal: false };
    }

    await sleep(250);
  }

  return null;
}

export async function responseFormHasQuestions(page: Page, form: ResponseForm): Promise<boolean> {
  if (await hasQuestionnaireForm(form.root)) {
    return true;
  }
  return TEXT_INDICATORS.questions.test(await bodyText(page));
}

async function findLetterToggle(root: Root): Promise<Locator | null> {
  const fromSelectors = await firstVisibleLocator(root, RESPONSE_SELECTORS.letterToggle);
  if (fromSelectors) {
    return fromSelectors;
  }

  for (const name of [
    /добавить сопроводительное/iu,
    /написать сопроводительное/iu,
    /добавить письмо/iu,
  ]) {
    const button = root.getByRole('button', { name }).first();
    try {
      if (await button.isVisible()) {
        return button;
      }
    } catch {
      // Кнопки может не быть — пробуем следующую.
    }
  }

  return null;
}

export async function fillCoverLetter(
  page: Page,
  form: ResponseForm,
  text: string,
): Promise<boolean> {
  let letter = await waitForAny(form.root, RESPONSE_SELECTORS.letter, 3000);

  if (!letter) {
    const toggle =
      (await findLetterToggle(form.root)) ?? (await findLetterToggle(page));
    if (toggle) {
      logger.info('Открываю поле сопроводительного письма');
      await humanClick(toggle);
      letter = await waitForAny(form.root, RESPONSE_SELECTORS.letter, 5000);
    }
  }

  if (!letter) {
    letter = await waitForAny(page, RESPONSE_SELECTORS.letter, 1000);
  }

  if (!letter) {
    return false;
  }

  logger.info('Заполняю сопроводительное письмо');
  await humanType(letter, text);
  return true;
}

/**
 * Выбирает резюме по названию, если на форме есть выбор.
 * TODO: подтвердить селекторы кастомного дропдауна на своём аккаунте (doctor).
 */
export async function selectResume(
  page: Page,
  form: ResponseForm,
  resumeName?: string,
): Promise<ResumeSelectionResult> {
  const select =
    (await firstLocator(form.root, RESPONSE_SELECTORS.resumeSelect)) ??
    (await firstLocator(page, RESPONSE_SELECTORS.resumeSelect));

  if (select) {
    const tagName = await select.evaluate((element) => element.tagName.toLowerCase());
    if (tagName === 'select') {
      const options = await select.locator('option').allTextContents();
      if (!resumeName) {
        const selected = await select
          .locator('option:checked')
          .first()
          .innerText()
          .catch(() => '');
        return { ok: true, selected: selected.trim() || undefined, options };
      }

      const option = select.locator('option').filter({ hasText: resumeName }).first();
      if ((await option.count()) === 0) {
        return { ok: false, reason: 'resume_not_found', options };
      }

      const value = await option.getAttribute('value');
      if (value !== null) {
        await select.selectOption(value);
      } else {
        await select.selectOption({ label: (await option.innerText()).trim() });
      }

      return { ok: true, selected: (await option.innerText()).trim(), options };
    }
  }

  const trigger =
    (await firstVisibleLocator(form.root, RESPONSE_SELECTORS.resumeTrigger)) ??
    (await firstVisibleLocator(page, RESPONSE_SELECTORS.resumeTrigger));

  if (!trigger || !resumeName) {
    return { ok: true };
  }

  await humanClick(trigger);
  const option = page
    .getByRole('option', { name: new RegExp(escapeRegExp(resumeName), 'iu') })
    .first();
  try {
    if ((await option.count()) === 0) {
      await page.keyboard.press('Escape').catch(() => undefined);
      return { ok: false, reason: 'resume_not_found' };
    }
    await humanClick(option);
    return { ok: true, selected: resumeName };
  } catch {
    await page.keyboard.press('Escape').catch(() => undefined);
    return { ok: false, reason: 'resume_not_found' };
  }
}

export async function clickSubmit(page: Page, form: ResponseForm): Promise<boolean> {
  const submit =
    (await waitForAny(form.root, RESPONSE_SELECTORS.submit, 3000)) ??
    (await waitForAny(page, RESPONSE_SELECTORS.submit, 1000)) ??
    (await firstLocator(form.root, ['button:has-text("Отправить отклик")']));

  if (!submit) {
    return false;
  }

  logger.warn('Нажимаю кнопку отправки отклика');
  await humanClick(submit);
  return true;
}

/**
 * После нажатия «Отправить» проверяем, что hh действительно подтвердил отклик.
 * Не считаем успехом просто исчезнувшую форму — ждём текст/статус успеха.
 */
export async function waitForSubmitSuccess(
  page: Page,
  form: ResponseForm,
  timeoutMs = 25_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await firstVisibleLocator(page, RESPONSE_SELECTORS.success)) {
      return true;
    }

    if (TEXT_INDICATORS.success.test(await bodyText(page))) {
      return true;
    }

    await sleep(500);
  }

  logger.warn(
    `Не дождался подтверждения отправки. Форма: ${form.isModal ? 'модальная' : 'страница'}`,
  );
  return false;
}

export async function closeResponseForm(page: Page, form: ResponseForm): Promise<void> {
  const popup = await firstVisibleLocator(page, RESPONSE_SELECTORS.popup);
  if (popup) {
    const close = await firstVisibleLocator(page, RESPONSE_SELECTORS.cancel);
    if (close) {
      await close.click().catch(() => undefined);
    }
    await page.keyboard.press('Escape').catch(() => undefined);
    return;
  }

  if (!form.isModal && /vacancy_response|\/response/iu.test(page.url())) {
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
  }
}

export async function hasAuthFormOnPage(page: Page): Promise<boolean> {
  // data-qa="auth-form" на странице вакансии означает, что hh просит телефон
  // у анонимного пользователя. Для залогиненного аккаунта этой формы быть не должно.
  return (await firstVisibleLocator(page, VACANCY_SELECTORS.authForm)) !== null;
}
