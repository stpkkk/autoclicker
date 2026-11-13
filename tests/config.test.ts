import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/schema.js';

const BASE_CONFIG = {
  search: { queries: ['Frontend'] },
  filters: {},
  limits: {},
  cover_letter: { templates: { frontend: 'frontend', fullstack: 'fullstack' } },
  resume_by_template: { frontend: 'Frontend-разработчик', fullstack: 'Fullstack-разработчик' },
};

describe('questions в конфиге', () => {
  it('по умолчанию открывает вкладки и ограничивает их пятью', () => {
    const parsed = configSchema.parse(BASE_CONFIG);

    expect(parsed.questions).toEqual({ open_in_new_tab: true, max_open_tabs: 5 });
  });

  it('читает явные значения', () => {
    const parsed = configSchema.parse({
      ...BASE_CONFIG,
      questions: { open_in_new_tab: false, max_open_tabs: 2 },
    });

    expect(parsed.questions).toEqual({ open_in_new_tab: false, max_open_tabs: 2 });
  });

  it('не принимает отрицательный или дробный лимит', () => {
    expect(() =>
      configSchema.parse({
        ...BASE_CONFIG,
        questions: { open_in_new_tab: true, max_open_tabs: -1 },
      }),
    ).toThrow();
    expect(() =>
      configSchema.parse({
        ...BASE_CONFIG,
        questions: { open_in_new_tab: true, max_open_tabs: 1.5 },
      }),
    ).toThrow();
  });
});
