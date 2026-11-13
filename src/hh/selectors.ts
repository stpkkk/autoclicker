import type { Locator, Page } from 'playwright';
import { sleep } from '../utils/sleep.js';

/**
 * ВСЕ селекторы hh.ru собраны здесь.
 *
 * Правило: сначала data-qa, затем role/text, и только в крайнем случае —
 * короткие CSS-классы. Хрупкие цепочки вида div > div:nth-child(3) не используем.
 *
 * Публичные страницы (поиск, карточка вакансии) проверены через Playwright
 * 12.11.2026. Форма отклика доступна только после входа, поэтому её селекторы
 * помечены TODO: их нужно подтвердить командой `doctor` на своём аккаунте.
 */

type Root = Page | Locator;

export const SEARCH_CARD_SELECTOR = '[data-qa="vacancy-serp__vacancy"]';

export const SEARCH_SELECTORS = {
  results: ['[data-qa="vacancy-serp__results"]'],
  card: [SEARCH_CARD_SELECTOR],
  titleText: [
    '[data-qa="serp-item__title-text"]',
    '[data-qa="serp-item__title"]',
    '[data-qa="vacancy-serp__vacancy-title"]',
  ],
  titleLink: ['[data-qa="serp-item__title"]', '[data-qa="vacancy-serp__vacancy-title"]'],
  company: [
    '[data-qa="vacancy-serp__vacancy-employer-text"]',
    '[data-qa="vacancy-serp__vacancy-employer"]',
  ],
  // В новом макете зарплата часто без data-qa — её дополнительно парсим из текста карточки.
  salary: ['[data-qa="vacancy-serp__vacancy-compensation"]'],
  snippet: [
    '[data-qa="vacancy-serp__vacancy_snippet_responsibility"]',
    '[data-qa="vacancy-serp__vacancy_snippet_requirement"]',
  ],
  address: [
    '[data-qa="vacancy-serp__vacancy-address"]',
    '[data-qa="vacancy-serp__vacancy-address-with-subway-collection"]',
  ],
  remote: ['[data-qa="vacancy-label-work-schedule-remote"]'],
  response: ['[data-qa="vacancy-serp__vacancy_response"]'],
  alreadyResponse: ['[data-qa="vacancy-serp__vacancy_response"][aria-disabled="true"]'],
  noResume: ['[data-qa="vacancy-label-no-resume"]'],
  empty: [
    '[data-qa="vacancy-serp__vacancy-empty"]',
    'text=/ничего не найдено|вакансий не найдено/i',
  ],
  pager: ['[data-qa="pager-page"]'],
} as const;

/**
 * Реальная анкета/тест работодателя. Не путать с `[data-qa^="vacancy-response-question"]`:
 * это подсказки «Задайте вопрос работодателю», а не обязательные вопросы.
 */
export const QUESTIONNAIRE_SELECTORS = [
  '[data-qa="vacancy-response-form-questions"]',
  '[data-qa*="questionnaire"]',
  '[data-qa*="employer-question"]',
  '[data-qa*="anketa"]',
  '[data-qa*="task-question"]',
] as const;

export const VACANCY_SELECTORS = {
  title: ['[data-qa="vacancy-title"]'],
  company: ['[data-qa="vacancy-company-name"]'],
  salary: ['[data-qa="vacancy-salary"]', '[data-qa="vacancy-salary-compensation-type"]'],
  description: ['[data-qa="vacancy-description"]'],
  location: [
    '[data-qa="vacancy-view-raw-address"]',
    '[data-qa="vacancy-view-location"]',
    '[data-qa="vacancy-address"]',
  ],
  hiringFormats: ['[data-qa="vacancy-hiring-formats"]', '[data-qa="work-formats-text"]'],
  remoteBadges: [
    '[data-qa="vacancy-view-remote-work"]',
    '[data-qa="vacancy-label-work-schedule-remote"]',
  ],
  responseTop: ['[data-qa="vacancy-response-link-top"]'],
  responseBottom: ['[data-qa="vacancy-response-link-bottom"]'],
  alreadyApplied: [
    '[data-qa="vacancy-response-already-applied"]',
    '[data-qa="vacancy-response-link-top"][aria-disabled="true"]',
    '[data-qa="vacancy-response-link-top"][disabled]',
  ],
  questions: QUESTIONNAIRE_SELECTORS,
  authForm: ['[data-qa="auth-form"]', '[data-qa="account-login-form"]'],
} as const;

