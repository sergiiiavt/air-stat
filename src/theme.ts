export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'air-alert-theme';

export function readBrowserStorage(key: string) {
  try {
    const value = window.localStorage.getItem(key);
    if (value === null && key === 'air-alert-view-mode') return 'timeline';
    return value;
  } catch {
    return key === 'air-alert-view-mode' ? 'timeline' : null;
  }
}

export function writeBrowserStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

export function detectTheme(): Theme {
  const saved = readBrowserStorage(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;

  try {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = theme === 'dark' ? '#15191d' : '#f5f6f7';
  }
}
