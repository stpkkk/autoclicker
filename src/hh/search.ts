import type { Locator, Page } from 'playwright';
import type { AppConfig } from '../config/schema.js';
import { dismissCookieBanner } from '../browser/session.js';
import { ensurePageReady } from '../browser/guards.js';
import { humanPause, humanScroll } from '../browser/humanize.js';
import { logger } from '../utils/logger.js';
import type { Vacancy } from '../types.js';
import {
  firstLocator,
  firstVisibleLocator,
  hasAny,
  SEARCH_CARD_SELECTOR,
  SEARCH_SELECTORS,
  textOf,
  waitForAny,
} from './selectors.js';
import { buildSearchUrl, extractVacancyId, normalizeVacancyUrl } from './url.js';

const CURRENCY_PATTERN = /(?:₽|руб\.?|rub|\$|€|eur|usd)/iu;
const ITEMS_ON_PAGE = 20;

/** Зарплата в новом макете может быть без data-qa — вытаскиваем строку с валютой. */
export function parseSalaryFromText(text: string): string | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.find((line) => CURRENCY_PATTERN.test(line) && /\d/u.test(line));
}

async function getCardId(card: Locator, href: string | null): Promise<string> {
  const idAttribute = await card.getAttribute('id');
  if (idAttribute && /^\d+$/u.test(idAttribute)) {
    return idAttribute;
  }
  return extractVacancyId(href ?? '') ?? '';
}

/**
 * Парсит карточки с уже загруженной страницы поиска.
 * Вынесено отдельно, чтобы тестировать на HTML-фикстуре без сети.
 */
export async function extractVacanciesFromPage(page: Page, query?: string): Promise<Vacancy[]> {
  const cards = page.locator(SEARCH_CARD_SELECTOR);
  const count = await cards.count();
  const vacancies: Vacancy[] = [];

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const titleLink = await firstLocator(card, SEARCH_SELECTORS.titleLink);
    const href = titleLink ? await titleLink.getAttribute('href') : null;
    const id = await getCardId(card, href);
    if (!id) {
      logger.debug('Пропускаю карточку без vacancy_id');
      continue;
    }

    const title =
      (await textOf(card, SEARCH_SELECTORS.titleText)) ||
      (titleLink ? (await titleLink.innerText()).trim() : '');
    if (!title) {
      logger.debug(`Пропускаю вакансию ${id}: не удалось прочитать название`);
      continue;
    }

    const url = href ? normalizeVacancyUrl(href, page.url()) : `https://hh.ru/vacancy/${id}`;
    const company = await textOf(card, SEARCH_SELECTORS.company);
    const address = await textOf(card, SEARCH_SELECTORS.address);
    const salaryFromSelector = await textOf(card, SEARCH_SELECTORS.salary);
    const cardText = await card.innerText().catch(() => '');
    const salary = salaryFromSelector || parseSalaryFromText(cardText);
    const remote =
      (await hasAny(card, SEARCH_SELECTORS.remote)) || /удалённ|удаленн/iu.test(address);

    const snippetParts = await Promise.all(
      SEARCH_SELECTORS.snippet.map((selector) => textOf(card, [selector])),
    );
    const description = snippetParts.filter((part) => part.length > 0).join('\n');

    vacancies.push({
      id,
      title,
      company,
      url,
      salary,
      description: description || undefined,
      location: address || undefined,
      remote,
      query,
    });
  }

  return vacancies;
}

export async function collectVacancies(
  page: Page,
  config: AppConfig,
  query: string,
): Promise<Vacancy[]> {
  const found = new Map<string, Vacancy>();

  for (let pageNumber = 0; pageNumber < config.search.max_pages_per_query; pageNumber += 1) {
    const url = buildSearchUrl(config.search, query, pageNumber);
    logger.info(`Поиск «${query}», страница ${pageNumber + 1}: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await dismissCookieBanner(page);
    await ensurePageReady(page);

    const ready = await waitForAny(
      page,
      [...SEARCH_SELECTORS.card, ...SEARCH_SELECTORS.empty],
      20_000,
    );
    if (!ready) {
      logger.warn(`Не дождался карточек поиска по запросу «${query}»`);
      break;
    }

    if (await firstVisibleLocator(page, SEARCH_SELECTORS.empty)) {
      logger.info(`По запросу «${query}» больше нет вакансий`);
      break;
    }

    // Немного скролла, чтобы подгрузились ленивые карточки и поведение было ближе к человеку.
    await humanScroll(page);
    await humanPause(600, 1400);

    const pageVacancies = await extractVacanciesFromPage(page, query);
    if (pageVacancies.length === 0) {
      break;
    }

    for (const vacancy of pageVacancies) {
      if (!found.has(vacancy.id)) {
        found.set(vacancy.id, vacancy);
      }
    }

    logger.info(`Страница ${pageNumber + 1}: найдено ${pageVacancies.length} карточек`);

    if (pageVacancies.length < ITEMS_ON_PAGE) {
      break;
    }

    if (pageNumber < config.search.max_pages_per_query - 1) {
      await humanPause(1500, 3000);
    }
  }

  return [...found.values()];
}

export async function collectAllVacancies(page: Page, config: AppConfig): Promise<Vacancy[]> {
  const found = new Map<string, Vacancy>();

  for (const [index, query] of config.search.queries.entries()) {
    const vacancies = await collectVacancies(page, config, query);
    for (const vacancy of vacancies) {
      if (!found.has(vacancy.id)) {
        found.set(vacancy.id, vacancy);
      }
    }

    if (index < config.search.queries.length - 1) {
      await humanPause(2000, 4000);
    }
  }

  logger.info(`Собрано уникальных вакансий: ${found.size}`);
  return [...found.values()];
}