export const RESPONSE_SELECTORS = {
  // TODO: подтвердить на аккаунте после `login`.
  popup: [
    '[data-qa="vacancy-response-popup"]',
    '[data-qa="vacancy-response-popup-form"]',
    '[role="dialog"]',
  ],
  letter: [
    '[data-qa="vacancy-response-popup-form-letter-input"]',
    '[data-qa="vacancy-response-form-letter-input"]',
    'textarea[name="letter"]',
    'textarea[data-qa*="letter"]',
    '[contenteditable="true"][data-qa*="letter"]',
  ],
  letterToggle: [
    '[data-qa="vacancy-response-popup-form-add-cover-letter"]',
    '[data-qa="vacancy-response-popup-form-letter-toggle"]',
    'button:has-text("Добавить сопроводительное")',
    '[role="button"]:has-text("Добавить сопроводительное")',
    'button:has-text("Написать сопроводительное")',
    '[role="button"]:has-text("Написать сопроводительное")',
    'button:has-text("Добавить письмо")',
  ],
  submit: ['[data-qa="vacancy-response-submit-popup"]', '[data-qa="vacancy-response-submit"]'],
  cancel: [
    '[data-qa="vacancy-response-popup-close"]',
    '[data-qa="vacancy-response-popup-cancel"]',
    'button[aria-label="Закрыть"]',
    'button:has-text("Отмена")',
  ],
  resumeSelect: [
    '[data-qa="vacancy-response-resume-select"]',
    '[data-qa="vacancy-response-popup-form-resume"] select',
    'select[name="resume"]',
    'select[data-qa*="resume"]',
  ],
  // Резюме в модалке — кастомный magritte-select, а не <select>.
  // Видимое название резюме лежит в [data-qa="resume-title"], кликабельный
  // контейнер — его ближайший предок с role="button".
  resumeTitle: ['[data-qa="resume-title"]'],
  resumeTrigger: [
    '[data-qa="vacancy-response-resume-select"]',
    '[data-qa="resume-select"]',
    '[data-qa*="resume"] [role="button"]',
  ],
  // Список опций рендерится в портал (drop-base), вне контейнера модалки.
  resumeOptionList: [
    '[data-qa="magritte-select-option-list"]',
    '[data-qa="drop-base"]',
    '[role="listbox"]',
  ],
  success: ['[data-qa="vacancy-response-success"]', '[data-qa="vacancy-response-popup-success"]'],
} as const;

/** От [data-qa="resume-title"] к кликабельному контейнеру magritte-select. */
export const RESUME_TRIGGER_ANCESTOR = 'xpath=ancestor::*[@role="button"][1]';

export const LOGIN_SELECTORS = {
  form: ['[data-qa="account-login-form"]', '[data-qa="applicant-login-card"]'],
  phoneInput: ['[data-qa="applicant-login-input-phone"]'],
} as const;

export const RESUME_SELECTORS = {
  // TODO: подтвердить на аккаунте после `login`.
  card: ['[data-qa="resume"]', '[data-qa="profile-resume"]'],
  title: ['[data-qa="resume-title"]', '[data-qa="resume-title-text"]'],
} as const;

