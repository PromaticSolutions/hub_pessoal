import { AppError } from '../lib/errors'

/** Validates a storage key (see Storage); returns it unchanged. */
export function checkKey(key: string): string {
  // eslint-disable-next-line no-control-regex
  const bad = !key || key.startsWith('/') || /[\\\x00-\x1f]/.test(key) || key.split('/').some((s) => s === '' || s === '.' || s === '..')
  if (bad) throw new AppError('VALIDATION', 'Caminho de arquivo inválido.')
  return key
}
