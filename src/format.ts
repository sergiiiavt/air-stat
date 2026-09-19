import type { Language } from './i18n';

export function formatDuration(seconds: number, language: Language) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (language === 'uk') {
    return hours ? `${hours} год ${String(remainder).padStart(2, '0')} хв` : `${minutes} хв`;
  }

  return hours ? `${hours}h ${String(remainder).padStart(2, '0')}m` : `${minutes}m`;
}
