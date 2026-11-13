import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationRepository, initializeDatabase, type Db } from '../src/db/index.js';
import type { Vacancy } from '../src/types.js';

function vacancy(id: string): Vacancy {
  return {
    id,
    title: 'Frontend Developer',
    company: 'Acme',
    url: `https://hh.ru/vacancy/${id}`,
  };
}

describe('manual_opened_at', () => {
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

  it('запоминает, что ручная вкладка уже открывалась', () => {
    repository.markSkipped(vacancy('1'), 'needs_questions');
    expect(repository.hasManualOpened('1')).toBe(false);

    repository.markManualOpened('1');

    expect(repository.hasManualOpened('1')).toBe(true);
    expect(repository.get('1')?.manualOpenedAt).toBeTruthy();
    expect(repository.get('1')?.status).toBe('skipped');
    expect(repository.get('1')?.reason).toBe('needs_questions');
  });

  it('повторный skipped не сбрасывает manual_opened_at', () => {
    repository.markSkipped(vacancy('2'), 'needs_questions');
    repository.markManualOpened('2');

    repository.markSkipped(vacancy('2'), 'needs_questions');

    expect(repository.hasManualOpened('2')).toBe(true);
  });

  it('добавляет колонку в старую базу', () => {
    db.close();
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE applications (
        vacancy_id    TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        company       TEXT NOT NULL DEFAULT '',
        url           TEXT NOT NULL,
        status        TEXT NOT NULL,
        reason        TEXT,
        template_used TEXT,
        created_at    TEXT NOT NULL,
        sent_at       TEXT
      );
    `);

    initializeDatabase(db);

    const columns = db.prepare('PRAGMA table_info(applications)').all() as { name: string }[];
    expect(columns.some((column) => column.name === 'manual_opened_at')).toBe(true);
  });
});
