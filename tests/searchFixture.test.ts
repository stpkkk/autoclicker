import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { filterVacancy, type FilterSettings } from '../src/core/filter.js';
import { extractVacanciesFromPage } from '../src/hh/search.js';

const settings: FilterSettings = {
  stop_words: ['Java'],
  must_have_any: ['React', 'Frontend'],
  skip_relocation: false,
  allowed_cities: [],
};

describe('парсинг выдачи на HTML-фикстуре (без сети)', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    const fixturePath = fileURLToPath(new URL('./fixtures/search.html', import.meta.url));
    const html = await readFile(fixturePath, 'utf8');
    await page.setContent(html);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('извлекает id, название, компанию, ссылку, адрес, зарплату и remote', async () => {
    const vacancies = await extractVacanciesFromPage(page, 'React');
    expect(vacancies).toHaveLength(2);

    const first = vacancies[0];
    expect(first).toMatchObject({
      id: '111',
      title: 'React Frontend Developer',
      company: 'Acme',
      url: 'https://hh.ru/vacancy/111',
      location: 'Москва',
      remote: true,
    });
    expect(first?.salary).toContain('200 000');
  });

  it('фильтр отсекает Java по границе слова и оставляет React', async () => {
    const vacancies = await extractVacanciesFromPage(page, 'React');
    const first = vacancies[0];
    const second = vacancies[1];

    expect(first ? filterVacancy(first, settings) : null).toEqual({ ok: true });
    expect(second ? filterVacancy(second, settings) : null).toEqual({
      ok: false,
      reason: 'stop_word:Java',
    });
  });
});
