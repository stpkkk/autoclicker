import { describe, expect, it } from 'vitest';
import {
  extractRequirementsSection,
  filterVacancy,
  findTerm,
  type FilterSettings,
} from '../src/core/filter.js';
import type { Vacancy } from '../src/types.js';

const settings: FilterSettings = {
  title_stop_words: ['Java', 'PHP', '1С', 'C#', '.NET', 'Senior+', 'Angular', 'QA'],
  requirements_stop_words: ['Java', 'Spring', 'PHP', 'Angular', 'QA'],
  requirements_stop_min_hits: 2,
  must_have_any: ['React', 'Vue', 'TypeScript', 'Node.js', 'NestJS', 'Fullstack', 'Frontend'],
  skip_relocation: true,
  allowed_cities: [],
};

function vacancy(overrides: Partial<Vacancy> = {}): Vacancy {
  return {
    id: '1',
    title: 'Frontend React Developer',
    company: 'Acme',
    url: 'https://hh.ru/vacancy/1',
    ...overrides,
  };
}

describe('findTerm: границы слов', () => {
  it('не считает Java стоп-словом внутри JavaScript', () => {
    expect(findTerm('JavaScript developer', 'Java')).toBe(false);
    expect(findTerm('JavaScript и TypeScript', 'Java')).toBe(false);
  });

  it('находит Java как отдельное слово', () => {
    expect(findTerm('Java developer', 'Java')).toBe(true);
    expect(findTerm('Опыт: Java, Spring', 'Java')).toBe(true);
  });

  it('учитывает кириллицу, регистр и неразрывные пробелы', () => {
    expect(findTerm('Проект на 1С', '1С')).toBe(true);
    expect(findTerm('проект на 1с', '1С')).toBe(true);
    expect(findTerm('Вакансия\u00a0Java', 'Java')).toBe(true);
  });

  it('корректно обрабатывает пунктуацию в C#, .NET и Senior+', () => {
    expect(findTerm('Разработка на C#', 'C#')).toBe(true);
    expect(findTerm('C developer', 'C#')).toBe(false);
    expect(findTerm('ASP.NET Core', '.NET')).toBe(true);
    expect(findTerm('Senior+ разработчик', 'Senior+')).toBe(true);
  });
});

describe('extractRequirementsSection', () => {
  it('берет текст от заголовка требований до следующего заголовка', () => {
    const description = [
      'О проекте',
      'Сервис на Java и Spring.',
      'Требования:',
      'React, Node.js',
      'Java, Spring',
      'Условия:',
      'Удалённо',
    ].join('\n');

    expect(extractRequirementsSection(description)).toBe('React, Node.js\nJava, Spring');
  });

  it('поддерживает английские заголовки и текст в строке заголовка', () => {
    expect(
      extractRequirementsSection('About us\nWe build things.\nRequirements: React, Node.js'),
    ).toBe('React, Node.js');
  });

  it('возвращает undefined, если раздела требований нет', () => {
    expect(extractRequirementsSection('О проекте\nСервис на Java и Spring.')).toBeUndefined();
  });
});

describe('filterVacancy', () => {
  it('пропускает вакансию без стоп-слов и с must-have', () => {
    expect(filterVacancy(vacancy(), settings)).toEqual({ ok: true });
  });

  it('возвращает причину stop_word для Java в названии', () => {
    expect(filterVacancy(vacancy({ title: 'Java/React developer' }), settings)).toEqual({
      ok: false,
      reason: 'stop_word:Java (title)',
    });
  });

  it('не путает Java и JavaScript при фильтрации', () => {
    expect(filterVacancy(vacancy({ title: 'JavaScript React developer' }), settings)).toEqual({
      ok: true,
    });
  });

  it('не отсекает по Java в описании проекта', () => {
    const description = [
      'О проекте',
      'Легаси-сервис на Java и Spring.',
      'Требования:',
      'React, TypeScript',
      'Мы предлагаем:',
      'Удалённую работу',
    ].join('\n');

    expect(filterVacancy(vacancy({ description }), settings)).toEqual({ ok: true });
  });

  it('отсекает, когда Java и Spring найдены в требованиях', () => {
    const description = ['Требования:', 'React, Java, Spring', 'Условия:', 'Удалённо'].join('\n');

    expect(filterVacancy(vacancy({ description }), settings)).toEqual({
      ok: false,
      reason: 'stop_word:Java (requirements)',
    });
  });

  it('не отсекает, если must-have в требованиях больше чужих стоп-слов', () => {
    const balanceSettings: FilterSettings = {
      ...settings,
      requirements_stop_min_hits: 1,
    };
    const description = ['Требования:', 'React, Node.js', 'Java', 'Условия:', 'Удалённо'].join(
      '\n',
    );

    expect(filterVacancy(vacancy({ description }), balanceSettings)).toEqual({ ok: true });
  });

  it('требует хотя бы одно must-have', () => {
    expect(filterVacancy(vacancy({ title: 'Project Manager' }), settings)).toEqual({
      ok: false,
      reason: 'no_must_have',
    });
  });

  it('пропускает релокацию, если вакансия не remote', () => {
    expect(
      filterVacancy(
        vacancy({ title: 'React developer', description: 'Возможна релокация в Москву' }),
        settings,
      ),
    ).toEqual({ ok: false, reason: 'relocation' });
  });

  it('не применяет проверку релокации к remote-вакансии', () => {
    expect(
      filterVacancy(
        vacancy({ title: 'React developer', remote: true, description: 'Возможна релокация' }),
        settings,
      ),
    ).toEqual({ ok: true });
  });

  it('проверяет allowed_cities для не-remote вакансии', () => {
    const withCities: FilterSettings = {
      ...settings,
      allowed_cities: ['Санкт-Петербург'],
    };
    expect(
      filterVacancy(vacancy({ title: 'React developer', location: 'Москва' }), withCities),
    ).toEqual({ ok: false, reason: 'city_not_allowed:Москва' });
    expect(
      filterVacancy(vacancy({ title: 'React developer', location: 'Санкт-Петербург' }), withCities),
    ).toEqual({ ok: true });
  });
});
