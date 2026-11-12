import type { FilterResult, Vacancy } from '../types.js';

export interface FilterSettings {
  stop_words: readonly string[];
  must_have_any: readonly string[];
  skip_relocation: boolean;
  allowed_cities?: readonly string[];
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const RELOCATION_PATTERN = /(?:релокац|переезд|relocat)/iu;

function normalizeText(input: string): string {
  return input.normalize('NFKC').replace(/[\u00a0\u2007\u202f\u2009]/g, ' ');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Собирает regex с границами слова по Unicode-буквам/цифрам.
 *
 * Это принципиально для пары Java / JavaScript: \b в JS считает "_" словом,
 * а Unicode-буквы (кириллицу) — нет, поэтому используем lookaround.
 * Для терминов с пунктуацией (C#, .NET, Senior+) граница ставится только
 * с той стороны, где есть буква или цифра.
 */
function buildTermRegex(term: string): RegExp {
  const escaped = escapeRegExp(term);
  const first = term.charAt(0);
  const last = term.charAt(term.length - 1);
  const prefix = WORD_CHAR.test(first) ? '(?<![\\p{L}\\p{N}])' : '';
  const suffix = WORD_CHAR.test(last) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(`${prefix}${escaped}${suffix}`, 'iu');
}

export function findTerm(text: string, term: string): boolean {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) {
    return false;
  }
  return buildTermRegex(normalizedTerm).test(normalizeText(text));
}

export function findAnyTerm(text: string, terms: readonly string[]): string | undefined {
  for (const term of terms) {
    if (findTerm(text, term)) {
      return term;
    }
  }
  return undefined;
}

function checkRelocation(vacancy: Vacancy, settings: FilterSettings): FilterResult {
  if (!settings.skip_relocation || vacancy.remote) {
    return { ok: true };
  }

  const location = vacancy.location ?? '';
  const description = vacancy.description ?? '';
  const combined = `${location}\n${description}`;

  if (RELOCATION_PATTERN.test(combined)) {
    return { ok: false, reason: 'relocation' };
  }

  const allowedCities = settings.allowed_cities ?? [];
  if (allowedCities.length > 0 && location.trim() !== '') {
    const cityIsAllowed = allowedCities.some((city) => findTerm(location, city));
    if (!cityIsAllowed) {
      return { ok: false, reason: `city_not_allowed:${location}` };
    }
  }

  return { ok: true };
}

/**
 * Фильтрация вакансии. Одна и та же функция используется и в `search`,
 * и повторно в `apply` — уже на полном описании со страницы вакансии.
 */
export function filterVacancy(vacancy: Vacancy, settings: FilterSettings): FilterResult {
  const title = vacancy.title ?? '';
  const description = vacancy.description ?? '';
  const titleAndDescription = `${title}\n${description}`;

  const stopWord = findAnyTerm(titleAndDescription, settings.stop_words);
  if (stopWord) {
    return { ok: false, reason: `stop_word:${stopWord}` };
  }

  if (settings.must_have_any.length > 0) {
    const mustHave = findAnyTerm(titleAndDescription, settings.must_have_any);
    if (!mustHave) {
      return { ok: false, reason: 'no_must_have' };
    }
  }

  return checkRelocation(vacancy, settings);
}
