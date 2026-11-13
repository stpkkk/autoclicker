import { z } from 'zod';

export const hhScheduleValues = ['remote', 'fullDay', 'shift', 'flexible', 'flyInFlyOut'] as const;
export const hhExperienceValues = [
  'noExperience',
  'between1And3',
  'between3And6',
  'moreThan6',
] as const;

const coverLetterSchema = z
  .object({
    templates: z
      .object({
        frontend: z.string().trim().min(1, 'Шаблон frontend не должен быть пустым'),
        fullstack: z.string().trim().min(1, 'Шаблон fullstack не должен быть пустым'),
      })
      .strict(),
  })
  .strict();

const resumeByTemplateSchema = z
  .object({
    frontend: z.string().trim().min(1, 'Резюме frontend не должно быть пустым'),
    fullstack: z.string().trim().min(1, 'Резюме fullstack не должно быть пустым'),
  })
  .strict();

export const configSchema = z
  .object({
    search: z
      .object({
        queries: z.array(z.string().trim().min(1)).min(1, 'Добавьте хотя бы один поисковый запрос'),
        area: z.number().int().positive().default(113),
        schedule: z.enum(hhScheduleValues).default('remote'),
        experience: z.enum(hhExperienceValues).default('between3And6'),
        salary: z.number().int().positive().optional(),
        only_with_salary: z.boolean().default(false),
        period: z.number().int().min(1).max(30).default(7),
        max_pages_per_query: z.number().int().min(1).max(20).default(3),
      })
      .strict(),
    filters: z
      .object({
        title_stop_words: z.array(z.string().trim().min(1)).default([]),
        requirements_stop_words: z.array(z.string().trim().min(1)).default([]),
        requirements_stop_min_hits: z.number().int().min(1).default(2),
        must_have_any: z.array(z.string().trim().min(1)).default([]),
        skip_relocation: z.boolean().default(true),
        allowed_cities: z.array(z.string().trim().min(1)).default([]),
      })
      .strict(),
    limits: z
      .object({
        daily_limit: z.number().int().min(1).max(100).default(30),
        delay_ms_min: z.number().int().min(1000).default(5000),
        delay_ms_max: z.number().int().min(1000).default(25000),
      })
      .strict()
      .refine((value) => value.delay_ms_min <= value.delay_ms_max, {
        message: 'delay_ms_min не может быть больше delay_ms_max',
        path: ['delay_ms_min'],
      }),
    cover_letter: coverLetterSchema,
    resume_by_template: resumeByTemplateSchema,
  })
  .strict();

export type AppConfig = z.infer<typeof configSchema>;
