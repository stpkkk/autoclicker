export type TemplateKind = 'frontend' | 'fullstack';

export interface CoverLetterTemplates {
  frontend: string;
  fullstack: string;
}

export interface ResumeByTemplate {
  frontend: string;
  fullstack: string;
}

export interface ApplicationChoice {
  templateKind: TemplateKind;
  template: string;
  resumeName: string;
}

export interface TemplateVars {
  vacancy_name: string;
  employer_name: string;
}

/**
 * Fullstack-шаблон выбираем, если в названии вакансии есть fullstack/full-stack,
 * Node.js/NodeJS/Nest.js/NestJS. Во всех остальных случаях — frontend.
 */
export const FULLSTACK_TITLE_PATTERN =
  /(?:\bfull[\s-]?stack\b|\bnode(?:\.?js)?\b|\bnest(?:\.?js)?\b)/iu;

export function pickTemplate(title: string): TemplateKind {
  return FULLSTACK_TITLE_PATTERN.test(title) ? 'fullstack' : 'frontend';
}

/**
 * Один общий выбор для письма и резюме: вид вакансии определяется `pickTemplate`,
 * поэтому правило не дублируется. Явное название резюме (--resume) важнее конфига.
 */
export function pickApplicationChoice(
  title: string,
  templates: CoverLetterTemplates,
  resumeByTemplate: ResumeByTemplate,
  resumeOverride?: string,
): ApplicationChoice {
  const templateKind = pickTemplate(title);
  const overrideName = resumeOverride?.trim();

  return {
    templateKind,
    template: templates[templateKind],
    resumeName: overrideName ? overrideName : resumeByTemplate[templateKind],
  };
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{\s*(vacancy_name|employer_name)\s*\}\}/g, (_match, key: string) => {
      return vars[key as keyof TemplateVars];
    })
    .trim();
}
