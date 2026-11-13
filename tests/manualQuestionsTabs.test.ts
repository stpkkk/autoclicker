import type { BrowserContext, Page } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationRepository } from '../src/db/index.js';
import { ManualQuestionTabs } from '../src/hh/manualQuestions.js';
import type { Vacancy } from '../src/types.js';

function vacancy(id: string): Vacancy {
  return {
    id,
    title: `Вакансия ${id}`,
    company: 'Acme',
    url: `https://hh.ru/vacancy/${id}`,
  };
}

function createPage(): Page {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isClosed: vi.fn().mockReturnValue(false),
  } as unknown as Page;
}

function createContext(): { context: BrowserContext; newPage: ReturnType<typeof vi.fn> } {
  const newPage = vi.fn(async () => createPage());
  return {
    context: { newPage } as unknown as BrowserContext,
    newPage,
  };
}

function createRepository(alreadyOpened = false): {
  repository: ApplicationRepository;
  markManualOpened: ReturnType<typeof vi.fn>;
} {
  const markManualOpened = vi.fn();
  return {
    repository: {
      hasManualOpened: vi.fn(() => alreadyOpened),
      markManualOpened,
    } as unknown as ApplicationRepository,
    markManualOpened,
  };
}

describe('ManualQuestionTabs', () => {
  it('открывает вкладку и запоминает её в БД', async () => {
    const { context, newPage } = createContext();
    const { repository, markManualOpened } = createRepository();
    const tabs = new ManualQuestionTabs(
      context,
      { open_in_new_tab: true, max_open_tabs: 5 },
      repository,
    );

    await tabs.open(vacancy('1'), 'https://hh.ru/applicant/vacancy_response?vacancyId=1');

    expect(newPage).toHaveBeenCalledTimes(1);
    expect(markManualOpened).toHaveBeenCalledWith('1');
    expect(tabs.entries).toEqual([
      {
        vacancyId: '1',
        title: 'Вакансия 1',
        url: 'https://hh.ru/applicant/vacancy_response?vacancyId=1',
        opened: true,
      },
    ]);
  });

  it('после max_open_tabs не открывает вкладку, но добавляет ссылку в список', async () => {
    const { context, newPage } = createContext();
    const { repository, markManualOpened } = createRepository();
    const tabs = new ManualQuestionTabs(
      context,
      { open_in_new_tab: true, max_open_tabs: 1 },
      repository,
    );

    await tabs.open(vacancy('1'), 'https://hh.ru/applicant/vacancy_response?vacancyId=1');
    await tabs.open(vacancy('2'), 'https://hh.ru/applicant/vacancy_response?vacancyId=2');

    expect(newPage).toHaveBeenCalledTimes(1);
    expect(markManualOpened).toHaveBeenCalledTimes(1);
    expect(tabs.entries).toHaveLength(2);
    expect(tabs.entries[1]).toMatchObject({
      vacancyId: '2',
      opened: false,
      reason: 'limit',
    });
  });

  it('не открывает вкладку повторно для уже отмеченной вакансии', async () => {
    const { context, newPage } = createContext();
    const { repository, markManualOpened } = createRepository(true);
    const tabs = new ManualQuestionTabs(
      context,
      { open_in_new_tab: true, max_open_tabs: 5 },
      repository,
    );

    await tabs.open(vacancy('1'), 'https://hh.ru/applicant/vacancy_response?vacancyId=1');

    expect(newPage).not.toHaveBeenCalled();
    expect(markManualOpened).not.toHaveBeenCalled();
    expect(tabs.entries).toEqual([]);
  });

  it('ничего не делает, если open_in_new_tab выключен', async () => {
    const { context, newPage } = createContext();
    const { repository } = createRepository();
    const tabs = new ManualQuestionTabs(
      context,
      { open_in_new_tab: false, max_open_tabs: 5 },
      repository,
    );

    await tabs.open(vacancy('1'), 'https://hh.ru/applicant/vacancy_response?vacancyId=1');

    expect(newPage).not.toHaveBeenCalled();
    expect(tabs.entries).toEqual([]);
  });
});
