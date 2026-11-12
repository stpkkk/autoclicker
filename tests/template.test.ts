import { describe, expect, it } from 'vitest';
import { pickTemplate, renderTemplate } from '../src/core/template.js';

describe('pickTemplate', () => {
  it.each([
    ['Fullstack разработчик', 'fullstack'],
    ['Full-stack Developer', 'fullstack'],
    ['Full Stack Engineer', 'fullstack'],
    ['Node.js developer', 'fullstack'],
    ['NodeJS developer', 'fullstack'],
    ['NestJS developer', 'fullstack'],
    ['Nest.js developer', 'fullstack'],
  ])('выбирает fullstack для %s', (title, expected) => {
    expect(pickTemplate(title)).toBe(expected);
  });

  it.each([
    ['Frontend разработчик React', 'frontend'],
    ['React TypeScript Developer', 'frontend'],
    ['Vue.js разработчик', 'frontend'],
    ['JavaScript Developer', 'frontend'],
    ['Team Lead Frontend', 'frontend'],
  ])('выбирает frontend для %s', (title, expected) => {
    expect(pickTemplate(title)).toBe(expected);
  });
});

describe('renderTemplate', () => {
  it('подставляет {{vacancy_name}} и {{employer_name}}', () => {
    const result = renderTemplate('Вакансия {{vacancy_name}} в компании {{employer_name}}', {
      vacancy_name: 'React Developer',
      employer_name: 'Acme',
    });

    expect(result).toBe('Вакансия React Developer в компании Acme');
  });

  it('подставляет название вакансии и компанию', () => {
    const result = renderTemplate(
      'Вакансия {{vacancy_name}} в {{employer_name}}. Ещё раз: {{ vacancy_name }}.',
      { vacancy_name: 'React Developer', employer_name: 'Acme' },
    );

    expect(result).toContain('React Developer');
    expect(result).toContain('Acme');
    expect(result).not.toContain('{{');
  });

  it('не падает, если плейсхолдеров нет', () => {
    expect(renderTemplate('Просто текст', { vacancy_name: 'A', employer_name: 'B' })).toBe(
      'Просто текст',
    );
  });
});
