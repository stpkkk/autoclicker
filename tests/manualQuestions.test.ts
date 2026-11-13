import { describe, expect, it } from 'vitest';
import { buildQuestionnaireResponseUrl } from '../src/hh/manualQuestions.js';

describe('buildQuestionnaireResponseUrl', () => {
  it('использует href кнопки отклика и сохраняет региональный поддомен', () => {
    const url = buildQuestionnaireResponseUrl(
      'https://petrozavodsk.hh.ru/vacancy/139062164',
      '139062164',
      '/applicant/vacancy_response?vacancyId=139062164&employerId=9368347&hhtmFrom=vacancy',
    );

    expect(url).toBe(
      'https://petrozavodsk.hh.ru/applicant/vacancy_response?vacancyId=139062164&employerId=9368347&hhtmFrom=vacancy',
    );
  });

  it('строит проверенный URL страницы отклика, если href недоступен', () => {
    const url = buildQuestionnaireResponseUrl(
      'https://petrozavodsk.hh.ru/vacancy/139062164',
      '139062164',
    );

    expect(url).toBe(
      'https://petrozavodsk.hh.ru/applicant/vacancy_response?vacancyId=139062164',
    );
  });

  it('не открывает страницу вакансии вместо страницы отклика', () => {
    const url = buildQuestionnaireResponseUrl('https://hh.ru/vacancy/123', '123', null);

    expect(url).toContain('/applicant/vacancy_response');
    expect(url).not.toBe('https://hh.ru/vacancy/123');
  });
});
