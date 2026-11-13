import type { BrowserContext, Page } from 'playwright';
import type { AppConfig } from '../config/schema.js';
import type { ApplicationRepository } from '../db/index.js';
import type { Vacancy } from '../types.js';
import { logger } from '../utils/logger.js';

export interface ManualTabEntry {
  vacancyId: string;
  title: string;
  url: string;
  opened: boolean;
  reason?: 'limit' | 'open_failed';
}

/**
 * Строит URL страницы отклика, на которой hh показывает анкету работодателя.
 * Проверено на реальной вакансии: страница /vacancy/{id} саму анкету не содержит,
 * а /applicant/vacancy_response?vacancyId=... открывает её напрямую.
 */
export function buildQuestionnaireResponseUrl(
  pageUrl: string,
  vacancyId: string,
  responseHref?: string | null,
): string {
  if (responseHref) {
    try {
      return new URL(responseHref, pageUrl).toString();
    } catch {
      // Некорректный href — используем проверенный шаблон ниже.
    }
  }

  return new URL(
    `/applicant/vacancy_response?vacancyId=${encodeURIComponent(vacancyId)}`,
    pageUrl,
  ).toString();
}

/**
 * Ручные вкладки с анкетами. Приложение только открывает страницу и больше
 * ничего в ней не делает: не кликает, не вводит и не закрывает по таймеру.
 */
export class ManualQuestionTabs {
  private readonly opened: ManualTabEntry[] = [];
  private openedCount = 0;

  constructor(
    private readonly context: BrowserContext,
    private readonly options: AppConfig['questions'],
    private readonly repository: ApplicationRepository,
  ) {}

  get entries(): ManualTabEntry[] {
    return [...this.opened];
  }

  /**
   * Были ли в этом запуске реально открытые вкладки. Если да, CLI не закрывает
   * браузер сам и ждёт, пока человек закроет окно.
   */
  get hasOpenedTabs(): boolean {
    return this.openedCount > 0;
  }

  hasOpenedBefore(vacancyId: string): boolean {
    return this.repository.hasManualOpened(vacancyId);
  }

  async open(vacancy: Vacancy, responseUrl: string): Promise<void> {
    if (!this.options.open_in_new_tab) {
      return;
    }

    if (this.hasOpenedBefore(vacancy.id)) {
      logger.info(`Ручная вкладка уже открывалась ранее — не открываю снова: ${vacancy.title}`);
      return;
    }

    if (this.openedCount >= this.options.max_open_tabs) {
      this.opened.push({
        vacancyId: vacancy.id,
        title: vacancy.title,
        url: responseUrl,
        opened: false,
        reason: 'limit',
      });
      logger.warn(
        `Лимит ручных вкладок (${this.options.max_open_tabs}) достигнут — ` +
          `ссылка добавлена в итоговый список: ${responseUrl}`,
      );
      return;
    }

    let tab: Page | null = null;
    try {
      tab = await this.context.newPage();
      await tab.goto(responseUrl, { waitUntil: 'domcontentloaded' });
      this.openedCount += 1;
      this.opened.push({
        vacancyId: vacancy.id,
        title: vacancy.title,
        url: responseUrl,
        opened: true,
      });

      try {
        this.repository.markManualOpened(vacancy.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Не удалось записать manual_opened_at (${message}): ${vacancy.id}`);
      }

      logger.info(`Открыл вкладку для ручного заполнения анкеты: ${responseUrl}`);
    } catch (error) {
      this.opened.push({
        vacancyId: vacancy.id,
        title: vacancy.title,
        url: responseUrl,
        opened: false,
        reason: 'open_failed',
      });
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Не удалось открыть вкладку с анкетой (${message}): ${responseUrl}`);
    }
  }
}
