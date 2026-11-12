import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { ZodError } from 'zod';
import { configSchema, type AppConfig } from './schema.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const field = issue.path.length > 0 ? issue.path.join('.') : '(корень)';
      return `  - ${field}: ${issue.message}`;
    })
    .join('\n');
}

/**
 * Загружает YAML-конфиг и валидирует его через zod.
 * Ошибки намеренно подробные: конфиг — главный интерфейс управления ботом.
 */
export async function loadConfig(configPath = 'config.yaml'): Promise<AppConfig> {
  const absolutePath = path.resolve(process.cwd(), configPath);

  let raw: string;
  try {
    raw = await readFile(absolutePath, 'utf8');
  } catch {
    throw new ConfigError(
      `Не найден конфиг: ${absolutePath}\n` +
        'Скопируйте config.example.yaml в config.yaml и заполните под себя.',
    );
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Не удалось прочитать YAML (${absolutePath}):\n${message}`);
  }

  try {
    return configSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ConfigError(
        `Конфиг не прошёл валидацию (${absolutePath}):\n${formatZodError(error)}`,
      );
    }
    throw error;
  }
}
