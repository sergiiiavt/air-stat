import { translate, type Language } from './i18n';
import type { AlertLevel, AlertLevelSeconds, RangeDay } from './types/domain';

export const alertLevels: AlertLevel[] = ['yellow', 'red', 'unknown'];

export function alertLevelLabel(language: Language, level: AlertLevel) {
  return translate(language, {
    yellow: 'alertLevelYellow', red: 'alertLevelRed', unknown: 'alertLevelUnknown',
  }[level] as 'alertLevelYellow' | 'alertLevelRed' | 'alertLevelUnknown');
}

export function dayLevelSeconds(day: RangeDay): AlertLevelSeconds {
  const levels = day.alertLevelSeconds;
  if (levels && alertLevels.every((level) => Number.isFinite(levels[level]) && levels[level] >= 0) &&
      Math.abs(levels.yellow + levels.red + levels.unknown - day.alertSeconds) < 1) return levels;
  return { yellow: 0, red: 0, unknown: Math.max(0, day.alertSeconds) };
}
