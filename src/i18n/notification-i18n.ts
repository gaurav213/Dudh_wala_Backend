import { readFileSync } from 'fs';
import { join } from 'path';

type CatalogEntry = { title: string; body: string };
type Catalog = Record<string, CatalogEntry>;

const cache = new Map<string, Catalog>();

function loadCatalog(lang: string): Catalog {
  const code = ['hi', 'mr'].includes(lang) ? lang : 'en';
  const hit = cache.get(code);
  if (hit) return hit;
  const path = join(__dirname, 'notifications', `${code}.json`);
  const data = JSON.parse(readFileSync(path, 'utf8')) as Catalog;
  cache.set(code, data);
  return data;
}

function interpolate(
  template: string,
  params?: Record<string, string | number | null | undefined>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    return v === null || v === undefined ? '' : String(v);
  });
}

/** Resolve notification title/body for a language. Falls back to English, then input fallbacks. */
export function renderNotification(
  lang: string | null | undefined,
  messageKey: string | undefined,
  params: Record<string, string | number | null | undefined> | undefined,
  fallback: { title: string; body: string },
): { title: string; body: string } {
  if (!messageKey) return fallback;
  const primary = loadCatalog(lang ?? 'en')[messageKey];
  const en = loadCatalog('en')[messageKey];
  const entry = primary ?? en;
  if (!entry) return fallback;
  return {
    title: interpolate(entry.title, params),
    body: interpolate(entry.body, params),
  };
}

export function normalizeLang(raw?: string | null): 'en' | 'hi' | 'mr' {
  const c = (raw ?? 'en').toLowerCase();
  if (c.startsWith('hi')) return 'hi';
  if (c.startsWith('mr')) return 'mr';
  return 'en';
}
