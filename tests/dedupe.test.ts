import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationRepository, initializeDatabase, type Db } from '../src/db/index.js';
import type { Vacancy } from '../src/types.js';

function vacancy(id: string, title = 'React Developer'): Vacancy {
  return {
    id,
    title,
    company: 'Acme',
    url: `https://hh.ru/vacancy/${id}`,
  };
}

describe('ApplicationRepository: дедупликация по vacancy_id', () => {
  let db: Db;
  let repository: ApplicationRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    repository = new ApplicationRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('повторный planned не создаёт дубликат', () => {
    repository.markPlanned(vacancy('1'), 'frontend');
    repository.markPlanned(vacancy('1'), 'frontend');

    expect(repository.get('1')?.status).toBe('planned');
    expect(repository.stats('all').planned).toBe(1);
  });

  it('повторный skipped обновляет причину, но не создаёт дубликат', () => {
    repository.markSkipped(vacancy('2'), 'stop_word:PHP');
    repository.markSkipped(vacancy('2'), 'needs_questions');

    expect(repository.get('2')?.status).toBe('skipped');
    expect(repository.get('2')?.reason).toBe('needs_questions');
    expect(repository.stats('all').skipped).toBe(1);
  });

  it('sent не понижается до skipped/planned при повторном запуске', () => {
    repository.markSent(vacancy('3'), 'fullstack');
    repository.markSkipped(vacancy('3'), 'already_applied');
    repository.markPlanned(vacancy('3'), 'frontend');

    const record = repository.get('3');
    expect(record?.status).toBe('sent');
    expect(record?.templateUsed).toBe('fullstack');
    expect(repository.hasSent('3')).toBe(true);
  });

  it('считает sent за сегодня и не считает planned/skipped', () => {
    repository.markSent(vacancy('4'));
    repository.markSent(vacancy('5'));
    repository.markPlanned(vacancy('6'));
    repository.markSkipped(vacancy('7'), 'filtered');

    expect(repository.countSentToday()).toBe(2);
    expect(repository.stats('today')).toEqual({
      planned: 1,
      sent: 2,
      skipped: 1,
      error: 0,
    });
  });

  it('разные vacancy_id дают разные записи', () => {
    repository.markSkipped(vacancy('8'), 'no_must_have');
    repository.markSkipped(vacancy('9'), 'no_must_have');

    expect(repository.stats('all').skipped).toBe(2);
  });
});
