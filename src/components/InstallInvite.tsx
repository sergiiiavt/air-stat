import { useEffect, useRef, useState } from 'react';
import type { Language } from '../i18n';
import { readBrowserStorage, writeBrowserStorage } from '../theme';

type BrowserInstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type InstallWindow = Window & { __airAlertInstallPrompt?: BrowserInstallEvent | null };

const DISMISS_KEY = 'air-alert-install-dismissed-at';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const WAIT_MS = 8_000;

const copy = {
  uk: {
    title: 'Додати Air Alert Stat на телефон?',
    details: 'Це той самий сайт: іконка на екрані та відкриття без вкладок браузера.',
    note: 'Встановлення необов’язкове. Не потрібно завантажувати APK чи надавати додаткові дозволи.',
    install: 'Встановити',
    later: 'Не зараз',
  },
  en: {
    title: 'Add Air Alert Stat to your phone?',
    details: 'It is the same website, with a home-screen icon and a separate window.',
    note: 'Optional. No APK download or extra permissions are needed.',
    install: 'Install',
    later: 'Not now',
  },
} as const;

function isSnoozed() {
  const dismissedAt = Number(readBrowserStorage(DISMISS_KEY));
  return dismissedAt > 0 && dismissedAt <= Date.now() && Date.now() - dismissedAt < SNOOZE_MS;
}

export function InstallInvite({ language }: { language: Language }) {
  const [installEvent, setInstallEvent] = useState<BrowserInstallEvent | null>(null);
  const suppressed = useRef(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    let timer: number | undefined;
    const refresh = () => {
      if (suppressed.current || isSnoozed() || timer !== undefined) return;
      if (!(window as InstallWindow).__airAlertInstallPrompt) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (!suppressed.current && !isSnoozed()) {
          setInstallEvent((window as InstallWindow).__airAlertInstallPrompt ?? null);
        }
      }, WAIT_MS);
    };
    const installed = () => {
      suppressed.current = true;
      setInstallEvent(null);
    };
    window.addEventListener('air-alert-install-ready', refresh);
    window.addEventListener('air-alert-installed', installed);
    refresh();
    return () => {
      window.removeEventListener('air-alert-install-ready', refresh);
      window.removeEventListener('air-alert-installed', installed);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    suppressed.current = true;
    writeBrowserStorage(DISMISS_KEY, String(Date.now()));
    setInstallEvent(null);
  };

  const install = () => {
    if (!installEvent) return;
    suppressed.current = true;
    setInstallEvent(null);
    (window as InstallWindow).__airAlertInstallPrompt = null;
    try {
      void installEvent
        .prompt()
        .then(() => installEvent.userChoice)
        .then((choice) => {
          if (choice.outcome !== 'accepted') writeBrowserStorage(DISMISS_KEY, String(Date.now()));
        })
        .catch(() => writeBrowserStorage(DISMISS_KEY, String(Date.now())));
    } catch {
      writeBrowserStorage(DISMISS_KEY, String(Date.now()));
    }
  };

  if (!installEvent) return null;
  const t = copy[language];
  return (
    <aside className="install-invite" aria-labelledby="install-invite-title">
      <div className="install-invite__copy">
        <strong id="install-invite-title">{t.title}</strong>
        <p>{t.details}</p>
        <p className="install-invite__note">{t.note}</p>
      </div>
      <div className="install-invite__actions">
        <button type="button" className="install-invite__later" onClick={dismiss}>
          {t.later}
        </button>
        <button type="button" className="install-invite__install" onClick={install}>
          {t.install}
        </button>
      </div>
    </aside>
  );
}
