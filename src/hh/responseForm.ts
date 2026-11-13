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
  RESUME_TRIGGER_ANCESTOR,
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

function normalizeResumeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Видимое название выбранного резюме вне выпадающего списка.
 * В открытом magritte-дропдауне тоже есть [data-qa="resume-title"], их пропускаем.
 */
async function findVisibleResumeTitle(root: Root): Promise<Locator | null> {
  const titles = root.locator(RESPONSE_SELECTORS.resumeTitle[0]);
  const count = await titles.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const title = titles.nth(index);
    try {
      if (!(await title.isVisible())) {
        continue;
      }
      const insideOptionList = await title.evaluate((node) =>
        Boolean(
          node.closest(
            '[role="listbox"], [data-qa="drop-base"], [data-qa="magritte-select-option-list"]',
          ),
        ),
      );
      if (!insideOptionList) {
        return title;
      }
    } catch {
      // Элемент мог исчезнуть между count и isVisible — идём дальше.
    }
  }

  return null;
}

async function readSelectedResume(root: Root): Promise<string | undefined> {
  const select = await firstLocator(root, RESPONSE_SELECTORS.resumeSelect);
  if (select) {
    const tagName = await select
      .evaluate((element) => element.tagName.toLowerCase())
      .catch(() => '');
    if (tagName === 'select') {
      const text = normalizeResumeName(
        await select
          .locator('option:checked')
          .first()
          .innerText()
          .catch(() => ''),
      );
      if (text) {
        return text;
      }
    }
  }

  const title = await findVisibleResumeTitle(root);
  if (!title) {
    return undefined;
  }

  const text = normalizeResumeName(await title.innerText().catch(() => ''));
  return text || undefined;
}

async function waitForSelectedResume(
  root: Root,
  expected: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  let last: string | undefined;

  while (Date.now() < deadline) {
    last = await readSelectedResume(root);
    if (last && normalizeResumeName(last) === expected) {
      return last;
    }
    await sleep(200);
  }

  return last;
}

async function findResumeTrigger(root: Root): Promise<Locator | null> {
  const fromSelectors = await firstVisibleLocator(root, RESPONSE_SELECTORS.resumeTrigger);
  if (fromSelectors) {
    return fromSelectors;
  }

  const title = await findVisibleResumeTitle(root);
  if (!title) {
    return null;
  }

  const button = title.locator(RESUME_TRIGGER_ANCESTOR);
  if ((await button.count().catch(() => 0)) > 0) {
    return button.first();
  }

  return null;
}

function findResumeOptionIndex(options: string[], desired: string): number {
  let index = options.findIndex((option) => option === desired);
  if (index < 0) {
    const desiredLower = desired.toLowerCase();
    index = options.findIndex((option) => option.toLowerCase() === desiredLower);
  }
  return index;
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
    const toggle = (await findLetterToggle(form.root)) ?? (await findLetterToggle(page));
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
 * Выбирает резюме по названию и проверяет, что выбор действительно применился.
 * На hh это кастомный magritte-дропдаун: [data-qa="resume-title"] внутри
 * role="button", опции — [role="option"] в портале drop-base.
 */
export async function selectResume(
  page: Page,
  form: ResponseForm,
  resumeName?: string,
): Promise<ResumeSelectionResult> {
  const desired = resumeName ? normalizeResumeName(resumeName) : '';
  const select =
    (await firstLocator(form.root, RESPONSE_SELECTORS.resumeSelect)) ??
    (await firstLocator(page, RESPONSE_SELECTORS.resumeSelect));

  if (select) {
    const tagName = await select.evaluate((element) => element.tagName.toLowerCase());
    if (tagName === 'select') {
      const optionLocator = select.locator('option');
      const optionCount = await optionLocator.count();
      const options: string[] = [];

      for (let index = 0; index < optionCount; index += 1) {
        options.push(
          normalizeResumeName(
            await optionLocator
              .nth(index)
              .innerText()
              .catch(() => ''),
          ),
        );
      }

      if (!desired) {
        return { ok: true, selected: await readSelectedResume(form.root), options };
      }

      const targetIndex = findResumeOptionIndex(options, desired);
      if (targetIndex < 0) {
        return {
          ok: false,
          reason: 'resume_mismatch',
          selected: await readSelectedResume(form.root),
          options,
        };
      }

      const option = optionLocator.nth(targetIndex);
      const value = await option.getAttribute('value');
      if (value !== null) {
        await select.selectOption(value);
      } else {
        await select.selectOption({ label: (await option.innerText()).trim() });
      }

      const selected = await waitForSelectedResume(form.root, desired, 5000);
      if (!selected || normalizeResumeName(selected) !== desired) {
        return { ok: false, reason: 'resume_mismatch', selected, options };
      }
      return { ok: true, selected, options };
    }
  }

  const trigger = (await findResumeTrigger(form.root)) ?? (await findResumeTrigger(page));
  const current = (await readSelectedResume(form.root)) ?? (await readSelectedResume(page));

  // Выбора нет (одно резюме) — работаем как раньше.
  if (!trigger) {
    return { ok: true, selected: current };
  }

  if (!desired) {
    return { ok: true, selected: current };
  }

  if (current && normalizeResumeName(current) === desired) {
    return { ok: true, selected: current };
  }

  await humanClick(trigger);

  const optionList = await waitForAny(page, RESPONSE_SELECTORS.resumeOptionList, 5000);
  if (!optionList) {
    const afterClick = (await readSelectedResume(form.root)) ?? (await readSelectedResume(page));
    if (afterClick && normalizeResumeName(afterClick) !== desired) {
      await page.keyboard.press('Escape').catch(() => undefined);
      return { ok: false, reason: 'resume_mismatch', selected: afterClick };
    }
    return { ok: true, selected: afterClick };
  }

  const optionLocator = optionList.locator('[role="option"]');
  const optionCount = await optionLocator.count().catch(() => 0);
  const options: string[] = [];

  for (let index = 0; index < optionCount; index += 1) {
    const option = optionLocator.nth(index);
    const optionTitle = option.locator(RESPONSE_SELECTORS.resumeTitle[0]).first();
    const text =
      (await optionTitle.count().catch(() => 0)) > 0
        ? await optionTitle.innerText().catch(() => '')
        : await option.innerText().catch(() => '');
    options.push(normalizeResumeName(text));
  }

  if (optionCount === 0) {
    const afterClick = (await readSelectedResume(form.root)) ?? (await readSelectedResume(page));
    if (afterClick && normalizeResumeName(afterClick) !== desired) {
      await page.keyboard.press('Escape').catch(() => undefined);
      return { ok: false, reason: 'resume_mismatch', selected: afterClick };
    }
    return { ok: true, selected: afterClick };
  }

  const targetIndex = findResumeOptionIndex(options, desired);
  if (targetIndex < 0) {
    await page.keyboard.press('Escape').catch(() => undefined);
    return { ok: false, reason: 'resume_mismatch', selected: current, options };
  }

  await humanClick(optionLocator.nth(targetIndex));

  const selected =
    (await waitForSelectedResume(form.root, desired, 5000)) ??
    (await waitForSelectedResume(page, desired, 1000));

  if (!selected || normalizeResumeName(selected) !== desired) {
    await page.keyboard.press('Escape').catch(() => undefined);
    return { ok: false, reason: 'resume_mismatch', selected, options };
  }

  return { ok: true, selected, options };
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
