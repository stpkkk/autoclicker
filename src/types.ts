export type ApplicationStatus = 'planned' | 'sent' | 'skipped' | 'error';

export interface Vacancy {
  id: string;
  title: string;
  company: string;
  url: string;
  salary?: string;
  description?: string;
  location?: string;
  remote?: boolean;
  query?: string;
}

export interface ApplicationRecord {
  vacancyId: string;
  title: string;
  company: string;
  url: string;
  status: ApplicationStatus;
  reason?: string;
  templateUsed?: string;
  createdAt: string;
  sentAt?: string;
  manualOpenedAt?: string;
}

export interface FilterResult {
  ok: boolean;
  reason?: string;
}

export type StatsPeriod = 'today' | 'week' | 'all';

export type StatsByStatus = Record<ApplicationStatus, number>;
