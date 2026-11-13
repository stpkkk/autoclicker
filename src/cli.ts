#!/usr/bin/env node
import { Command } from 'commander';
import type { Page } from 'playwright';
import { AuthRequiredError, HardStopError } from './browser/guards.js';
import {
  type BrowserSession,
  dismissCookieBanner,
  HH_HOME_URL,
  openSession,
} from './browser/session.js';
import { ConfigError, loadConfig } from './config/load.js';
import type { AppConfig } from './config/schema.js';
import { filterVacancy } from './core/filter.js';
import { ApplicationRepository, openDatabase } from './db/index.js';
import { checkSession } from './hh/account.js';
import { runApply } from './hh/applyFlow.js';
import { runDoctor } from './hh/doctor.js';
import { collectAllVacancies } from './hh/search.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('hh-autoapply')
  .description('Автоматизация откликов на hh.ru через браузер. Только ручной вход.')
  .version('0.1.0')
  .option('--config <path>', 'путь к config.yaml', 'config.yaml');

async function getConfig(): Promise<AppConfig> {
  const configPath = String(program.opts<{ config?: string }>().config ?? 'config.yaml');
  return loadConfig(configPath);
}

async function withSession(fn: (page: Page) => Promise<void>): Promise<void> {
  const session = await openSession();
  try {
    await fn(session.page);
  } finally {
    await session.close();
  }
}

/**
 * Ждёт, пока человек закроет окно браузера с ручными вкладками.
 * Ctrl+C тоже завершает ожидание и корректно закрывает контекст.
 */
async function waitForBrowserClose(session: BrowserSession): Promise<void> {
  const browser = session.context.browser();
  if (browser && !browser.isConnected()) {
    return;
  }

  await new Promise<void>((resolve) => {
    const onSigint = () => {
      void session.close().finally(() => resolve());
    };
    const onClose = () => {
      process.removeListener('SIGINT', onSigint);
      resolve();
    };

    process.once('SIGINT', onSigint);
    session.context.once('close', onClose);
  });
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      logger.error(error.message);
      process.exitCode = 2;
      return;
    }
    if (error instanceof HardStopError) {
      logger.error(`Остановка (${error.kind}): ${error.message}`);
      process.exitCode = 3;
      return;
    }
    if (error instanceof ConfigError) {
      logger.error(error.message);
      process.exitCode = 1;
      return;
    }
    logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  }
}

program
  .command('login')
  .description('Открыть headed-браузер для ручного входа на hh.ru')
  .action(async () => {
    await run(async () => {
      const session = await openSession();
      try {
        await session.page.goto(HH_HOME_URL, { waitUntil: 'domcontentloaded' });
        await dismissCookieBanner(session.page);

        logger.info('Открыт браузер. Войдите на hh.ru вручную (включая SMS/капчу).');
        logger.info('Логин и пароль приложение не запрашивает и не хранит.');
        logger.info('После входа просто закройте окно браузера — сессия сохранится.');

        await new Promise<void>((resolve) => {
          const onSigint = () => {
            void session.close().finally(() => resolve());
          };
          const onClose = () => {
            process.removeListener('SIGINT', onSigint);
            resolve();
          };
          process.once('SIGINT', onSigint);
          session.context.once('close', onClose);
        });

        logger.info('Окно закрыто. Профиль сохранён в .browser-profile/');
      } finally {
        await session.close();
      }
    });
  });

program
  .command('check')
  .description('Проверить, что сессия активна и резюме доступно')
  .action(async () => {
    await run(async () => {
      await withSession(async (page) => {
        const result = await checkSession(page);
        if (!result.authenticated) {
          logger.error('Сессия не активна. Запустите `hh-autoapply login` и войдите вручную.');
          process.exitCode = 2;
          return;
        }

        if (result.resumes.length === 0) {
          logger.warn('Вход выполнен, но резюме не найдено. Проверьте профиль hh.ru.');
          process.exitCode = 1;
          return;
        }

        logger.info(`Сессия активна. Найдено резюме: ${result.resumes.length}`);
        for (const resume of result.resumes) {
          console.log(`  - ${resume}`);
        }
      });
    });
  });

program
  .command('doctor')
  .description('Проверить селекторы на реальных страницах hh.ru')
  .action(async () => {
    await run(async () => {
      const config = await getConfig();
      await withSession(async (page) => {
        await runDoctor(page, config);
      });
    });
  });

program
  .command('search')
  .description('Собрать вакансии, применить фильтры и вывести таблицу')
  .action(async () => {
    await run(async () => {
      const config = await getConfig();
      await withSession(async (page) => {
        const vacancies = await collectAllVacancies(page, config);
        let passed = 0;
        let skipped = 0;

        const rows = vacancies.map((vacancy) => {
          const result = filterVacancy(vacancy, config.filters);
          if (result.ok) {
            passed += 1;
          } else {
            skipped += 1;
          }
          return {
            Название: vacancy.title,
            Компания: vacancy.company || '—',
            Зарплата: vacancy.salary || '—',
            Ссылка: vacancy.url,
            Пропуск: result.ok ? '' : (result.reason ?? ''),
          };
        });

        if (rows.length === 0) {
          logger.info('Вакансий не найдено.');
          return;
        }

        console.table(rows);
        logger.info(`Всего: ${rows.length}, прошли фильтр: ${passed}, пропущено: ${skipped}`);
        logger.info('Описание проверяется полностью на этапе apply, когда открыта вакансия.');
      });
    });
  });

program
  .command('apply')
  .description('Открыть вакансии и откликнуться (по умолчанию dry-run)')
  .option('--send', 'реально отправить отклики', false)
  .option('--limit <number>', 'лимит откликов за запуск', (value) => Number.parseInt(value, 10))
  .option('--resume <name>', 'название резюме для выбора в форме отклика')
  .action(async (options: { send?: boolean; limit?: number; resume?: string }) => {
    await run(async () => {
      const config = await getConfig();
      const db = openDatabase();
      const repository = new ApplicationRepository(db);

      try {
        const session = await openSession();
        try {
          const summary = await runApply(session.page, config, repository, {
            send: options.send === true,
            limit: options.limit,
            resumeName: options.resume,
          });

          if (summary.manualTabs.length > 0) {
            logger.info('Ссылки на анкеты для ручного заполнения:');
            for (const entry of summary.manualTabs) {
              const label = entry.opened
                ? 'открыта'
                : entry.reason === 'limit'
                  ? 'лимит вкладок'
                  : 'не открыта';
              console.log(`  - [${label}] ${entry.title}: ${entry.url}`);
            }
          }

          if (summary.manualTabsOpen) {
            logger.info('Заполните анкеты и закройте окно браузера');
            await waitForBrowserClose(session);
          }
        } finally {
          await session.close();
        }
      } finally {
        db.close();
      }
    });
  });

program
  .command('stats')
  .description('Статистика откликов за сегодня/неделю/всё время')
  .action(async () => {
    await run(async () => {
      const db = openDatabase();
      const repository = new ApplicationRepository(db);

      try {
        console.table([
          { Период: 'Сегодня', ...repository.stats('today') },
          { Период: 'Неделя', ...repository.stats('week') },
          { Период: 'Всё время', ...repository.stats('all') },
        ]);
      } finally {
        db.close();
      }
    });
  });

await program.parseAsync(process.argv);
