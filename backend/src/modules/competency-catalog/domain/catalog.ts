import type { Metadata } from '../../../shared/application/dataset-contracts';

export interface GradeView { id: string; roleId: string; name: string; position: number; translations?: Metadata }
export function localized(source: string, translations: unknown, locale: string, field: string): string {
  if (typeof translations !== 'object' || translations === null) return source;
  const entries = translations as Record<string, unknown>;
  for (const language of [locale, 'en']) {
    const value = entries[language];
    if (typeof value === 'string' && (field === 'name' || field === 'title')) return value;
    if (value && typeof value === 'object' && typeof (value as Record<string, unknown>)[field] === 'string') return (value as Record<string, string>)[field];
  }
  return source;
}
