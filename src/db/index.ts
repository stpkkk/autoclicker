import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  ApplicationRecord,
  ApplicationStatus,
  StatsByStatus,
  StatsPeriod,
  Vacancy,
} from '../types.js';

export type Db = Database.Database;

export const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'hh-autoapply.db');

const STATUSES: ApplicationStatus[] = ['planned', 'sent', 'skipped', 'error'];

interface ApplicationRow {
  vacancy_id: string;
  title: string;
  company: string;
  url: string;
  status: ApplicationStatus;
  reason: string | null;
  template_used: string | null;
  created_at: string;
  sent_at: string | null;
}

interface CountRow {
  status: ApplicationStatus;
  count: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyStats(): StatsByStatus {
  return { planned: 0, sent: 0, skipped: 0, error: 0 };
}

export function initializeDatabase(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      vacancy_id    TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      company       TEXT NOT NULL DEFAULT '',
      url           TEXT NOT NULL,
      status        TEXT NOT NULL CHECK (status IN ('planned', 'sent', 'skipped', 'error')),
      reason        TEXT,
      template_used TEXT,
      created_at    TEXT NOT NULL,
      sent_at       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_applications_status_created
      ON applications(status, created_at);
  `);
}

export function openDatabase(dbPath = DEFAULT_DB_PATH): Db {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initializeDatabase(db);
  return db;
}

/**
 * Репозиторий откликов.
 *
 * Дедупликация — по vacancy_id (PRIMARY KEY). Повторный dry-run/apply обновляет
 * существующую запись, но никогда не понижает статус sent до planned/skipped.
 */
export class ApplicationRepository {
  constructor(private readonly db: Db) {}

  get(vacancyId: string): ApplicationRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM applications WHERE vacancy_id = ?')
      .get(vacancyId) as ApplicationRow | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  hasSent(vacancyId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 AS found FROM applications WHERE vacancy_id = ? AND status = 'sent'")
      .get(vacancyId) as { found: number } | undefined;
    return row !== undefined;
  }

  markPlanned(vacancy: Vacancy, templateUsed?: string): void {
    this.upsert(vacancy, 'planned', undefined, templateUsed, undefined);
  }

  markSkipped(vacancy: Vacancy, reason: string): void {
    this.upsert(vacancy, 'skipped', reason, undefined, undefined);
  }

  markError(vacancy: Vacancy, reason: string): void {
    this.upsert(vacancy, 'error', reason, undefined, undefined);
  }

  markSent(vacancy: Vacancy, templateUsed?: string): void {
    this.upsert(vacancy, 'sent', undefined, templateUsed, nowIso());
  }

  countSentToday(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM applications
         WHERE status = 'sent'
           AND date(COALESCE(sent_at, created_at), 'localtime') = date('now', 'localtime')`,
      )
      .get() as { count: number };
    return row.count;
  }

  stats(period: StatsPeriod): StatsByStatus {
    const result = emptyStats();
    let where = '';

    if (period === 'today') {
      where = "WHERE date(COALESCE(sent_at, created_at), 'localtime') = date('now', 'localtime')";
    } else if (period === 'week') {
      where =
        "WHERE date(COALESCE(sent_at, created_at), 'localtime') >= date('now', 'localtime', '-6 days')";
    }

    const rows = this.db
      .prepare(`SELECT status, COUNT(*) AS count FROM applications ${where} GROUP BY status`)
      .all() as CountRow[];

    for (const row of rows) {
      if (STATUSES.includes(row.status)) {
        result[row.status] = row.count;
      }
    }

    return result;
  }

  private upsert(
    vacancy: Vacancy,
    status: ApplicationStatus,
    reason: string | undefined,
    templateUsed: string | undefined,
    sentAt: string | undefined,
  ): void {
    this.db
      .prepare(
        `INSERT INTO applications
           (vacancy_id, title, company, url, status, reason, template_used, created_at, sent_at)
         VALUES
           (@vacancyId, @title, @company, @url, @status, @reason, @templateUsed, @createdAt, @sentAt)
         ON CONFLICT(vacancy_id) DO UPDATE SET
           title = excluded.title,
           company = excluded.company,
           url = excluded.url,
           status = CASE
             WHEN applications.status = 'sent' THEN 'sent'
             ELSE excluded.status
           END,
           reason = CASE
             WHEN applications.status = 'sent' THEN applications.reason
             ELSE excluded.reason
           END,
           template_used = CASE
             WHEN applications.status = 'sent' THEN applications.template_used
             ELSE excluded.template_used
           END,
           sent_at = CASE
             WHEN applications.status = 'sent' THEN applications.sent_at
             ELSE excluded.sent_at
           END`,
      )
      .run({
        vacancyId: vacancy.id,
        title: vacancy.title,
        company: vacancy.company,
        url: vacancy.url,
        status,
        reason: reason ?? null,
        templateUsed: templateUsed ?? null,
        createdAt: nowIso(),
        sentAt: sentAt ?? null,
      });
  }

  private mapRow(row: ApplicationRow): ApplicationRecord {
    return {
      vacancyId: row.vacancy_id,
      title: row.title,
      company: row.company,
      url: row.url,
      status: row.status,
      reason: row.reason ?? undefined,
      templateUsed: row.template_used ?? undefined,
      createdAt: row.created_at,
      sentAt: row.sent_at ?? undefined,
    };
  }
}
