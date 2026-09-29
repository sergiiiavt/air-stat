export function createDateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  const requestedTimeZone = options.timeZone;

  if (requestedTimeZone !== 'Europe/Kyiv') {
    return new Intl.DateTimeFormat(locale, options);
  }

  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'Europe/Kiev' });
    } catch {
      const { timeZone: _ignored, ...fallbackOptions } = options;
      return new Intl.DateTimeFormat(locale, fallbackOptions);
    }
  }
}
