import type { Locator, Page } from 'playwright';
import type { AppConfig } from '../config/schema.js';
import { detectGuard, ensurePageReady, waitForHuman } from '../browser/guards.js';
import { humanClick } from '../browser/humanize.js';
import { dismissCookieBanner } from '../browser/session.js';
import { sleep } from '../utils/sleep.js';
import {
  firstLocator,
  firstVisibleLocator,
  RESPONSE_SELECTORS,
  SEARCH_CARD_SELECTOR,
  SEARCH_SELECTORS,
  VACANCY_SELECTORS,
  waitForAny,
} from './selectors.js';
import { buildSearchUrl } from './url.js';
import { closeResponseForm, hasAuthFormOnPage, waitForResponseForm } from './responseForm.js';

type Root = Page | Locator;

interface CheckItem {
  label: string;
  selectors: readonly string[];
  optional?: boolean;
}

interface CheckReport {
  group: string;
  found: string[];
  missing: string[];
  optionalMissing: string[];
}

async function checkItems(root: Root, group: string, items: CheckItem[]): Promise<CheckReport> {
  const found: string[] = [];
  const missing: string[] = [];
  const optionalMissing: string[] = [];

  for (const item of items) {
    const locator = await firstLocator(root, item.selectors);
    if (locator) {
      found.push(item.label);
    } else if (item.optional) {
      optionalMissing.push(item.label);
    } else {
      missing.push(item.label);
    }
  }

  return { group, found, missing, optionalMissing };
}

function printReport(report: CheckReport): void {
  console.log(`\n[${report.group}]`);
  for (const label of report.found) {
    console.log(`  OK      ${label}`);
  }
  for (const label of report.optionalMissing) {
    console.log(`  OPTIONAL ${label} — не найдено (может отсутствовать на конкретной странице)`);
  }
  for (const label of report.missing) {
    console.log(`  MISS    ${label} — СЕЛЕКТОР НЕ НАЙДЕН`);
  }
}

const SEARCH_ITEMS: CheckItem[] = [
  { label: 'контейнер результатов', selectors: SEARCH_SELECTORS.results },
  { label: 'карточка вакансии', selectors: SEARCH_SELECTORS.card },
  { label: 'название', selectors: SEARCH_SELECTORS.titleText },
  { label: 'ссылка на вакансию', selectors: SEARCH_SELECTORS.titleLink },
  { label: 'компания', selectors: SEARCH_SELECTORS.company },
  { label: 'адрес', selectors: SEARCH_SELECTORS.address },
  { label: 'кнопка отклика', selectors: SEARCH_SELECTORS.response },
  { label: 'зарплата', selectors: SEARCH_SELECTORS.salary, optional: true },
];

const VACANCY_ITEMS: CheckItem[] = [
  { label: 'название', selectors: VACANCY_SELECTORS.title },
  { label: 'компания', selectors: VACANCY_SELECTORS.company },
  { label: 'описание', selectors: VACANCY_SELECTORS.description },
  { label: 'адрес', selectors: VACANCY_SELECTORS.location },
  { label: 'формат работы', selectors: VACANCY_SELECTORS.hiringFormats, optional: true },
  { label: 'кнопка отклика (верх)', selectors: VACANCY_SELECTORS.responseTop },
  {
    label: 'анкета работодателя (data-qa)',
    selectors: VACANCY_SELECTORS.questions,
    optional: true,
  },
  { label: 'зарплата', selectors: VACANCY_SELECTORS.salary, optional: true },
];

const RESPONSE_ITEMS: CheckItem[] = [
  { label: 'модальное окно/контейнер формы', selectors: RESPONSE_SELECTORS.popup, optional: true },
  { label: 'поле сопроводительного письма', selectors: RESPONSE_SELECTORS.letter },
  { label: 'кнопка отправки', selectors: RESPONSE_SELECTORS.submit },
  { label: 'выбор резюме', selectors: RESPONSE_SELECTORS.resumeSelect, optional: true },
  { label: 'индикатор успеха', selectors: RESPONSE_SELECTORS.success, optional: true },
];

export async function runDoctor(page: Page, config: AppConfig): Promise<void> {
  const firstQuery = config.search.queries[0];
  if (!firstQuery) {
    console.log('В config.yaml нет поисковых запросов.');
    return;
  }

  console.log('Проверяю селекторы на реальных страницах hh.ru...');
  await page.goto(buildSearchUrl(config.search, firstQuery, 0), {
    waitUntil: 'domcontentloaded',
  });
  await dismissCookieBanner(page);
  await ensurePageReady(page);

  const cardsReady = await waitForAny(page, SEARCH_SELECTORS.card, 20_000);
  if (!cardsReady) {
    console.log('\nНе дождался карточек поиска. Проверьте вход/гео/капчу и повторите doctor.');
    return;
  }

  printReport(await checkItems(page, 'Поиск', SEARCH_ITEMS));

  const firstCard = page.locator(SEARCH_CARD_SELECTOR).first();
  const titleLink = await firstLocator(firstCard, SEARCH_SELECTORS.titleLink);
  const href = titleLink ? await titleLink.getAttribute('href') : null;

  if (!href) {
    console.log('\nНе удалось получить ссылку на вакансию — проверка карточки остановлена.');
    return;
  }

  await page.goto(new URL(href, page.url()).toString(), { waitUntil: 'domcontentloaded' });
  await dismissCookieBanner(page);
  await ensurePageReady(page);
  await sleep(500);

  printReport(await checkItems(page, 'Карточка вакансии', VACANCY_ITEMS));

  const responseButton = await firstVisibleLocator(page, [
    ...VACANCY_SELECTORS.responseTop,
    ...VACANCY_SELECTORS.responseBottom,
  ]);

  if (!responseButton) {
    console.log('\nКнопка отклика не найдена — форму отклика проверить не удалось.');
    return;
  }

  await humanClick(responseButton);
  await sleep(1500);

  const guard = await detectGuard(page);
  if (guard?.kind === 'captcha') {
    await waitForHuman(page, guard);
  }

  if (await hasAuthFormOnPage(page)) {
    console.log(
      '\nФорма отклика: hh.ru просит вход/телефон. Выполните `login` и повторите doctor ' +
        'для проверки селекторов модального окна отклика.',
    );
    return;
  }

  const form = await waitForResponseForm(page, 10_000);
  if (!form) {
    console.log(
      '\nФорма отклика не открылась. Вероятно, требуется вход — выполните `login` и повторите doctor.',
    );
    return;
  }

  printReport(await checkItems(form.root, 'Форма отклика', RESPONSE_ITEMS));
  await closeResponseForm(page, form);
}
