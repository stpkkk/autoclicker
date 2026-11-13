import { describe, expect, it } from 'vitest';
import { pickApplicationChoice, pickTemplate, renderTemplate } from '../src/core/template.js';

const TEMPLATES = { frontend: 'frontend letter', fullstack: 'fullstack letter' };
const RESUMES = {
  frontend: 'Frontend-разработчик',
  fullstack: 'Fullstack-разработчик',
};

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

describe('pickApplicationChoice: резюме по названию вакансии', () => {
  it.each([
    ['Fullstack разработчик', 'Fullstack-разработчик'],
    ['Full-stack Developer', 'Fullstack-разработчик'],
    ['Node.js developer', 'Fullstack-разработчик'],
    ['NestJS developer', 'Fullstack-разработчик'],
    ['Frontend разработчик React', 'Frontend-разработчик'],
    ['React TypeScript Developer', 'Frontend-разработчик'],
    ['Vue.js разработчик', 'Frontend-разработчик'],
  ])('для «%s» выбирает «%s»', (title, expected) => {
    const choice = pickApplicationChoice(title, TEMPLATES, RESUMES);

    expect(choice.resumeName).toBe(expected);
  });

  it('берёт письмо и резюме по одному и тому же виду вакансии', () => {
    const choice = pickApplicationChoice('Node.js developer', TEMPLATES, RESUMES);

    expect(choice.templateKind).toBe('fullstack');
    expect(choice.template).toBe(TEMPLATES.fullstack);
    expect(choice.resumeName).toBe(RESUMES.fullstack);
  });
});

describe('pickApplicationChoice: приоритет --resume', () => {
  it.each([['Fullstack разработчик'], ['Frontend разработчик React']])(
    '--resume важнее конфига для «%s»',
    (title) => {
      const choice = pickApplicationChoice(title, TEMPLATES, RESUMES, 'Моё резюме');

      expect(choice.resumeName).toBe('Моё резюме');
    },
  );

  it('пустой --resume не перекрывает конфиг', () => {
    const choice = pickApplicationChoice('Frontend разработчик', TEMPLATES, RESUMES, '   ');

    expect(choice.resumeName).toBe(RESUMES.frontend);
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
