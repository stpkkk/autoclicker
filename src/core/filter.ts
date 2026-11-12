import type { FilterResult, Vacancy } from '../types.js';

export interface FilterSettings {
  title_stop_words: readonly string[];
  requirements_stop_words: readonly string[];
  requirements_stop_min_hits: number;
  must_have_any: readonly string[];
  skip_relocation: boolean;
  allowed_cities?: readonly string[];
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const RELOCATION_PATTERN = /(?:релокац|переезд|relocat)/iu;

const REQUIREMENTS_HEADING =
  /^(?:требования(?:\s+к\s+кандидату)?|мы\s+ожидаем(?:\s+от\s+кандидата)?|ожидаем\s+от\s+кандидата|наши\s+ожидания|кого\s+(?:мы\s+)?ищем|наш\s+идеальный\s+кандидат|идеальный\s+кандидат|кандидат\s+должен|что\s+нужно\s+знать|что\s+нужно\s+уметь|что\s+мы\s+жд[её]м(?:\s+от\s+кандидата)?|вам\s+(?:нужно|понадобится)|необходимые\s+навыки|ключевые\s+навыки|профессиональные\s+навыки|requirements|we\s+expect|what\s+we\s+expect|what\s+you\s+need|what\s+you(?:'|’|`)?ll\s+need|you\s+should\s+have|qualifications|skills|must[\s-]have)$/iu;

const SECTION_HEADING =
  /^(?:обязанности|задачи|чем\s+предстоит\s+заниматься|что\s+предстоит\s+делать|условия(?:\s+работы)?|мы\s+предлагаем|что\s+мы\s+предлагаем|что\s+предлагаем|о\s+компании|о\s+проекте|о\s+нас|о\s+команде|стек(?:\s+технологий)?|технологии|используемые\s+технологии|плюсы|будет\s+плюсом|дополнительно|бонусы|benefits|responsibilities|about(?:\s+us|\s+the\s+company|\s+the\s+project|\s+the\s+team)?|we\s+offer|what\s+we\s+offer|stack|tech\s+stack|preferred|nice[\s-]to[\s-]have|as\s+a\s+plus)$/iu;

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

function findTerms(text: string, terms: readonly string[]): string[] {
  const found: string[] = [];
  for (const term of terms) {
    if (findTerm(text, term) && !found.includes(term)) {
      found.push(term);
    }
  }
  return found;
}

interface SectionHeading {
  kind: 'requirements' | 'other';
  rest: string;
}

function parseSectionHeading(line: string): SectionHeading | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const withoutMarker = trimmed
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(?:[-*•·–—]|\d{1,2}[.)])\s+/, '');
  const colonIndex = withoutMarker.search(/[:：]/);
  const head = (colonIndex >= 0 ? withoutMarker.slice(0, colonIndex) : withoutMarker)
    .trim()
    .replace(/\s+/g, ' ');
  const normalized = head.toLowerCase().replace(/[\s:：]+$/, '');
  if (!normalized || normalized.length > 80) {
    return null;
  }

  const rest = colonIndex >= 0 ? withoutMarker.slice(colonIndex + 1).trim() : '';
  if (REQUIREMENTS_HEADING.test(normalized)) {
    return { kind: 'requirements', rest };
  }
  if (SECTION_HEADING.test(normalized)) {
    return { kind: 'other', rest };
  }
  return null;
}

/**
 * Возвращает текст раздела требований: от заголовка («Требования», «Мы ожидаем»,
 * «Requirements» и т.п.) до следующего заголовка. Если раздела нет — undefined,
 * чтобы фильтр не проверял стоп-слова по всему описанию.
 */
export function extractRequirementsSection(description: string): string | undefined {
  if (!description.trim()) {
    return undefined;
  }

  let collecting = false;
  const parts: string[] = [];

  for (const line of description.split(/\r?\n/)) {
    const heading = parseSectionHeading(line);

    if (heading) {
      if (collecting) {
        if (heading.kind === 'requirements') {
          if (heading.rest) {
            parts.push(heading.rest);
          }
          continue;
        }
        break;
      }

      if (heading.kind === 'requirements') {
        collecting = true;
        if (heading.rest) {
          parts.push(heading.rest);
        }
      }
      continue;
    }

    if (collecting) {
      parts.push(line);
    }
  }

  return collecting ? parts.join('\n').trim() : undefined;
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

  const titleStopWord = findAnyTerm(title, settings.title_stop_words);
  if (titleStopWord) {
    return { ok: false, reason: `stop_word:${titleStopWord} (title)` };
  }

  const requirements = extractRequirementsSection(description);
  if (
    requirements !== undefined &&
    settings.requirements_stop_words.length > 0 &&
    settings.requirements_stop_min_hits > 0
  ) {
    const stopHits = findTerms(requirements, settings.requirements_stop_words);
    if (stopHits.length >= settings.requirements_stop_min_hits) {
      const mustHaveHits = findTerms(requirements, settings.must_have_any);
      if (mustHaveHits.length <= stopHits.length) {
        return { ok: false, reason: `stop_word:${stopHits[0]} (requirements)` };
      }
    }
  }

  const titleAndDescription = `${title}\n${description}`;
  if (settings.must_have_any.length > 0) {
    const mustHave = findAnyTerm(titleAndDescription, settings.must_have_any);
    if (!mustHave) {
      return { ok: false, reason: 'no_must_have' };
    }
  }

  return checkRelocation(vacancy, settings);
}