export const TEXT_INDICATORS = {
  captcha:
    /(?:подтвердите,?\s+что\s+вы\s+не\s+робот|вы\s+не\s+робот|введите\s+код\s+с\s+картинки|не\s+удалось\s+проверить,?\s+что\s+вы\s+не\s+робот|пройдите\s+проверку)/iu,
  limit:
    /(?:достигнут\s+лимит\s+откликов|вы\s+исчерпали\s+лимит|превышен\s+лимит\s+откликов|лимит\s+откликов\s+на\s+сегодня|отклики\s+временно\s+недоступны)/iu,
  blocked:
    /(?:аккаунт\s+ограничен|аккаунт\s+заблокирован|действие\s+аккаунта\s+ограничено|подозрительная\s+активность)/iu,
  alreadyApplied:
    /(?:вы\s+уже\s+откликнулись|вы\s+откликнулись|отклик\s+отправлен|резюме\s+доставлено)/iu,
  success:
    /(?:отклик\s+отправлен|резюме\s+доставлено|вы\s+откликнулись|отклик\s+успешно\s+отправлен)/iu,
  questions:
    /(?:ответьте\s+на\s+вопросы|ответить\s+на\s+вопросы|вопросы\s+работодателя|заполните\s+анкету|анкета\s+работодателя|пройдите\s+тест|тестовое\s+задание\s+при\s+отклике|отклик\s+с\s+анкетой)/iu,
} as const;

export async function firstLocator(
  root: Root,
  selectors: readonly string[],
): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = root.locator(selector).first();
    try {
      if ((await locator.count()) > 0) {
        return locator;
      }
    } catch {
      // Некоторые text-селекторы могут бросить ошибку до появления DOM — пробуем следующий.
    }
  }
  return null;
}

export async function firstVisibleLocator(
  root: Root,
  selectors: readonly string[],
): Promise<Locator | null> {
  for (const selector of selectors) {
    const locator = root.locator(selector).first();
    try {
      if (await locator.isVisible()) {
        return locator;
      }
    } catch {
      // Элемент мог исчезнуть между count и isVisible — идём дальше.
    }
  }
  return null;
}

export async function textOf(root: Root, selectors: readonly string[]): Promise<string> {
  const locator = await firstLocator(root, selectors);
  if (!locator) {
    return '';
  }
  try {
    return (await locator.innerText()).trim();
  } catch {
    return '';
  }
}

export async function hasAny(root: Root, selectors: readonly string[]): Promise<boolean> {
  return (await firstLocator(root, selectors)) !== null;
}

/**
 * Отличает настоящую анкету от блока подсказок «Задайте вопрос работодателю».
 * Подсказки лежат внутри `vacancy-response-suggest` и не имеют полей ввода.
 */
export async function hasQuestionnaireForm(root: Root): Promise<boolean> {
  if (await firstVisibleLocator(root, QUESTIONNAIRE_SELECTORS)) {
    return true;
  }

  const markers = root.locator('[data-qa^="vacancy-response-question"]');
  const count = await markers.count();

  for (let index = 0; index < count; index += 1) {
    const marker = markers.nth(index);
    const isRealField = await marker
      .evaluate((node) => {
        if (node.closest('[class*="vacancy-response-suggest"]')) {
          return false;
        }
        const container =
          node.closest('form, fieldset, [role="group"], [role="radiogroup"], label') ??
          node.parentElement;
        return Boolean(
          container?.querySelector(
            'input, textarea, select, [role="radio"], [role="checkbox"], [role="combobox"]',
          ),
        );
      })
      .catch(() => false);

    if (isRealField) {
      return true;
    }
  }

  return false;
}

export async function waitForAny(
  root: Root,
  selectors: readonly string[],
  timeoutMs = 15000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const locator = await firstVisibleLocator(root, selectors);
    if (locator) {
      return locator;
    }
    await sleep(250);
  }
  return null;
}

export async function bodyText(page: Page): Promise<string> {
  try {
    return await page.locator('body').innerText();
  } catch {
    return '';
  }
}
