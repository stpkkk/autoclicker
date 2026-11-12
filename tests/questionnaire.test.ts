import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasQuestionnaireForm, TEXT_INDICATORS } from '../src/hh/selectors.js';

describe('детект анкеты работодателя', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('не считает подсказки «Задайте вопрос работодателю» анкетой', async () => {
    await page.setContent(`
      <div class="vacancy-response-suggest">
        <label>
          <div data-qa="vacancy-response-question vacancy-response-question_work_place_location">
            Где располагается место работы?
          </div>
        </label>
      </div>
    `);

    expect(await hasQuestionnaireForm(page)).toBe(false);
    expect(TEXT_INDICATORS.questions.test(await page.locator('body').innerText())).toBe(false);
    expect(TEXT_INDICATORS.questions.test('Ответьте на вопросы работодателя')).toBe(true);
  });

  it('считает анкетой блок с вопросами и полями ввода', async () => {
    await page.setContent(`
      <div data-qa="vacancy-response-form-questions">
        <form>
          <label>Опыт <input type="radio" name="experience" /></label>
        </form>
      </div>
    `);

    expect(await hasQuestionnaireForm(page)).toBe(true);
  });

  it('считает анкетой вопрос с полем ввода вне блока подсказок', async () => {
    await page.setContent(`
      <form>
        <div data-qa="vacancy-response-question vacancy-response-question_custom">Ваш город?</div>
        <input name="city" />
      </form>
    `);

    expect(await hasQuestionnaireForm(page)).toBe(true);
  });
});
