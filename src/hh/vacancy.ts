import type { Locator, Page } from 'playwright';
import type { Vacancy } from '../types.js';
import {
  bodyText,
  firstVisibleLocator,
  hasAny,
  hasQuestionnaireForm,
  TEXT_INDICATORS,
  textOf,
  VACANCY_SELECTORS,
} from './selectors.js';

export async function readVacancyPage(page: Page, fallback: Vacancy): Promise<Vacancy> {
  const title = (await textOf(page, VACANCY_SELECTORS.title)) || fallback.title;
  const company = (await textOf(page, VACANCY_SELECTORS.company)) || fallback.company;
  const salary = (await textOf(page, VACANCY_SELECTORS.salary)) || fallback.salary;
  const description = await textOf(page, VACANCY_SELECTORS.description);
  const location = (await textOf(page, VACANCY_SELECTORS.location)) || fallback.location;
  const formats = await textOf(page, VACANCY_SELECTORS.hiringFormats);

  const remote =
    (await hasAny(page, VACANCY_SELECTORS.remoteBadges)) ||
    /удалённ|удаленн/iu.test(formats) ||
    fallback.remote === true;

  return {
    ...fallback,
    title,
    company,
    salary,
    description: description || fallback.description,
    location,
    remote,
  };
}

export async function isAlreadyAppliedOnPage(page: Page): Promise<boolean> {
  if (await hasAny(page, VACANCY_SELECTORS.alreadyApplied)) {
    return true;
  }

  const buttonText = (
    await textOf(page, [...VACANCY_SELECTORS.responseTop, ...VACANCY_SELECTORS.responseBottom])
  )
    .trim()
    .toLowerCase();

  if (
    buttonText.includes('откликнулись') ||
    buttonText.includes('отклик отправлен') ||
    buttonText.includes('резюме доставлено')
  ) {
    return true;
  }

  // Не используем общий поиск по «Вы откликнулись»: в блоке похожих вакансий
  // такой текст может относиться к другой вакансии.
  const strictPattern =
    /(?:вы\s+уже\s+откликнулись|вы\s+откликнулись\s+на\s+(?:эту\s+)?вакансию|отклик\s+на\s+эту\s+вакансию\s+отправлен)/iu;
  return strictPattern.test(await bodyText(page));
}

export async function hasEmployerQuestions(page: Page): Promise<boolean> {
  if (await hasQuestionnaireForm(page)) {
    return true;
  }
  return TEXT_INDICATORS.questions.test(await bodyText(page));
}

/**
 * Кнопка «Откликнуться» встречается вверху и внизу страницы — берём первую видимую.
 * На странице она является ссылкой с role="button", поэтому проверяем оба варианта.
 */
export async function findResponseButton(page: Page): Promise<Locator | null> {
  const fromSelectors = await firstVisibleLocator(page, [
    ...VACANCY_SELECTORS.responseTop,
    ...VACANCY_SELECTORS.responseBottom,
  ]);
  if (fromSelectors) {
    return fromSelectors;
  }

  const byRole = page.getByRole('button', { name: /^Откликнуться$/i }).first();
  try {
    if (await byRole.isVisible()) {
      return byRole;
    }
  } catch {
    // Кнопки может не быть.
  }

  const byLink = page.getByRole('link', { name: /^Откликнуться$/i }).first();
  try {
    if (await byLink.isVisible()) {
      return byLink;
    }
  } catch {
    // Кнопки может не быть.
  }

  return null;
}

export async function isResponseButtonDisabled(button: Locator): Promise<boolean> {
  const ariaDisabled = await button.getAttribute('aria-disabled').catch(() => null);
  if (ariaDisabled === 'true') {
    return true;
  }
  return button.isDisabled().catch(() => false);
}
