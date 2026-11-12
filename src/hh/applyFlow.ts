import type { Page } from 'playwright';
import { AuthRequiredError, HardStopError, ensurePageReady } from '../browser/guards.js';
import { humanClick, humanPause, humanScroll } from '../browser/humanize.js';
import { dismissCookieBanner } from '../browser/session.js';
import type { AppConfig } from '../config/schema.js';
import { filterVacancy } from '../core/filter.js';
import { calculateRemaining, resolveDailyLimit } from '../core/limits.js';
import { pickTemplate, renderTemplate } from '../core/template.js';
import type { ApplicationRepository } from '../db/index.js';
import type { Vacancy } from '../types.js';
import { logger } from '../utils/logger.js';
import { retry } from '../utils/retry.js';
import { sleep } from '../utils/sleep.js';
import { collectAllVacancies } from './search.js';
import {
  clickSubmit,
  closeResponseForm,
  fillCoverLetter,
  hasAuthFormOnPage,
  responseFormHasQuestions,
  selectResume,
  waitForResponseForm,
  waitForSubmitSuccess,
} from './responseForm.js';
import {
  findResponseButton,
  hasEmployerQuestions,
  isAlreadyAppliedOnPage,
  isResponseButtonDisabled,
  readVacancyPage,
} from './vacancy.js';

export interface ApplyOptions {
  send: boolean;
  limit?: number;
  resumeName?: string;
}

export interface ApplySummary {
  planned: number;
  sent: number;
  skipped: number;
  errors: number;
  stoppedReason?: string;
}

