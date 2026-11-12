import type { AppConfig } from '../config/schema.js';

export function buildSearchUrl(search: AppConfig['search'], query: string, page: number): string {
  const params = new URLSearchParams({
    text: query,
    area: String(search.area),
    schedule: search.schedule,
    experience: search.experience,
    search_period: String(search.period),
    order_by: 'publication_time',
    items_on_page: '20',
    page: String(page),
  });

  if (search.only_with_salary) {
    params.set('only_with_salary', 'true');
  }
  if (search.salary !== undefined) {
    params.set('salary', String(search.salary));
  }

  return `https://hh.ru/search/vacancy?${params.toString()}`;
}

export function extractVacancyId(value: string): string | null {
  const match = /\/vacancy\/(\d+)/u.exec(value);
  return match?.[1] ?? null;
}

export function normalizeVacancyUrl(href: string, baseUrl: string): string {
  const url = new URL(href, baseUrl);
  url.search = '';
  url.hash = '';
  return url.toString();
}
