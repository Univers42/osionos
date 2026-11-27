import { parseThemeDoc, type ThemeDoc } from '../../../shared/config/themeDoc';
import { MAX_IMPORT_CHARS } from './appearanceTransfer';

export type ThemeImport = { ok: true; doc: ThemeDoc } | { ok: false; message: string };

/**
 * Turns pasted or file text into a theme: size-capped, parsed, then checked by `parseThemeDoc`.
 * The first error issue comes back as `<path>: <message>`.
 */
export function parseThemeImport(text: string): ThemeImport {
  if (text.length > MAX_IMPORT_CHARS) return { ok: false, message: `That is too long: the limit is ${MAX_IMPORT_CHARS} characters.` };
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return { ok: false, message: 'That is not valid JSON.' };
  }
  const { doc, issues } = parseThemeDoc(input);
  const error = issues.find((issue) => issue.severity === 'error');
  if (error) return { ok: false, message: `${error.path.join('.') || 'theme'}: ${error.message}` };
  return doc ? { ok: true, doc } : { ok: false, message: 'theme: not a theme' };
}