type ProcessOutcome = { kind: 'planned' } | { kind: 'sent' } | { kind: 'skipped'; reason: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function processVacancy(
  page: Page,
  config: AppConfig,
  repository: ApplicationRepository,
  vacancy: Vacancy,
  options: ApplyOptions,
): Promise<ProcessOutcome> {
  logger.info(`Открываю вакансию: ${vacancy.title} — ${vacancy.company || 'компания не указана'}`);

  await retry(
    async () => {
      await page.goto(vacancy.url, { waitUntil: 'domcontentloaded' });
    },
    {
      attempts: 2,
      delayMs: 2000,
      onRetry: (error, attempt) => {
        logger.warn(`Повтор открытия вакансии (${attempt}): ${errorMessage(error)}`);
      },
    },
  );

  await dismissCookieBanner(page);
  await ensurePageReady(page);
  await humanPause(1200, 2500);
  await humanScroll(page);
  await humanPause(600, 1400);
  await humanScroll(page);
  await humanPause(400, 900);

  const fullVacancy = await readVacancyPage(page, vacancy);

  // Второй фильтр — уже по полному описанию, а не только по карточке выдачи.
  const filtering = filterVacancy(fullVacancy, config.filters);
  if (!filtering.ok) {
    const reason = filtering.reason ?? 'filtered';
    logger.info(`Пропуск: ${reason}`);
    repository.markSkipped(fullVacancy, reason);
    return { kind: 'skipped', reason };
  }

  if (await isAlreadyAppliedOnPage(page)) {
    logger.info('Пропуск: уже откликался (признак на странице)');
    repository.markSkipped(fullVacancy, 'already_applied');
    return { kind: 'skipped', reason: 'already_applied' };
  }

  if (await hasEmployerQuestions(page)) {
    logger.info('Пропуск: у вакансии есть вопросы/анкета работодателя');
    repository.markSkipped(fullVacancy, 'needs_questions');
    return { kind: 'skipped', reason: 'needs_questions' };
  }

  const responseButton = await findResponseButton(page);
  if (!responseButton) {
    logger.info('Пропуск: кнопка отклика не найдена');
    repository.markSkipped(fullVacancy, 'no_response_button');
    return { kind: 'skipped', reason: 'no_response_button' };
  }

  if (await isResponseButtonDisabled(responseButton)) {
    logger.info('Пропуск: отклик недоступен (кнопка неактивна)');
    repository.markSkipped(fullVacancy, 'response_unavailable');
    return { kind: 'skipped', reason: 'response_unavailable' };
  }

  const templateKind = pickTemplate(fullVacancy.title);
  const coverLetter = renderTemplate(config.cover_letter.templates[templateKind], {
    vacancy_name: fullVacancy.title,
    employer_name: fullVacancy.company || 'вашей компании',
  });

  if (!options.send) {
    const label = (await responseButton.innerText().catch(() => '')).trim();
    if (!/откликнуться/iu.test(label)) {
      logger.warn(`[dry-run] Кнопка «${label}» не открывает форму — не нажимаю.`);
      repository.markPlanned(fullVacancy, templateKind);
      return { kind: 'planned' };
    }
  }

  if (await hasAuthFormOnPage(page)) {
    throw new AuthRequiredError(
      'hh.ru показывает форму входа/телефона вместо отклика. Запустите `hh-autoapply login`.',
    );
  }

  const pagesBefore = new Set(page.context().pages());
  await humanClick(responseButton);
  await sleep(1500);

  const newPage = page
    .context()
    .pages()
    .find((candidate) => !pagesBefore.has(candidate));
  const formPage = newPage ?? page;
  if (newPage) {
    await newPage.waitForLoadState('domcontentloaded').catch(() => undefined);
    await dismissCookieBanner(newPage);
  }

  await ensurePageReady(formPage);

  const form = await waitForResponseForm(formPage);
  if (!form) {
    if (await hasAuthFormOnPage(formPage)) {
      throw new AuthRequiredError();
    }
    if (await isAlreadyAppliedOnPage(formPage)) {
      logger.info('Пропуск: уже откликался (после открытия формы)');
      repository.markSkipped(fullVacancy, 'already_applied');
      return { kind: 'skipped', reason: 'already_applied' };
    }
    logger.info('Пропуск: форма отклика не открылась');
    repository.markSkipped(fullVacancy, 'no_response_form');
    return { kind: 'skipped', reason: 'no_response_form' };
  }

  if (await responseFormHasQuestions(formPage, form)) {
    logger.info('Пропуск: форма отклика содержит вопросы работодателя');
    await closeResponseForm(formPage, form);
    if (newPage) {
      await newPage.close().catch(() => undefined);
    }
    repository.markSkipped(fullVacancy, 'needs_questions');
    return { kind: 'skipped', reason: 'needs_questions' };
  }

  const resume = await selectResume(formPage, form, options.resumeName);
  if (!resume.ok) {
    const reason = resume.reason ?? 'resume_not_found';
    logger.warn(
      `Пропуск: не удалось выбрать резюме «${options.resumeName ?? ''}»` +
        (resume.options?.length ? `. Доступные: ${resume.options.join(', ')}` : ''),
    );
    await closeResponseForm(formPage, form);
    if (newPage) {
      await newPage.close().catch(() => undefined);
    }
    repository.markSkipped(fullVacancy, reason);
    return { kind: 'skipped', reason };
  }

  if (resume.selected) {
    logger.info(`Резюме: ${resume.selected}`);
  }

  const hasLetterField = await fillCoverLetter(formPage, form, coverLetter);
  if (!hasLetterField) {
    logger.warn('Поля сопроводительного письма нет — отклик будет без письма');
  }

  if (!options.send) {
    logger.info(
      `[dry-run] Отклик НЕ отправлен. Шаблон: ${templateKind}, письмо: ${coverLetter.length} симв.`,
    );
    logger.info(`[dry-run] Начало письма: ${coverLetter.slice(0, 100)}...`);
    await closeResponseForm(formPage, form);
    if (newPage) {
      await newPage.close().catch(() => undefined);
    }
    repository.markPlanned(fullVacancy, templateKind);
    return { kind: 'planned' };
  }

  const submitted = await clickSubmit(formPage, form);
  if (!submitted) {
    logger.warn('Пропуск: не найдена кнопка отправки отклика');
    await closeResponseForm(formPage, form);
    if (newPage) {
      await newPage.close().catch(() => undefined);
    }
    repository.markSkipped(fullVacancy, 'no_submit_button');
    return { kind: 'skipped', reason: 'no_submit_button' };
  }

  const success = await waitForSubmitSuccess(formPage, form);
  if (!success) {
    throw new Error('hh.ru не подтвердил отправку отклика');
  }

  repository.markSent(fullVacancy, templateKind);
  logger.info(`Отклик отправлен: ${fullVacancy.title}`);
  if (newPage) {
    await newPage.close().catch(() => undefined);
  }

  return { kind: 'sent' };
}

export async function runApply(
  page: Page,
  config: AppConfig,
  repository: ApplicationRepository,
  options: ApplyOptions,
): Promise<ApplySummary> {
  const summary: ApplySummary = { planned: 0, sent: 0, skipped: 0, errors: 0 };
  const limit = resolveDailyLimit(config.limits.daily_limit, options.limit);
  const sentToday = repository.countSentToday();
  const remaining = calculateRemaining(limit, sentToday);

  logger.info(
    `Режим: ${options.send ? 'РЕАЛЬНАЯ ОТПРАВКА (--send)' : 'DRY-RUN (ничего не отправляется)'}`,
  );
  logger.info(`Лимит на сегодня: ${limit}, уже отправлено: ${sentToday}, остаток: ${remaining}`);

  if (remaining === 0) {
    summary.stoppedReason = 'daily_limit';
    logger.warn('Дневной лимит уже исчерпан — останавливаюсь.');
    return summary;
  }

  const allVacancies = await collectAllVacancies(page, config);
  const candidates: Vacancy[] = [];

  for (const vacancy of allVacancies) {
    if (repository.hasSent(vacancy.id)) {
      summary.skipped += 1;
      logger.info(`Пропуск: уже отправлен ранее (SQLite) — ${vacancy.title}`);
      continue;
    }

    const filtering = filterVacancy(vacancy, config.filters);
    if (!filtering.ok) {
      const reason = filtering.reason ?? 'filtered';
      repository.markSkipped(vacancy, reason);
      summary.skipped += 1;
      logger.info(`Пропуск по фильтру (${reason}): ${vacancy.title}`);
      continue;
    }

    candidates.push(vacancy);
  }

  logger.info(`Кандидатов после первичной фильтрации: ${candidates.length}`);

  let processed = 0;
  let consecutiveErrors = 0;

  for (const [index, vacancy] of candidates.entries()) {
    if (processed >= remaining) {
      summary.stoppedReason = options.send ? 'daily_limit' : 'dry_run_limit';
      logger.warn('Достигнут лимит запуска — останавливаюсь.');
      break;
    }

    if (index > 0) {
      logger.info('Пауза между вакансиями...');
      await humanPause(config.limits.delay_ms_min, config.limits.delay_ms_max);
    }

    try {
      const outcome = await processVacancy(page, config, repository, vacancy, options);
      consecutiveErrors = 0;

      if (outcome.kind === 'sent') {
        summary.sent += 1;
        processed += 1;
      } else if (outcome.kind === 'planned') {
        summary.planned += 1;
        processed += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        summary.stoppedReason = 'auth_required';
        logger.error(error.message);
        break;
      }

      if (error instanceof HardStopError) {
        summary.stoppedReason = error.kind;
        logger.error(`Остановка: ${error.message}`);
        break;
      }

      consecutiveErrors += 1;
      summary.errors += 1;
      const message = errorMessage(error);
      repository.markError(vacancy, message);
      logger.error(`Ошибка на вакансии «${vacancy.title}»: ${message}`);

      if (consecutiveErrors >= 3) {
        summary.stoppedReason = 'consecutive_errors';
        logger.error('Три ошибки подряд — останавливаюсь, чтобы не рисковать аккаунтом.');
        break;
      }
    }
  }

  if (summary.sent >= remaining || summary.planned >= remaining) {
    summary.stoppedReason = options.send ? 'daily_limit' : 'dry_run_limit';
  }

  logger.info(
    `Итог: отправлено=${summary.sent}, запланировано=${summary.planned}, ` +
      `пропущено=${summary.skipped}, ошибок=${summary.errors}` +
      (summary.stoppedReason ? `, остановка=${summary.stoppedReason}` : ''),
  );

  return summary;
}
